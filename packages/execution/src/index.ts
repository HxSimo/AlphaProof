import { PoaError } from '@poa/domain';
import {
  ActionIntent,
  ExecutionPlan,
  ExperimentPolicy,
  ShadowPortfolio,
  type ActionIntentData,
  type ExperimentPolicyData,
  type ProfileData,
  type ShadowPortfolioData,
} from '@poa/schemas';

export const PLANNER_VERSION = '1.0.0';

export interface PlannerContext {
  actionId: string;
  receivedAt: string;
  profile: ProfileData;
  assetAddresses: Readonly<Record<string, string>>;
}

export function planAllocation(
  policyInput: ExperimentPolicyData,
  portfolioInput: ShadowPortfolioData,
  intentInput: ActionIntentData,
  context: PlannerContext,
) {
  const policy = ExperimentPolicy.parse(policyInput);
  const portfolio = ShadowPortfolio.parse(portfolioInput);
  const intent = ActionIntent.parse(intentInput);
  if (
    intent.experimentId !== policy.experimentId ||
    intent.experimentId !== portfolio.experimentId ||
    intent.capitalScenarioId !== portfolio.scenarioId ||
    intent.policyHash === undefined ||
    intent.networkProfile !== policy.networkProfile
  )
    throw new PoaError('POLICY_VIOLATION', 'Planner input binding mismatch');
  if (
    intent.maxSlippageBps > context.profile.constraints.maximumSwapSlippageBps
  )
    throw new PoaError('POLICY_VIOLATION', 'Slippage bound exceeds policy');
  for (const target of intent.targetAllocation) {
    if (!context.profile.instrumentAllowlist.includes(target.instrumentId))
      throw new PoaError(
        'UNSUPPORTED_INSTRUMENT',
        `Instrument is outside frozen allowlist: ${target.instrumentId}`,
      );
    if (!context.profile.marketNetworkIds.includes(target.networkId))
      throw new PoaError(
        'ENVIRONMENT_MISMATCH',
        'Target network is outside profile',
      );
    if (
      !target.instrumentId.includes('cash') &&
      target.weightBps > context.profile.constraints.maximumInstrumentWeightBps
    )
      throw new PoaError(
        'POLICY_VIOLATION',
        'Investment concentration exceeds policy',
      );
  }
  const cashWeight = intent.targetAllocation
    .filter((x) => x.instrumentId.includes('cash'))
    .reduce((sum, x) => sum + x.weightBps, 0);
  if (cashWeight < context.profile.constraints.minimumTargetAvailableCashBps)
    throw new PoaError(
      'POLICY_VIOLATION',
      'Target cash reserve is below policy',
    );

  const invested = intent.targetAllocation.filter(
    (x) => !x.instrumentId.includes('cash'),
  );
  if (invested.length !== 1 || invested[0]!.instrumentId !== 'eth-aave-usdc')
    throw new PoaError(
      'UNSUPPORTED_INSTRUMENT',
      'M3 planner supports the archived Ethereum Aave USDC slice only',
    );
  const target = invested[0]!;
  const amount =
    (BigInt(portfolio.initialValueUsdcMinor) * BigInt(target.weightBps)) /
    10000n;
  if (amount <= 0n)
    throw new PoaError('POLICY_VIOLATION', 'Derived deposit must be positive');
  if (BigInt(intent.maxCostUsdcMinor) === 0n)
    throw new PoaError(
      'POLICY_VIOLATION',
      'Execution requires a positive cost bound',
    );
  const address = context.assetAddresses['ethereum-mainnet/usdc'];
  if (!address)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Frozen USDC asset identity is missing',
    );
  const amountObject = {
    networkId: 'ethereum-mainnet',
    assetId: 'usdc',
    assetAddress: address,
    decimals: 6,
    minor: amount.toString(),
  };
  return ExecutionPlan.parse({
    schemaVersion: 'proof-of-alpha/execution-plan/v1',
    experimentId: policy.experimentId,
    scenarioId: portfolio.scenarioId,
    actionId: context.actionId,
    policyHash: intent.policyHash,
    portfolioVersion: portfolio.version,
    plannerVersion: PLANNER_VERSION,
    receivedAt: context.receivedAt,
    resultProvenance: policy.resultProvenance,
    steps: [
      {
        operationId: `${context.actionId}-approve`,
        kind: 'APPROVE',
        networkId: 'ethereum-mainnet',
        instrumentId: 'eth-aave-usdc',
        dependsOn: [],
        input: amountObject,
        maxCostUsdcMinor: intent.maxCostUsdcMinor,
      },
      {
        operationId: `${context.actionId}-deposit`,
        kind: 'DEPOSIT',
        networkId: 'ethereum-mainnet',
        instrumentId: 'eth-aave-usdc',
        dependsOn: [`${context.actionId}-approve`],
        input: amountObject,
        maxCostUsdcMinor: intent.maxCostUsdcMinor,
      },
    ],
  });
}
