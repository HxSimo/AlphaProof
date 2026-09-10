import { z } from 'zod';
import { contentHash } from '@poa/domain';
import { EvaluationReceipt, AuditEvent, CommitmentBatch } from './objects.js';
import { ScenarioCheckpoint, ScenarioEvaluation } from './evaluation.js';
import {
  Address,
  BlockRef,
  Hash,
  Id,
  NetworkProfile,
  PositiveUInt,
  Provenance,
  Timestamp,
  Version,
} from './primitives.js';

export const CommitmentLeaf = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/commitment-leaf/v1'),
  domain: z.literal('PROOF_OF_ALPHA_AUDIT_LEAF_V1'),
  experimentId: Id,
  sequence: PositiveUInt,
  objectType: AuditEvent.shape.objectType,
  objectSchemaVersion: AuditEvent.shape.objectSchemaVersion,
  contentHash: Hash,
  auditEventHash: Hash,
  leafHash: Hash,
});

export const CommitmentLeafSet = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/commitment-leaf-set/v1'),
  batchId: Id,
  firstSequence: PositiveUInt,
  lastSequence: PositiveUInt,
  leaves: z.array(CommitmentLeaf).min(1),
});

export const MerkleProof = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/merkle-proof/v1'),
  batchId: Id,
  leafHash: Hash,
  leafIndex: z.number().int().nonnegative(),
  leafCount: z.number().int().positive(),
  siblings: z.array(
    z.strictObject({ side: z.enum(['LEFT', 'RIGHT']), hash: Hash }),
  ),
  root: Hash,
});

export const RegistryPublicationReceipt = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/registry-publication-receipt/v1'),
    batchId: Id,
    batchHash: Hash,
    experimentIdHash: Hash,
    registryNetworkId: Id,
    chainId: PositiveUInt,
    registryAddress: Address,
    registryCodeHash: Hash,
    publisherAddress: Address,
    transactionHash: Hash,
    block: BlockRef,
    observedAt: Timestamp,
    status: z.enum(['CONFIRMED', 'REORGED']),
  })
  .superRefine((receipt, ctx) => {
    if (
      receipt.status === 'CONFIRMED' &&
      receipt.block.finality !== 'FINALIZED'
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Confirmed publication requires finalized block evidence',
      });
    if (
      receipt.status === 'REORGED' &&
      receipt.block.finality !== 'INVALIDATED'
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Reorged publication requires an invalidated block',
      });
  });

export const ExportObject = z
  .strictObject({
    objectType: z.enum([
      'SCHEMA_CATALOG',
      'FROZEN_POLICY',
      'FROZEN_CONFIGURATION',
      'FROZEN_PROFILE',
      'ADAPTER_SET',
      'PARSER_SET',
      'SIGNED_INTENT',
      'RAW_INPUT_DESCRIPTOR',
      'RAW_INPUT',
      'ACCOUNTING_RECEIPT',
      'EXECUTION_RECEIPT',
      'TRANSFER_RECEIPT',
      'CHECKPOINT',
      'SCENARIO_EVALUATION',
      'ELIGIBILITY_EVALUATION',
      'INCIDENT',
    ]),
    schemaVersion: z
      .string()
      .regex(/^proof-of-alpha\/[a-z0-9-]+\/v[1-9][0-9]*$/),
    experimentId: Id.nullable(),
    scenarioId: Id.nullable(),
    resultProvenance: Provenance.nullable(),
    contentHash: Hash,
    payload: z.unknown(),
  })
  .superRefine((object, ctx) => {
    if (contentHash(object.payload) !== object.contentHash)
      ctx.addIssue({ code: 'custom', message: 'Export object hash mismatch' });
  });

export const ReproducibleExport = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/reproducible-export/v1'),
  exportId: Id,
  exportVersion: Version,
  createdAt: Timestamp,
  experimentId: Id,
  networkProfile: NetworkProfile,
  resultProvenance: Provenance,
  policyHash: Hash,
  configurationHash: Hash,
  profileHash: Hash,
  adapterSetHash: Hash,
  parserSetHash: Hash,
  engineVersions: z.strictObject({
    accounting: Version,
    planner: Version,
    execution: Version,
    valuation: Version,
    evaluation: Version,
    commitments: Version,
    export: Version,
  }),
  objects: z.array(ExportObject).min(1),
  auditEvents: z.array(AuditEvent).min(1),
  leaves: z.array(CommitmentLeaf).min(1),
  batches: z.array(CommitmentBatch).min(1),
  proofs: z.array(MerkleProof).min(1),
  registryReceipts: z.array(RegistryPublicationReceipt).min(1),
  selectedResult: z.strictObject({
    objectContentHash: Hash,
    auditSequence: PositiveUInt,
    leafHash: Hash,
    batchId: Id,
  }),
  requiredObjectHashes: z.array(Hash).min(1),
  limitations: z.array(z.string().min(1)).min(1),
  automaticFundingEnabled: z.literal(false),
});

export const DashboardScenario = z.strictObject({
  scenarioId: Id,
  initialAmountUsdcMinor: z.enum(['1000000000', '10000000000', '100000000000']),
  checkpoint: ScenarioCheckpoint,
  descriptiveEvaluation: ScenarioEvaluation,
  eligibility: EvaluationReceipt,
});

export const DashboardResponseV1 = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/dashboard/v1'),
    experimentId: Id,
    policyHash: Hash,
    networkProfile: NetworkProfile,
    resultProvenance: Provenance,
    capitalScenarioRelationship: z.literal('CORRELATED_POLICY_VIEWS'),
    effectiveIndependentSampleCount: z.literal('1'),
    scenarios: z.array(DashboardScenario).length(3),
    incidents: z.array(ExportObject),
    commitment: z.strictObject({
      batch: CommitmentBatch,
      proof: MerkleProof,
      registryReceipt: RegistryPublicationReceipt,
      verified: z.literal(true),
      timingClaim: z.literal('POST_EXECUTION_INTEGRITY_ONLY'),
    }),
    limitations: z.array(z.string().min(1)).min(1),
    automaticFundingEnabled: z.literal(false),
  })
  .superRefine((dashboard, ctx) => {
    const amounts = dashboard.scenarios.map((scenario) =>
      BigInt(scenario.initialAmountUsdcMinor),
    );
    if (
      new Set(dashboard.scenarios.map((scenario) => scenario.scenarioId))
        .size !== 3 ||
      amounts.some(
        (amount, index) => index > 0 && amount <= amounts[index - 1]!,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Dashboard requires three distinct independently ordered scenarios',
      });
  });

// Old reports retain the v1 schema; v2 can show canonical economics while an
// integrity publication is unavailable, without inventing a confirmed root.
export const DashboardResponse = z
  .strictObject({
    ...DashboardResponseV1.shape,
    schemaVersion: z.literal('proof-of-alpha/dashboard/v2'),
    commitment: DashboardResponseV1.shape.commitment.nullable(),
  })
  .superRefine((dashboard, ctx) => {
    const amounts = dashboard.scenarios.map((s) =>
      BigInt(s.initialAmountUsdcMinor),
    );
    if (
      new Set(dashboard.scenarios.map((s) => s.scenarioId)).size !== 3 ||
      amounts.some((n, i) => i > 0 && n <= amounts[i - 1]!)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Dashboard scenarios must be unique and independently ordered',
      });
  });

export type CommitmentLeafData = z.infer<typeof CommitmentLeaf>;
export type CommitmentLeafSetData = z.infer<typeof CommitmentLeafSet>;
export type MerkleProofData = z.infer<typeof MerkleProof>;
export type RegistryPublicationReceiptData = z.infer<
  typeof RegistryPublicationReceipt
>;
export type ExportObjectData = z.infer<typeof ExportObject>;
export type ReproducibleExportData = z.infer<typeof ReproducibleExport>;
export type DashboardResponseData = z.infer<typeof DashboardResponse>;
