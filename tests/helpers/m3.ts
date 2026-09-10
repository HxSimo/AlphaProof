import { contentHash, privateKeyToAccount, type Hex } from '@poa/domain';
import { loadBundle } from '@poa/config';
import {
  createPool,
  ExperimentRepository,
  migrate,
  type Pool,
} from '@poa/storage';
import { buildAllocation, signAction } from '@poa/sdk';

export const TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}` as Hex;
export const account = privateKeyToAccount(TEST_PRIVATE_KEY);
export const declaredVersionHash = contentHash({
  code: 'm3-test-agent',
  version: '1.0.0',
});

export async function isolatedRepository(
  prefix: string,
  allowSynthetic = true,
) {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      'DATABASE_URL is required; M3 database tests never silently skip',
    );
  const admin = createPool(url);
  const schema = `${prefix}_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped = new URL(url);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  const pool = createPool(scoped.toString());
  await migrate(pool);
  const config = loadBundle();
  const repository = new ExperimentRepository(pool, {
    bundle: config.bundle,
    bundleHash: config.seal.bundleHash,
    allowSynthetic,
  });
  return {
    pool,
    repository,
    config,
    schema,
    closeRetained: async () => {
      await pool.end();
      await admin.end();
    },
    cleanup: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

export async function bootstrap(
  repository: ExperimentRepository,
  suffix = 'one',
) {
  const agentId = `agent-${suffix}`;
  const versionId = `version-${suffix}`;
  const experimentId = `experiment-${suffix}`;
  await repository.createAgent({ agentId, displayName: `Agent ${suffix}` });
  await repository.createAgentVersion(agentId, {
    versionId,
    declaredVersionHash,
    decisionKeys: [account.address.toLowerCase()],
    declaredHashes: {
      code: declaredVersionHash,
      prompt: null,
      model: null,
      parameters: null,
      memory: null,
      data: null,
    },
  });
  await repository.createExperiment({
    experimentId,
    agentId,
    versionId,
    profileId: 'synthetic-m3-local',
  });
  const started = await repository.startExperiment(experimentId);
  return { agentId, versionId, experimentId, ...started };
}

export async function envelopeFor(
  repository: ExperimentRepository,
  values: { agentId: string; experimentId: string; policyHash: string },
  changes: Record<string, unknown> = {},
  idempotencyKey = 'm3-idempotency-0001',
) {
  const policy = await repository.getPolicy(values.experimentId);
  const portfolios = await repository.getPortfolios(values.experimentId);
  const scenario = portfolios.scenarios[0]!;
  const intent = {
    schemaVersion: 'proof-of-alpha/action-intent/v1' as const,
    experimentId: values.experimentId,
    capitalScenarioId: scenario.scenarioId,
    agentId: values.agentId,
    declaredVersionHash: policy.declaredVersionHash,
    policyHash: values.policyHash,
    transferPolicyHash: policy.transferPolicyHash,
    networkProfile: policy.networkProfile,
    nonce: '1',
    expectedPortfolioVersion: scenario.portfolio.version,
    validUntil: String(Math.floor(Date.now() / 1000) + 120),
    targetAllocation: buildAllocation([
      {
        networkId: 'ethereum-mainnet',
        instrumentId: 'eth-aave-usdc',
        weightBps: 4000,
      },
      {
        networkId: 'ethereum-mainnet',
        instrumentId: 'eth-cash-usdc',
        weightBps: 6000,
      },
    ]),
    maxCostUsdcMinor: '20000000',
    maxTransferUsdcMinor: '0',
    maxSlippageBps: 10,
    ...changes,
  };
  return signAction(
    intent as Parameters<typeof signAction>[0],
    policy,
    idempotencyKey,
    {
      getAddress: async () => account.address,
      signTypedData: (data) => account.signTypedData(data),
    },
  );
}

export type TestPool = Pool;
