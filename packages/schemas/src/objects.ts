import { z } from 'zod';
import { TRANSFER_STATES } from '@poa/domain';
import {
  Address,
  Allocation,
  Amount,
  BlockRef,
  ErrorCode,
  Hash,
  Id,
  NetworkProfile,
  PositiveUInt,
  Provenance,
  SourceRef,
  Timestamp,
  UInt,
  Version,
} from './primitives.js';

export const AgentVersion = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/agent-version/v1'),
  agentId: Id,
  versionId: Id,
  declaredVersionHash: Hash,
  decisionKeys: z.array(Address).min(1).max(10),
  runtimeProvenance: z.literal('SELF_REPORTED'),
  declaredHashes: z.strictObject({
    code: Hash.nullable(),
    prompt: Hash.nullable(),
    model: Hash.nullable(),
    parameters: Hash.nullable(),
    memory: Hash.nullable(),
    data: Hash.nullable(),
  }),
  createdAt: Timestamp,
});
export const ExperimentPolicy = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/experiment-policy/v1'),
    experimentId: Id,
    agentId: Id,
    declaredVersionHash: Hash,
    profileId: Id,
    profileVersion: Version,
    profileHash: Hash,
    manifestBundleHash: Hash,
    configurationHash: Hash,
    adapterSetHash: Hash,
    parserSetHash: Hash,
    transferPolicyHash: Hash,
    startsAt: Timestamp,
    endsAt: Timestamp,
    lockedAt: Timestamp,
    networkProfile: NetworkProfile,
    resultProvenance: Provenance,
    engineVersions: z.strictObject({
      accounting: Version,
      planner: Version,
      execution: Version,
      valuation: Version,
      evaluation: Version,
    }),
    engineSourceHash: Hash,
    adapterVersions: z
      .array(
        z.strictObject({ adapterId: Id, version: Version, sourceHash: Hash }),
      )
      .min(1),
    signingDomain: z.strictObject({
      name: z.literal('Proof of Alpha'),
      version: z.literal('1'),
      chainId: PositiveUInt,
      verifyingContract: Address,
    }),
    automaticFundingEnabled: z.literal(false),
  })
  .superRefine((p, ctx) => {
    if (p.lockedAt > p.startsAt || p.startsAt >= p.endsAt)
      ctx.addIssue({
        code: 'custom',
        message: 'Require lockedAt <= startsAt < endsAt',
      });
  });
export const CapitalScenario = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/capital-scenario/v1'),
    experimentId: Id,
    scenarioId: Id,
    initialAmountUsdcMinor: z.enum([
      '1000000000',
      '10000000000',
      '100000000000',
    ]),
    initialDistribution: Allocation,
    portfolioId: Id,
    cashReferencePortfolioId: Id,
    yieldReferencePortfolioId: Id,
    resultProvenance: Provenance,
  })
  .superRefine((s, ctx) => {
    if (
      new Set([
        s.portfolioId,
        s.cashReferencePortfolioId,
        s.yieldReferencePortfolioId,
      ]).size !== 3
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Agent and reference portfolios must be distinct',
      });
  });
export const ActionIntent = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/action-intent/v1'),
  experimentId: Id,
  capitalScenarioId: Id,
  agentId: Id,
  declaredVersionHash: Hash,
  policyHash: Hash,
  transferPolicyHash: Hash,
  networkProfile: NetworkProfile,
  nonce: UInt,
  expectedPortfolioVersion: UInt,
  validUntil: PositiveUInt,
  targetAllocation: Allocation,
  maxCostUsdcMinor: UInt,
  maxTransferUsdcMinor: UInt,
  maxSlippageBps: z.number().int().min(0).max(10000),
});
export const SignedActionRequest = z.strictObject({
  intent: ActionIntent,
  signature: z.string().regex(/^0x[0-9a-f]{130}$/),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/),
});
export const ActionAcknowledgment = z.strictObject({
  actionId: Id,
  receivedAt: Timestamp,
  sequence: UInt,
  policyHash: Hash,
  portfolioVersion: UInt,
  status: z.enum([
    'ACCEPTED',
    'IN_PROGRESS',
    'SUCCEEDED',
    'PARTIALLY_SUCCEEDED',
    'FAILED',
    'EXPIRED',
  ]),
  reasonCodes: z.array(ErrorCode),
});
export const Operation = z.strictObject({
  operationId: Id,
  kind: z.enum([
    'WITHDRAW',
    'APPROVE',
    'SWAP',
    'TRANSFER',
    'RECEIVE',
    'DEPOSIT',
  ]),
  networkId: Id,
  instrumentId: Id.nullable(),
  dependsOn: z.array(Id),
  input: Amount,
  maxCostUsdcMinor: UInt,
});
export const ExecutionPlan = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/execution-plan/v1'),
    experimentId: Id,
    scenarioId: Id,
    actionId: Id,
    policyHash: Hash,
    portfolioVersion: UInt,
    plannerVersion: Version,
    receivedAt: Timestamp,
    resultProvenance: Provenance,
    steps: z.array(Operation).min(1).max(128),
  })
  .superRefine((plan, ctx) => {
    const prior = new Set<string>();
    for (const step of plan.steps) {
      if (
        prior.has(step.operationId) ||
        step.dependsOn.some((id) => !prior.has(id))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Steps must be unique and dependency ordered',
        });
      prior.add(step.operationId);
    }
  });
export const Cost = z.strictObject({
  costId: Id,
  category: z.enum([
    'APPROVAL_GAS',
    'EXECUTION_GAS',
    'SOURCE_GAS',
    'DESTINATION_GAS',
    'RETRY_GAS',
    'PROTOCOL_FEE',
    'SWAP_FEE_IMPACT',
    'TRANSFER_FEE',
    'RELAYER',
    'SUBSIDY',
  ]),
  networkId: Id,
  nativeAmount: Amount.nullable(),
  usdcMinor: UInt,
  recognition: z.enum([
    'DEBIT',
    'INCLUDED_IN_OUTPUT',
    'PAYABLE',
    'DISCLOSED_SUBSIDY',
  ]),
  source: SourceRef,
});
export const OperationReceipt = z.strictObject({
  operationId: Id,
  attempt: UInt,
  status: z.enum(['SUCCEEDED', 'FAILED', 'REJECTED_BEFORE_ATTEMPT', 'SKIPPED']),
  actualInput: Amount,
  actualOutput: Amount.nullable(),
  costs: z.array(Cost),
  economicBlock: BlockRef.nullable(),
  rawInputHashes: z.array(Hash),
  reasonCodes: z.array(ErrorCode),
});
export const ExecutionReceipt = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/execution-receipt/v1'),
  experimentId: Id,
  scenarioId: Id,
  actionId: Id,
  policyHash: Hash,
  planHash: Hash,
  beforePortfolioHash: Hash,
  afterPortfolioHash: Hash,
  beforeVersion: UInt,
  afterVersion: UInt,
  engineVersion: Version,
  resultProvenance: Provenance,
  receivedAt: Timestamp,
  completedAt: Timestamp,
  steps: z.array(OperationReceipt).min(1),
  status: z.enum(['SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'EXPIRED']),
});
export const TransferIntent = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/transfer-intent/v1'),
    experimentId: Id,
    scenarioId: Id,
    transferId: Id,
    operationId: Id,
    routeDependencyId: Id,
    sourceNetworkId: Id,
    destinationNetworkId: Id,
    environment: z.enum(['mainnet', 'testnet']),
    sourceDomain: UInt,
    destinationDomain: UInt,
    asset: z.literal('USDC'),
    amountUsdcMinor: PositiveUInt,
    maxCostUsdcMinor: UInt,
    mode: z.literal('STANDARD'),
    transferPolicyHash: Hash,
  })
  .superRefine((t, ctx) => {
    if (
      t.sourceNetworkId === t.destinationNetworkId ||
      t.sourceDomain === t.destinationDomain
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Transfer endpoints must differ',
      });
  });
export const TransferReceipt = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/transfer-receipt/v1'),
    experimentId: Id,
    scenarioId: Id,
    transferId: Id,
    state: z.enum(TRANSFER_STATES),
    resultProvenance: Provenance,
    executionMode: z.enum(['SIMULATED', 'ACTUAL_TESTNET']),
    messageHash: Hash.nullable(),
    sourceTransactionHash: Hash.nullable(),
    destinationTransactionHash: Hash.nullable(),
    attestationObjectHash: Hash.nullable(),
    delayModelVersion: Version.nullable(),
    netReceivableUsdcMinor: UInt,
    destinationCreditUsdcMinor: UInt,
    costs: z.array(Cost),
    sourceBlock: BlockRef.nullable(),
    destinationBlock: BlockRef.nullable(),
    observedAt: Timestamp,
    sequence: UInt,
  })
  .superRefine((r, ctx) => {
    if (
      r.executionMode === 'SIMULATED' &&
      (r.sourceTransactionHash ||
        r.destinationTransactionHash ||
        r.attestationObjectHash ||
        !r.delayModelVersion)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Simulated transfers require a delay model and cannot claim transaction or attestation evidence',
      });
    if (
      r.executionMode === 'ACTUAL_TESTNET' &&
      r.resultProvenance !== 'CROSS_CHAIN_TESTNET'
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Actual test transfers require testnet provenance',
      });
    if (r.state !== 'SETTLED' && r.destinationCreditUsdcMinor !== '0')
      ctx.addIssue({
        code: 'custom',
        message: 'Unsettled transfer cannot claim a destination credit',
      });
    if (
      r.state === 'SETTLED' &&
      (r.netReceivableUsdcMinor !== '0' ||
        (r.executionMode === 'ACTUAL_TESTNET' &&
          (!r.messageHash ||
            !r.sourceTransactionHash ||
            !r.destinationTransactionHash ||
            !r.attestationObjectHash)))
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Settlement removes receivable and requires actual evidence in testnet mode',
      });
  });
export const ValuationCheckpoint = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/valuation-checkpoint/v1'),
    experimentId: Id,
    scenarioId: Id,
    portfolioId: Id,
    portfolioVersion: UInt,
    policyHash: Hash,
    resultProvenance: Provenance,
    valuationVersion: Version,
    at: Timestamp,
    markValueUsdcMinor: UInt.nullable(),
    liquidationValueUsdcMinor: UInt.nullable(),
    availableUsdcMinor: UInt,
    inTransitUsdcMinor: UInt,
    blockedValueUsdcMinor: UInt.nullable(),
    dataQuality: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
    inputs: z.array(SourceRef),
    reasonCodes: z.array(ErrorCode),
  })
  .superRefine((v, ctx) => {
    if (
      v.dataQuality === 'FRESH' &&
      (!v.inputs.length ||
        v.inputs.some((i) => i.freshness !== 'FRESH') ||
        v.markValueUsdcMinor === null ||
        v.liquidationValueUsdcMinor === null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Fresh valuation requires fresh inputs and both values',
      });
  });
export const EvaluationReceipt = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/evaluation-receipt/v1'),
    experimentId: Id,
    scenarioId: Id,
    policyHash: Hash,
    checkpointHash: Hash,
    resultProvenance: Provenance,
    networkProfile: NetworkProfile,
    operationalStatus: z.enum(['COMPLIANT', 'VIOLATION', 'UNASSESSABLE']),
    economicStatus: z.enum([
      'CRITERIA_MET',
      'CRITERIA_NOT_MET',
      'UNASSESSABLE',
    ]),
    statisticalStatus: z.enum([
      'NOT_ASSESSED',
      'INSUFFICIENT_EVIDENCE',
      'CRITERION_NOT_MET',
      'CRITERION_MET',
    ]),
    statisticalMethodVersion: Version.nullable(),
    overallStatus: z.enum([
      'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
      'UNASSESSABLE',
      'CRITERIA_NOT_MET',
      'INSUFFICIENT_EVIDENCE',
      'ELIGIBLE_UNDER_POLICY',
    ]),
    reasonCodes: z.array(z.string().min(1)),
    supersedesHash: Hash.nullable(),
    automaticFundingEnabled: z.literal(false),
  })
  .superRefine((r, ctx) => {
    const excluded =
      r.resultProvenance !== 'FORWARD_SHADOW' ||
      !['ETHEREUM_MAINNET_FORWARD', 'CROSS_CHAIN_MAINNET_FORWARD'].includes(
        r.networkProfile,
      );
    if (excluded && r.overallStatus !== 'NOT_ELIGIBLE_FOR_REAL_CAPITAL')
      ctx.addIssue({
        code: 'custom',
        message:
          'Provenance exclusion precedes economic and statistical criteria',
      });
    if (
      r.overallStatus === 'ELIGIBLE_UNDER_POLICY' &&
      (!r.statisticalMethodVersion ||
        r.statisticalStatus !== 'CRITERION_MET' ||
        r.operationalStatus !== 'COMPLIANT' ||
        r.economicStatus !== 'CRITERIA_MET')
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Eligibility requires all dimensions and an enabled statistical method',
      });
  });
export const AuditEvent = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/audit-event/v1'),
  experimentId: Id,
  sequence: PositiveUInt,
  objectType: z.enum([
    'AGENT_VERSION',
    'POLICY_LOCKED',
    'ACTION_ACCEPTED',
    'ACTION_REJECTED',
    'EXECUTION',
    'TRANSFER',
    'VALUATION',
    'EVALUATION',
    'INCIDENT',
    'CORRECTION',
    'PUBLICATION',
    'STOPPED_EARLY',
  ]),
  occurredAt: Timestamp,
  resultProvenance: Provenance,
  objectSchemaVersion: z
    .string()
    .regex(/^proof-of-alpha\/[a-z-]+\/v[1-9][0-9]*$/),
  contentHash: Hash,
  previousEventHash: Hash.nullable(),
  supersedesContentHash: Hash.nullable(),
});
export const CommitmentBatch = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/commitment-batch/v1'),
    experimentId: Id,
    batchId: Id,
    firstSequence: PositiveUInt,
    lastSequence: PositiveUInt,
    root: Hash,
    previousBatchHash: Hash.nullable(),
    leavesObjectHash: Hash,
    mode: z.literal('PERIODIC_AFTER_RECEIPT'),
    registryNetworkId: Id,
    status: z.enum(['PENDING', 'SUBMITTED', 'CONFIRMED', 'REORGED']),
    transactionHash: Hash.nullable(),
    block: BlockRef.nullable(),
  })
  .superRefine((b, ctx) => {
    if (
      PositiveUInt.safeParse(b.firstSequence).success &&
      PositiveUInt.safeParse(b.lastSequence).success &&
      BigInt(b.firstSequence) > BigInt(b.lastSequence)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid sequence range' });
    if (
      b.status === 'CONFIRMED' &&
      (!b.transactionHash || !b.block || b.block.finality !== 'FINALIZED')
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Confirmed publication requires finalized transaction evidence',
      });
  });

export type EvaluationReceiptData = z.infer<typeof EvaluationReceipt>;
export type AuditEventData = z.infer<typeof AuditEvent>;
export type CommitmentBatchData = z.infer<typeof CommitmentBatch>;
