import { loadBundle } from '@poa/config';
import {
  archiveConfiguration,
  databaseReady,
  ExperimentRepository,
  type Pool,
} from '@poa/storage';
import { PoaError } from '@poa/domain';
import { prepareSyntheticM3Execution } from '@poa/experiments';
import type { AccountingReceiptData, ProfileData } from '@poa/schemas';

export async function runFoundationCheck(pool: Pool) {
  const config = loadBundle();
  await databaseReady(pool);
  const archived = await archiveConfiguration(pool, config);
  return {
    jobType: 'CONFIGURATION_CHECK' as const,
    milestone: 'M0' as const,
    bundleHash: config.seal.bundleHash,
    ...archived,
  };
}

const permanent = new Set([
  'POLICY_VIOLATION',
  'UNSUPPORTED_INSTRUMENT',
  'INSUFFICIENT_AVAILABLE_BALANCE',
  'LIMIT_EXCEEDED',
  'LIQUIDITY_UNAVAILABLE',
  'SLIPPAGE_EXCEEDED',
  'EXPIRED',
]);

export interface ActionWorkerHooks {
  afterPlan?: () => Promise<void> | void;
  afterReceipt?: (index: number) => Promise<void> | void;
  now?: () => number;
}

export async function runActionWorkerOnce(
  repository: ExperimentRepository,
  workerId = `worker-${process.pid}`,
  hooks: ActionWorkerHooks = {},
) {
  const job = await repository.claimJob(workerId, 1);
  if (!job) return { status: 'IDLE' as const };
  try {
    const action = await repository.loadExecution(job.actionId);
    if (
      BigInt(action.envelope.request.intent.validUntil) <=
      BigInt(Math.floor((hooks.now?.() ?? Date.now()) / 1000))
    ) {
      await repository.completeAction(job.actionId, 'EXPIRED', ['EXPIRED']);
      return { status: 'EXPIRED' as const, actionId: job.actionId };
    }
    let stored = await repository.loadPlan(job.actionId);
    if (!stored) {
      const bundle = loadBundle();
      const sourceProfile = bundle.bundle.profiles.profiles.find(
        (profile) => profile.profileId === 'ethereum-forward',
      )!;
      const profile: ProfileData =
        action.policy.resultProvenance === 'SYNTHETIC_TEST'
          ? {
              ...structuredClone(sourceProfile),
              profileId: 'synthetic-m3-local',
              enabled: true,
              resultProvenance: 'SYNTHETIC_TEST',
              requiredDependencyIds: [],
            }
          : sourceProfile;
      const usdcAddress = bundle.bundle.networks.networks
        .find((network) => network.networkId === 'ethereum-mainnet')!
        .assets.find((asset) => asset.assetId === 'usdc')!.address!;
      const prepared = await prepareSyntheticM3Execution({
        ...action,
        profile,
        usdcAddress,
      });
      await repository.savePlan(job.actionId, prepared.plan, {
        ...prepared.syntheticInputBundle,
        receipts: prepared.receipts,
      });
      await hooks.afterPlan?.();
      stored = await repository.loadPlan(job.actionId);
    }
    const receipts = (stored.synthetic_input_bundle.receipts ??
      stored.syntheticInputBundle?.receipts) as AccountingReceiptData[];
    for (const [index, receipt] of receipts.entries()) {
      await repository.applyActionReceipt(job.actionId, receipt);
      await hooks.afterReceipt?.(index);
    }
    await repository.completeAction(job.actionId, 'SUCCEEDED');
    return { status: 'SUCCEEDED' as const, actionId: job.actionId };
  } catch (error) {
    if (error instanceof PoaError && permanent.has(error.code)) {
      const applied = await repository.receiptCount(job.actionId);
      await repository.completeAction(
        job.actionId,
        applied ? 'PARTIALLY_SUCCEEDED' : 'FAILED',
        [error.code],
      );
      return {
        status: applied
          ? ('PARTIALLY_SUCCEEDED' as const)
          : ('FAILED' as const),
        actionId: job.actionId,
        code: error.code,
      };
    }
    await repository.retryJob(job.actionId, 'WORKER_INTERRUPTED');
    throw error;
  }
}
