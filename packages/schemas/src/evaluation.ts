import { z } from 'zod';
import {
  PortfolioValuation,
  PositionValuationInput,
  ShadowPortfolio,
} from './accounting.js';
import {
  Hash,
  Id,
  Int,
  PositiveUInt,
  Provenance,
  Timestamp,
  UInt,
} from './primitives.js';

export const ReferenceKind = z.enum(['CASH', 'CONSERVATIVE_YIELD']);
export const ReferenceStatus = z.enum(['ACTIVE', 'ENTRY_FAILED']);

export const ReferencePortfolio = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/reference-portfolio/v1'),
  experimentId: Id,
  scenarioId: Id,
  referenceId: Id,
  kind: ReferenceKind,
  frozenInstrumentId: Id.nullable(),
  status: ReferenceStatus,
  replacementAllowed: z.literal(false),
  comparisonAvailable: z.boolean(),
  failureReasonCodes: z.array(z.string().min(1)),
  initialDistributionHash: Hash,
  periodStartsAt: Timestamp,
  periodEndsAt: Timestamp,
  valuationConvention: z.literal('MARK_AND_LIQUIDATION_ESTIMATE'),
  portfolio: ShadowPortfolio,
});

export const CheckpointPortfolio = z.strictObject({
  portfolioId: Id,
  role: z.enum(['AGENT', 'CASH_REFERENCE', 'CONSERVATIVE_YIELD_REFERENCE']),
  referenceStatus: ReferenceStatus.nullable(),
  comparisonAvailable: z.boolean(),
  portfolio: ShadowPortfolio,
  valuation: PortfolioValuation,
  accruedReceiptHashes: z.array(Hash),
});

export const ScenarioCheckpoint = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/scenario-checkpoint/v1'),
  checkpointId: Id,
  experimentId: Id,
  scenarioId: Id,
  sequence: PositiveUInt,
  checkpointAt: Timestamp,
  resultProvenance: Provenance,
  observationSetHash: Hash,
  amountQuoteHash: Hash,
  agent: CheckpointPortfolio,
  cashReference: CheckpointPortfolio,
  conservativeYieldReference: CheckpointPortfolio,
  checkpointHash: Hash,
});

export const DescriptivePortfolioMetrics = z.strictObject({
  initialValueUsdcMinor: PositiveUInt,
  markValueUsdcMinor: UInt.nullable(),
  liquidationValueUsdcMinor: UInt.nullable(),
  pnlMarkUsdcMinor: Int.nullable(),
  returnMarkBps: Int.nullable(),
  availableUsdcMinor: UInt,
  investedMarkUsdcMinor: UInt.nullable(),
  reservedUsdcMinor: UInt,
  inTransitUsdcMinor: UInt,
  blockedValueUsdcMinor: UInt.nullable(),
  cumulativeCostsUsdcMinor: UInt,
  drawdownMarkBps: UInt.nullable(),
  dataQuality: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
  reasonCodes: z.array(z.string().min(1)),
});

export const ScenarioEvaluation = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/scenario-evaluation/v1'),
  evaluationId: Id,
  checkpointId: Id,
  experimentId: Id,
  scenarioId: Id,
  checkpointAt: Timestamp,
  resultProvenance: Provenance,
  valuationConvention: z.literal('MARK_AND_LIQUIDATION_ESTIMATE'),
  agent: DescriptivePortfolioMetrics,
  cashReference: DescriptivePortfolioMetrics,
  conservativeYieldReference: DescriptivePortfolioMetrics,
  differenceVsCashMarkUsdcMinor: Int.nullable(),
  differenceVsConservativeYieldMarkUsdcMinor: Int.nullable(),
  excessReturnVsCashBps: Int.nullable(),
  excessReturnVsConservativeYieldBps: Int.nullable(),
  comparisonAvailability: z.strictObject({
    cash: z.literal(true),
    conservativeYield: z.boolean(),
  }),
  capitalScenarioRelationship: z.literal('CORRELATED_POLICY_VIEWS'),
  effectiveIndependentSampleCount: z.literal('1'),
  statisticalStatus: z.literal('NOT_ASSESSED'),
  statisticalReasonCodes: z.tuple([z.literal('INFERENCE_DISABLED')]),
  realCapitalEligibility: z.literal('NOT_ELIGIBLE_FOR_REAL_CAPITAL'),
  eligibilityReasonCodes: z.array(z.string().min(1)).min(1),
  evaluationHash: Hash,
});

export const CheckpointAccrualInput = z.strictObject({
  positionId: Id,
  nextIndexNumerator: PositiveUInt,
  nextIndexDenominator: PositiveUInt,
  sourceHash: Hash,
  observedAt: Timestamp,
});

export const CheckpointReplayPortfolioInput = z.strictObject({
  role: z.enum(['AGENT', 'CASH_REFERENCE', 'CONSERVATIVE_YIELD_REFERENCE']),
  referenceStatus: ReferenceStatus.nullable(),
  comparisonAvailable: z.boolean(),
  portfolio: ShadowPortfolio,
  accruals: z.array(CheckpointAccrualInput),
  valuations: z.array(PositionValuationInput),
});

export const CheckpointReplayInputs = z.strictObject({
  agent: CheckpointReplayPortfolioInput,
  cashReference: CheckpointReplayPortfolioInput,
  conservativeYieldReference: CheckpointReplayPortfolioInput,
});

export const M4ReplayBundle = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/m4-replay-bundle/v1'),
  checkpoint: ScenarioCheckpoint.omit({ checkpointHash: true }),
  priorAgentMarksUsdcMinor: z.array(UInt),
  rawObjects: z.array(
    z.strictObject({
      objectKey: z.string().regex(/^raw\/keccak256\/0x[0-9a-f]{64}$/),
      bytesHex: z.string().regex(/^[0-9a-f]*$/),
    }),
  ),
  checkpointInputs: CheckpointReplayInputs.nullable(),
  expectedCheckpointHash: Hash,
  expectedEvaluation: ScenarioEvaluation,
});

export type ReferenceKindData = z.infer<typeof ReferenceKind>;
export type ReferencePortfolioData = z.infer<typeof ReferencePortfolio>;
export type CheckpointPortfolioData = z.infer<typeof CheckpointPortfolio>;
export type ScenarioCheckpointData = z.infer<typeof ScenarioCheckpoint>;
export type DescriptivePortfolioMetricsData = z.infer<
  typeof DescriptivePortfolioMetrics
>;
export type ScenarioEvaluationData = z.infer<typeof ScenarioEvaluation>;
export type M4ReplayBundleData = z.infer<typeof M4ReplayBundle>;
export type CheckpointReplayInputsData = z.infer<typeof CheckpointReplayInputs>;
