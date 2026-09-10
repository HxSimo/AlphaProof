import { z } from 'zod';
import { Hash, Timestamp } from './primitives.js';
import { ShadowPortfolio, AccountingReceipt } from './accounting.js';
import {
  ActionEnvelope,
  ActionRecord,
  AgentVersionRecord,
} from './experiment.js';
import {
  AuditEvent,
  ExperimentPolicy,
  EvaluationReceipt,
  CommitmentBatch,
  ExecutionPlan,
} from './objects.js';
import { M4ReplayBundle } from './evaluation.js';
import {
  CommitmentLeafSet,
  ExportObject,
  MerkleProof,
  RegistryPublicationReceipt,
} from './m6.js';
import { IncidentRecord } from './operations.js';
import { SyntheticProfile } from './manifests.js';

export const DemoDiagnostic = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/demo-diagnostic/v1'),
  diagnosticVersion: z.literal('0.7.0'),
  kind: z.enum(['FAILURE_STRESS', 'LONGER_REPLAY']),
  presentationProvenance: z.enum(['SYNTHETIC_TEST', 'HISTORICAL_REPLAY']),
  sourceProvenance: z.literal('SYNTHETIC_TEST'),
  periodStartsAt: Timestamp,
  periodEndsAt: Timestamp,
  sourceDescription: z.string().min(1),
  scenarios: z
    .array(
      z.strictObject({
        initial: ShadowPortfolio,
        receipts: z.array(AccountingReceipt),
        expectedFinalHash: Hash,
        references: z
          .array(
            z.strictObject({
              kind: z.enum(['CASH', 'CONSERVATIVE_YIELD']),
              initial: ShadowPortfolio,
              receipts: z.array(AccountingReceipt),
              expectedFinalHash: Hash,
            }),
          )
          .length(2),
      }),
    )
    .length(3),
  rawInputs: z
    .array(z.strictObject({ contentHash: Hash, payload: z.unknown() }))
    .min(1),
  capitalScenarioRelationship: z.literal('CORRELATED_POLICY_VIEWS'),
  effectiveIndependentSampleCount: z.literal('1'),
  forwardObservationCount: z.literal('0'),
  automaticFundingEnabled: z.literal(false),
  limitations: z.array(z.string()).min(1),
});
export type DemoDiagnosticData = z.infer<typeof DemoDiagnostic>;

export const DemoSession = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/demo-session/v1'),
  sessionVersion: z.literal('0.7.0'),
  createdAt: Timestamp,
  resultProvenance: z.literal('SYNTHETIC_TEST'),
  agentVersion: AgentVersionRecord,
  policy: ExperimentPolicy,
  policyHash: Hash,
  profile: SyntheticProfile,
  initialPortfolios: z.array(ShadowPortfolio).length(3),
  actions: z
    .array(
      z.strictObject({
        record: ActionRecord,
        envelope: ActionEnvelope,
        plan: ExecutionPlan,
        inputBundle: z.unknown(),
        receipts: z.array(AccountingReceipt),
      }),
    )
    .length(3),
  referenceEntries: z.array(z.unknown()).length(3),
  checkpoints: z.array(M4ReplayBundle).length(3),
  eligibility: z.array(EvaluationReceipt).length(3),
  incidents: z.array(IncidentRecord),
  objects: z.array(ExportObject).min(1),
  auditEvents: z.array(AuditEvent).min(1),
  sourceFiles: z
    .array(
      z.strictObject({ path: z.string(), contentHash: Hash, utf8: z.string() }),
    )
    .min(1),
  commitment: z.strictObject({
    batch: CommitmentBatch,
    batchHash: Hash,
    leafSet: CommitmentLeafSet,
    proofs: z.array(MerkleProof).min(1),
    registryReceipt: RegistryPublicationReceipt.nullable(),
  }),
  limitations: z.array(z.string()).min(1),
  automaticFundingEnabled: z.literal(false),
});
export type DemoSessionData = z.infer<typeof DemoSession>;
