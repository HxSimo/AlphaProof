import { applyReceipt, assertPortfolio, valuePortfolio } from '@poa/accounting';
import { contentHash, PoaError } from '@poa/domain';
import {
  CheckpointPortfolio,
  ReferencePortfolio,
  ScenarioCheckpoint,
  type CheckpointPortfolioData,
  type PositionValuationInputData,
  type ReferencePortfolioData,
  type ScenarioCheckpointData,
  type ShadowPortfolioData,
} from '@poa/schemas';

export interface AccrualInput {
  positionId: string;
  nextIndexNumerator: string;
  nextIndexDenominator: string;
  sourceHash: string;
  observedAt: string;
}

export interface PortfolioCheckpointInput {
  checkpointId: string;
  role: CheckpointPortfolioData['role'];
  referenceStatus: CheckpointPortfolioData['referenceStatus'];
  comparisonAvailable: boolean;
  portfolio: ShadowPortfolioData;
  accruals: AccrualInput[];
  valuations: PositionValuationInputData[];
}

const total = (items: readonly string[]) =>
  items.reduce((sum, item) => sum + BigInt(item), 0n);

export function initialDistributionHash(portfolio: ShadowPortfolioData) {
  const state = assertPortfolio(portfolio);
  return contentHash({
    unitOfAccount: state.unitOfAccount,
    unitDecimals: state.unitDecimals,
    initialValueUsdcMinor: state.initialValueUsdcMinor,
    cash: state.cash.map(({ networkId, assetId, amountUsdcMinor }) => ({
      networkId,
      assetId,
      amountUsdcMinor,
    })),
  });
}

export function makeReferences(
  agentInitial: ShadowPortfolioData,
  periodStartsAt: string,
  periodEndsAt: string,
): [ReferencePortfolioData, ReferencePortfolioData] {
  const source = assertPortfolio(agentInitial);
  if (source.version !== '0')
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'References must freeze before the first agent receipt',
    );
  const distributionHash = initialDistributionHash(source);
  const make = (
    kind: ReferencePortfolioData['kind'],
    instrument: string | null,
  ): ReferencePortfolioData => {
    const suffix = kind === 'CASH' ? 'cash-reference' : 'yield-reference';
    const portfolio = {
      ...structuredClone(source),
      portfolioId: `${source.experimentId}-${source.scenarioId}-${suffix}`,
    };
    return ReferencePortfolio.parse({
      schemaVersion: 'proof-of-alpha/reference-portfolio/v1',
      experimentId: source.experimentId,
      scenarioId: source.scenarioId,
      referenceId: `${source.experimentId}-${source.scenarioId}-${suffix}`,
      kind,
      frozenInstrumentId: instrument,
      status: 'ACTIVE',
      replacementAllowed: false,
      comparisonAvailable: true,
      failureReasonCodes: [],
      initialDistributionHash: distributionHash,
      periodStartsAt,
      periodEndsAt,
      valuationConvention: 'MARK_AND_LIQUIDATION_ESTIMATE',
      portfolio,
    });
  };
  return [make('CASH', null), make('CONSERVATIVE_YIELD', 'eth-aave-usdc')];
}

export function checkpointPortfolio(input: PortfolioCheckpointInput) {
  let portfolio = assertPortfolio(structuredClone(input.portfolio));
  const positions = new Set(
    portfolio.positions.map((position) => position.positionId),
  );
  if (
    input.accruals.length !== positions.size ||
    input.accruals.some((x) => !positions.has(x.positionId))
  ) {
    if (positions.size || input.accruals.length)
      throw new PoaError(
        'DATA_UNAVAILABLE',
        'Checkpoint requires one accrual input per open position',
      );
  }
  const hashes: `0x${string}`[] = [];
  for (const accrual of [...input.accruals].sort((a, b) =>
    a.positionId.localeCompare(b.positionId),
  )) {
    const receipt = {
      schemaVersion: 'proof-of-alpha/accounting-receipt/v1' as const,
      accountingVersion: '1.0.0' as const,
      operationId: `checkpoint-accrue-${contentHash({ checkpointId: input.checkpointId, portfolioId: portfolio.portfolioId, positionId: accrual.positionId }).slice(2, 34)}`,
      experimentId: portfolio.experimentId,
      scenarioId: portfolio.scenarioId,
      expectedPortfolioVersion: portfolio.version,
      observedAt: accrual.observedAt,
      resultProvenance: portfolio.resultProvenance,
      sourceHashes: [accrual.sourceHash as `0x${string}`],
      kind: 'ACCRUE' as const,
      positionId: accrual.positionId,
      nextIndexNumerator: accrual.nextIndexNumerator,
      nextIndexDenominator: accrual.nextIndexDenominator,
      costs: [] as [],
    };
    portfolio = applyReceipt(portfolio, receipt);
    hashes.push(contentHash(receipt));
  }
  const valuation = valuePortfolio(portfolio, input.valuations);
  return CheckpointPortfolio.parse({
    portfolioId: portfolio.portfolioId,
    role: input.role,
    referenceStatus: input.referenceStatus,
    comparisonAvailable: input.comparisonAvailable,
    portfolio,
    valuation,
    accruedReceiptHashes: hashes,
  });
}

export function createScenarioCheckpoint(input: {
  checkpointId: string;
  sequence: string;
  checkpointAt: string;
  observationSetHash: string;
  amountQuoteHash: string;
  agent: CheckpointPortfolioData;
  cashReference: CheckpointPortfolioData;
  conservativeYieldReference: CheckpointPortfolioData;
}): ScenarioCheckpointData {
  const { agent, cashReference, conservativeYieldReference } = input;
  const portfolios = [agent, cashReference, conservativeYieldReference];
  if (new Set(portfolios.map((item) => item.portfolio.portfolioId)).size !== 3)
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Scenario portfolios require distinct financial identities',
    );
  if (
    new Set(portfolios.map((item) => item.portfolio.initialValueUsdcMinor))
      .size !== 1
  )
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Scenario and references require equal initial capital',
    );
  if (new Set(portfolios.map((item) => item.portfolio.scenarioId)).size !== 1)
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Checkpoint cannot mix scenarios',
    );
  if (
    new Set(portfolios.map((item) => item.portfolio.resultProvenance)).size !==
    1
  )
    throw new PoaError(
      'ENVIRONMENT_MISMATCH',
      'Checkpoint cannot mix observation provenance',
    );
  if (
    portfolios.some(
      (item) =>
        item.portfolio.lastAppliedAt !== null &&
        item.portfolio.lastAppliedAt > input.checkpointAt,
    )
  )
    throw new PoaError(
      'INVALID_TRANSITION',
      'Checkpoint cannot precede a portfolio effect',
    );
  if (
    agent.role !== 'AGENT' ||
    cashReference.role !== 'CASH_REFERENCE' ||
    conservativeYieldReference.role !== 'CONSERVATIVE_YIELD_REFERENCE'
  )
    throw new PoaError(
      'INVALID_SCHEMA',
      'Checkpoint requires exactly one agent and two fixed references',
    );
  if (
    cashReference.referenceStatus !== 'ACTIVE' ||
    !cashReference.comparisonAvailable ||
    (conservativeYieldReference.referenceStatus === 'ACTIVE') !==
      conservativeYieldReference.comparisonAvailable
  )
    throw new PoaError(
      'INVALID_SCHEMA',
      'Reference status and comparison availability disagree',
    );
  const body = {
    schemaVersion: 'proof-of-alpha/scenario-checkpoint/v1' as const,
    checkpointId: input.checkpointId,
    experimentId: agent.portfolio.experimentId,
    scenarioId: agent.portfolio.scenarioId,
    sequence: input.sequence,
    checkpointAt: input.checkpointAt,
    resultProvenance: agent.portfolio.resultProvenance,
    observationSetHash: input.observationSetHash,
    amountQuoteHash: input.amountQuoteHash,
    agent,
    cashReference,
    conservativeYieldReference,
  };
  return ScenarioCheckpoint.parse({
    ...body,
    checkpointHash: contentHash(body),
  });
}

export function portfolioPositionMark(portfolio: CheckpointPortfolioData) {
  const valuation = portfolio.valuation;
  if (valuation.markValueUsdcMinor === null) return null;
  const components = total([
    valuation.availableUsdcMinor,
    valuation.reservedUsdcMinor,
    valuation.inTransitUsdcMinor,
  ]);
  return (
    BigInt(valuation.markValueUsdcMinor) +
    BigInt(valuation.feesPayableUsdcMinor) -
    components
  ).toString();
}
