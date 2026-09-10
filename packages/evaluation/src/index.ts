import { contentHash, PoaError, rawBytesHash } from '@poa/domain';
import {
  M4ReplayBundle,
  ScenarioCheckpoint,
  ScenarioEvaluation,
  EvaluationReceipt,
  type CheckpointPortfolioData,
  type DescriptivePortfolioMetricsData,
  type M4ReplayBundleData,
  type ScenarioCheckpointData,
  type ScenarioEvaluationData,
  type NetworkProfileData,
  type ProvenanceData,
} from '@poa/schemas';
import {
  checkpointPortfolio,
  createScenarioCheckpoint,
  portfolioPositionMark,
} from '@poa/valuation';

const total = (items: readonly string[]) =>
  items.reduce((sum, value) => sum + BigInt(value), 0n);
const signedBps = (value: bigint, initial: bigint) =>
  (((value - initial) * 10_000n) / initial).toString();

function metrics(
  item: CheckpointPortfolioData,
  priorMarks: readonly string[],
): DescriptivePortfolioMetricsData {
  const initial = BigInt(item.portfolio.initialValueUsdcMinor);
  const mark = item.valuation.markValueUsdcMinor;
  const peak =
    mark === null
      ? null
      : [BigInt(mark), ...priorMarks.map(BigInt)].reduce((a, b) =>
          a > b ? a : b,
        );
  const drawdown =
    mark === null || peak === null || peak === 0n
      ? null
      : (((peak - BigInt(mark)) * 10_000n) / peak).toString();
  return {
    initialValueUsdcMinor: initial.toString(),
    markValueUsdcMinor: mark,
    liquidationValueUsdcMinor: item.valuation.liquidationValueUsdcMinor,
    pnlMarkUsdcMinor:
      mark === null ? null : (BigInt(mark) - initial).toString(),
    returnMarkBps: mark === null ? null : signedBps(BigInt(mark), initial),
    availableUsdcMinor: item.valuation.availableUsdcMinor,
    investedMarkUsdcMinor: portfolioPositionMark(item),
    reservedUsdcMinor: item.valuation.reservedUsdcMinor,
    inTransitUsdcMinor: item.valuation.inTransitUsdcMinor,
    blockedValueUsdcMinor: item.valuation.blockedValueUsdcMinor,
    cumulativeCostsUsdcMinor: total(
      item.portfolio.recognizedCosts.map((cost) => cost.amountUsdcMinor),
    ).toString(),
    drawdownMarkBps: drawdown,
    dataQuality: item.valuation.dataQuality,
    reasonCodes: item.valuation.reasonCodes,
  };
}

const difference = (left: string | null, right: string | null) =>
  left === null || right === null
    ? null
    : (BigInt(left) - BigInt(right)).toString();

export function evaluateScenario(
  checkpointInput: ScenarioCheckpointData,
  priorAgentMarksUsdcMinor: readonly string[] = [],
): ScenarioEvaluationData {
  const checkpoint = ScenarioCheckpoint.parse(checkpointInput);
  const agent = metrics(checkpoint.agent, priorAgentMarksUsdcMinor);
  const cash = metrics(checkpoint.cashReference, []);
  const conservative = metrics(checkpoint.conservativeYieldReference, []);
  const yieldAvailable =
    checkpoint.conservativeYieldReference.comparisonAvailable &&
    conservative.markValueUsdcMinor !== null;
  const body = {
    schemaVersion: 'proof-of-alpha/scenario-evaluation/v1' as const,
    evaluationId: `${checkpoint.checkpointId}-evaluation`,
    checkpointId: checkpoint.checkpointId,
    experimentId: checkpoint.experimentId,
    scenarioId: checkpoint.scenarioId,
    checkpointAt: checkpoint.checkpointAt,
    resultProvenance: checkpoint.resultProvenance,
    valuationConvention: 'MARK_AND_LIQUIDATION_ESTIMATE' as const,
    agent,
    cashReference: cash,
    conservativeYieldReference: conservative,
    differenceVsCashMarkUsdcMinor: difference(
      agent.markValueUsdcMinor,
      cash.markValueUsdcMinor,
    ),
    differenceVsConservativeYieldMarkUsdcMinor: yieldAvailable
      ? difference(agent.markValueUsdcMinor, conservative.markValueUsdcMinor)
      : null,
    excessReturnVsCashBps: difference(agent.returnMarkBps, cash.returnMarkBps),
    excessReturnVsConservativeYieldBps: yieldAvailable
      ? difference(agent.returnMarkBps, conservative.returnMarkBps)
      : null,
    comparisonAvailability: {
      cash: true as const,
      conservativeYield: yieldAvailable,
    },
    capitalScenarioRelationship: 'CORRELATED_POLICY_VIEWS' as const,
    effectiveIndependentSampleCount: '1' as const,
    statisticalStatus: 'NOT_ASSESSED' as const,
    statisticalReasonCodes: ['INFERENCE_DISABLED'] as ['INFERENCE_DISABLED'],
    realCapitalEligibility: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL' as const,
    eligibilityReasonCodes: [
      `PROVENANCE_${checkpoint.resultProvenance}`,
      'AUTOMATIC_FUNDING_DISABLED',
    ],
  };
  return ScenarioEvaluation.parse({
    ...body,
    evaluationHash: contentHash(body),
  });
}

export interface EligibilityInput {
  experimentId: string;
  scenarioId: string;
  policyHash: `0x${string}`;
  checkpointHash: `0x${string}`;
  resultProvenance: ProvenanceData;
  networkProfile: NetworkProfileData;
  operationalStatus: 'COMPLIANT' | 'VIOLATION' | 'UNASSESSABLE';
  economicStatus: 'CRITERIA_MET' | 'CRITERIA_NOT_MET' | 'UNASSESSABLE';
  statisticalStatus:
    | 'NOT_ASSESSED'
    | 'INSUFFICIENT_EVIDENCE'
    | 'CRITERION_NOT_MET'
    | 'CRITERION_MET';
  statisticalMethodVersion: string | null;
  dimensionReasonCodes?: readonly string[];
  supersedesHash?: `0x${string}` | null;
}

/** Applies the immutable provenance exclusion before any policy criterion.
 * The result describes eligibility only; it never authorizes funding. */
export function evaluateEligibility(input: EligibilityInput) {
  const excluded =
    input.resultProvenance !== 'FORWARD_SHADOW' ||
    !['ETHEREUM_MAINNET_FORWARD', 'CROSS_CHAIN_MAINNET_FORWARD'].includes(
      input.networkProfile,
    );
  let overallStatus:
    | 'NOT_ELIGIBLE_FOR_REAL_CAPITAL'
    | 'UNASSESSABLE'
    | 'CRITERIA_NOT_MET'
    | 'INSUFFICIENT_EVIDENCE'
    | 'ELIGIBLE_UNDER_POLICY';
  const reasons = [...(input.dimensionReasonCodes ?? [])];
  if (excluded) {
    overallStatus = 'NOT_ELIGIBLE_FOR_REAL_CAPITAL';
    reasons.unshift(`PROVENANCE_${input.resultProvenance}`);
  } else if (
    input.operationalStatus === 'UNASSESSABLE' ||
    input.economicStatus === 'UNASSESSABLE'
  ) {
    overallStatus = 'UNASSESSABLE';
    reasons.unshift('REQUIRED_EVIDENCE_UNASSESSABLE');
  } else if (
    input.operationalStatus === 'VIOLATION' ||
    input.economicStatus === 'CRITERIA_NOT_MET' ||
    input.statisticalStatus === 'CRITERION_NOT_MET'
  ) {
    overallStatus = 'CRITERIA_NOT_MET';
    reasons.unshift('POLICY_CRITERION_NOT_MET');
  } else if (
    !input.statisticalMethodVersion ||
    input.statisticalStatus === 'NOT_ASSESSED' ||
    input.statisticalStatus === 'INSUFFICIENT_EVIDENCE'
  ) {
    overallStatus = 'INSUFFICIENT_EVIDENCE';
    reasons.unshift(
      input.statisticalStatus === 'NOT_ASSESSED'
        ? 'INFERENCE_DISABLED'
        : 'INSUFFICIENT_STATISTICAL_EVIDENCE',
    );
  } else {
    overallStatus = 'ELIGIBLE_UNDER_POLICY';
    reasons.unshift('ALL_FROZEN_CRITERIA_MET');
  }
  reasons.push('AUTOMATIC_FUNDING_DISABLED');
  return EvaluationReceipt.parse({
    schemaVersion: 'proof-of-alpha/evaluation-receipt/v1',
    experimentId: input.experimentId,
    scenarioId: input.scenarioId,
    policyHash: input.policyHash,
    checkpointHash: input.checkpointHash,
    resultProvenance: input.resultProvenance,
    networkProfile: input.networkProfile,
    operationalStatus: input.operationalStatus,
    economicStatus: input.economicStatus,
    statisticalStatus: input.statisticalStatus,
    statisticalMethodVersion: input.statisticalMethodVersion,
    overallStatus,
    reasonCodes: [...new Set(reasons)],
    supersedesHash: input.supersedesHash ?? null,
    automaticFundingEnabled: false,
  });
}

export function replayM4(input: M4ReplayBundleData) {
  const bundle = M4ReplayBundle.parse(input);
  for (const object of bundle.rawObjects) {
    const actual = rawBytesHash(
      Uint8Array.from(Buffer.from(object.bytesHex, 'hex')),
    );
    if (object.objectKey !== `raw/keccak256/${actual}`)
      throw new PoaError(
        'ARCHIVE_INTEGRITY',
        'M4 raw input content address differs',
      );
  }
  if (
    bundle.rawObjects.length &&
    contentHash(bundle.rawObjects) !== bundle.checkpoint.observationSetHash
  )
    throw new PoaError(
      'REPLAY_MISMATCH',
      'M4 observation set differs from archived inputs',
    );
  const expectedQuoteHash = contentHash({
    scenarioId: bundle.checkpoint.scenarioId,
    amountUsdcMinor: bundle.checkpoint.agent.portfolio.initialValueUsdcMinor,
    objectKeys: bundle.rawObjects.map((object) => object.objectKey),
  });
  if (
    bundle.rawObjects.length &&
    expectedQuoteHash !== bundle.checkpoint.amountQuoteHash
  )
    throw new PoaError(
      'REPLAY_MISMATCH',
      'M4 amount-specific quote set differs',
    );
  const archivedHashes = new Set(
    bundle.rawObjects.map((object) => object.objectKey.split('/').at(-1)),
  );
  if (
    bundle.checkpointInputs &&
    [
      bundle.checkpointInputs.agent,
      bundle.checkpointInputs.cashReference,
      bundle.checkpointInputs.conservativeYieldReference,
    ]
      .flatMap((item) => [
        ...item.accruals.map((value) => value.sourceHash),
        ...item.valuations.map((value) => value.sourceHash),
      ])
      .some((sourceHash) => !archivedHashes.has(sourceHash))
  )
    throw new PoaError(
      'ARCHIVE_INTEGRITY',
      'Checkpoint input source is absent from the raw archive',
    );
  const checkpoint = bundle.checkpointInputs
    ? createScenarioCheckpoint({
        checkpointId: bundle.checkpoint.checkpointId,
        sequence: bundle.checkpoint.sequence,
        checkpointAt: bundle.checkpoint.checkpointAt,
        observationSetHash: bundle.checkpoint.observationSetHash,
        amountQuoteHash: bundle.checkpoint.amountQuoteHash,
        agent: checkpointPortfolio({
          checkpointId: bundle.checkpoint.checkpointId,
          ...bundle.checkpointInputs.agent,
        }),
        cashReference: checkpointPortfolio({
          checkpointId: bundle.checkpoint.checkpointId,
          ...bundle.checkpointInputs.cashReference,
        }),
        conservativeYieldReference: checkpointPortfolio({
          checkpointId: bundle.checkpoint.checkpointId,
          ...bundle.checkpointInputs.conservativeYieldReference,
        }),
      })
    : ScenarioCheckpoint.parse({
        ...bundle.checkpoint,
        checkpointHash: contentHash(bundle.checkpoint),
      });
  if (checkpoint.checkpointHash !== bundle.expectedCheckpointHash)
    throw new PoaError(
      'REPLAY_MISMATCH',
      'M4 checkpoint hash differs from archived result',
    );
  const evaluation = evaluateScenario(
    checkpoint,
    bundle.priorAgentMarksUsdcMinor,
  );
  if (evaluation.evaluationHash !== bundle.expectedEvaluation.evaluationHash)
    throw new PoaError(
      'REPLAY_MISMATCH',
      'M4 evaluation differs from archived result',
    );
  return { checkpoint, evaluation };
}
