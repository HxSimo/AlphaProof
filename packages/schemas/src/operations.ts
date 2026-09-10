import { RegistryPublicationReceipt } from './m6.js';
import { z } from 'zod';
import { Hash, Id, Provenance, Timestamp, UInt } from './primitives.js';

export const IncidentInput = z.strictObject({
  incidentId: Id,
  experimentId: Id,
  scenarioId: Id.nullable(),
  code: z.enum([
    'WORKER_INTERRUPTED',
    'RETRY_EXHAUSTED',
    'DATA_STALE',
    'DATA_UNAVAILABLE',
    'REFERENCE_UNAVAILABLE',
    'TRANSFER_DELAYED',
    'UNRESOLVED_AT_CLOSURE',
    'PARTIAL_EXECUTION',
    'EXECUTION_FAILED',
    'INTENT_EXPIRED',
    'STOPPED_EARLY',
    'PUBLICATION_UNAVAILABLE',
    'RECOVERY_COMPLETED',
  ]),
  severity: z.enum(['INFO', 'WARNING', 'ERROR']),
  message: z.string().min(1).max(1000),
  evidenceHashes: z.array(Hash).max(32),
  resolvesIncidentId: Id.nullable(),
});
export const IncidentRecord = IncidentInput.extend({
  schemaVersion: z.literal('proof-of-alpha/incident/v1'),
  occurredAt: Timestamp,
  resultProvenance: Provenance,
});
export const OperationsPolicy = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/operations-policy/v1'),
  version: z.literal('0.7.0'),
  parameterStatus: z.literal('PROPOSED_NOT_PRODUCTION'),
  requestWindowSeconds: z.number().int().min(1).max(3600),
  requestsPerWindowPerClient: z.number().int().min(1).max(10000),
  maxActiveAgents: z.number().int().positive(),
  maxActiveExperimentsPerAgentProfile: z.literal(1),
  workerStaleSeconds: z.number().int().min(30),
  queueAlertSeconds: z.number().int().positive(),
  automaticFundingEnabled: z.literal(false),
});
export const OperationsSnapshot = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/operations-snapshot/v1'),
  observedAt: Timestamp,
  policyHash: Hash,
  status: z.enum(['HEALTHY', 'DEGRADED']),
  alerts: z.array(z.string()),
  jobs: z.array(
    z.strictObject({ state: z.string(), count: UInt, maxAttempt: UInt }),
  ),
  oldestRunnableAgeSeconds: UInt.nullable(),
  workers: z.array(
    z.strictObject({
      workerId: Id,
      lastSeenAt: Timestamp,
      lastStatus: z.string(),
      stale: z.boolean(),
    }),
  ),
  openIncidentCount: UInt,
  rejectedRequestCount: UInt,
  automaticFundingEnabled: z.literal(false),
});
export type IncidentInputData = z.infer<typeof IncidentInput>;
export type IncidentRecordData = z.infer<typeof IncidentRecord>;
export type OperationsPolicyData = z.infer<typeof OperationsPolicy>;
export type OperationsSnapshotData = z.infer<typeof OperationsSnapshot>;

export const DemoRehearsal = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/demo-rehearsal/v1'),
  startedAt: Timestamp,
  completedAt: Timestamp,
  elapsedMilliseconds: z.number().int().nonnegative(),
  selectedExport: z.string().min(1),
  sessionCreatedAt: Timestamp,
  sessionHash: Hash,
  publication: RegistryPublicationReceipt.nullable(),
  mode: z.literal('LOCAL_REHEARSAL_WITH_RETAINED_TESTNET_ANCHOR'),
  resultProvenance: z.literal('SYNTHETIC_TEST'),
  freshEthereumSession: z.literal(false),
  forwardObservationCount: z.literal('0'),
  modifiedLeafRejected: z.literal(true),
  steps: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        script: z.string().min(1),
        args: z.array(z.string()),
        status: z.enum(['PASS', 'SKIPPED_TO_VERIFY']),
        elapsedMilliseconds: z.number().int().nonnegative(),
        output: z.string(),
      }),
    )
    .min(1),
  limitations: z.array(z.string()).min(1),
  automaticFundingEnabled: z.literal(false),
});

export type DemoRehearsalData = z.infer<typeof DemoRehearsal>;
