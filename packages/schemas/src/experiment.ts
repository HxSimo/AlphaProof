import { z } from 'zod';
import {
  ActionAcknowledgment,
  ActionIntent,
  AgentVersion,
  ExperimentPolicy,
  SignedActionRequest,
} from './objects.js';
import {
  Address,
  Hash,
  Id,
  PositiveUInt,
  Provenance,
  Timestamp,
  UInt,
} from './primitives.js';
import { ShadowPortfolio } from './accounting.js';

export const AgentRegistration = z.strictObject({
  agentId: Id,
  displayName: z.string().trim().min(1).max(120),
});

export const AgentRecord = AgentRegistration.extend({
  schemaVersion: z.literal('proof-of-alpha/agent/v1'),
  createdAt: Timestamp,
});

export const AgentVersionRegistration = z.strictObject({
  versionId: Id,
  declaredVersionHash: Hash,
  decisionKeys: z.array(Address).min(1).max(10),
  declaredHashes: AgentVersion.shape.declaredHashes,
});

export const AgentVersionRecord = AgentVersion.extend({
  revokedAt: Timestamp.nullable(),
  revocationReason: z.string().min(1).max(500).nullable(),
});

export const ExperimentCreateRequest = z.strictObject({
  experimentId: Id,
  agentId: Id,
  versionId: Id,
  profileId: Id,
});

export const ExperimentRecord = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/experiment/v1'),
  experimentId: Id,
  agentId: Id,
  versionId: Id,
  profileId: Id,
  state: z.enum(['DRAFT', 'STARTED', 'CLOSED', 'INVALIDATED']),
  createdAt: Timestamp,
  policy: ExperimentPolicy.nullable(),
  policyHash: Hash.nullable(),
  configurationHash: Hash.nullable(),
  profileHash: Hash.nullable(),
  adapterSetHash: Hash.nullable(),
  parserSetHash: Hash.nullable(),
});

export const ActionEnvelope = z.strictObject({
  request: SignedActionRequest,
  signedBytes: z.string().regex(/^0x[0-9a-f]+$/),
});

export const ActionRecord = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/action-record/v1'),
  actionId: Id,
  request: SignedActionRequest,
  intentHash: Hash,
  typedDataHash: Hash,
  signedBytesHash: Hash,
  signer: Address,
  receivedAt: Timestamp,
  sequence: PositiveUInt,
  status: z.enum([
    'ACCEPTED',
    'IN_PROGRESS',
    'SUCCEEDED',
    'PARTIALLY_SUCCEEDED',
    'FAILED',
    'EXPIRED',
  ]),
  reasonCodes: z.array(z.string().min(1)),
  planHash: Hash.nullable(),
  beforePortfolioHash: Hash.nullable(),
  afterPortfolioHash: Hash.nullable(),
  completedAt: Timestamp.nullable(),
});

export const ScenarioPortfolio = z.strictObject({
  scenarioId: Id,
  initialAmountUsdcMinor: PositiveUInt,
  portfolio: ShadowPortfolio,
});

export const ExperimentPortfolios = z.strictObject({
  experimentId: Id,
  resultProvenance: Provenance,
  scenarios: z.array(ScenarioPortfolio).min(1),
});

export const CorrectionRecord = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/correction/v1'),
  correctionId: Id,
  experimentId: Id,
  originalContentHash: Hash,
  correctedContentHash: Hash,
  reason: z.string().min(1).max(1000),
  createdAt: Timestamp,
});

export const QueueJob = z.strictObject({
  jobId: Id,
  jobType: z.literal('EXECUTE_ACTION'),
  financialIdentity: Id,
  payload: z.strictObject({ actionId: Id }),
  state: z.enum(['READY', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED']),
  attempt: UInt,
  availableAt: Timestamp,
  leasedUntil: Timestamp.nullable(),
});

export const ActionSubmissionResult = z.strictObject({
  acknowledgment: ActionAcknowledgment,
  intentHash: Hash,
  typedDataHash: Hash,
  signedBytesHash: Hash,
});

export type AgentRegistrationData = z.infer<typeof AgentRegistration>;
export type AgentRecordData = z.infer<typeof AgentRecord>;
export type AgentVersionRegistrationData = z.infer<
  typeof AgentVersionRegistration
>;
export type AgentVersionRecordData = z.infer<typeof AgentVersionRecord>;
export type ExperimentCreateRequestData = z.infer<
  typeof ExperimentCreateRequest
>;
export type ExperimentRecordData = z.infer<typeof ExperimentRecord>;
export type ActionEnvelopeData = z.infer<typeof ActionEnvelope>;
export type ActionRecordData = z.infer<typeof ActionRecord>;
export type ExperimentPortfoliosData = z.infer<typeof ExperimentPortfolios>;
export type CorrectionRecordData = z.infer<typeof CorrectionRecord>;
export type QueueJobData = z.infer<typeof QueueJob>;
export type ActionIntentData = z.infer<typeof ActionIntent>;
export type ExperimentPolicyData = z.infer<typeof ExperimentPolicy>;
