import { readFileSync } from 'node:fs';
import { contentHash, type Hex } from '@poa/domain';
import { evaluateEligibility } from '@poa/evaluation';
import {
  ReproducibleExport,
  type AuditEventData,
  type ExportObjectData,
  type RegistryPublicationReceiptData,
} from '@poa/schemas';
import {
  buildBatch,
  commitmentBatchHash,
  createAuditEvent,
  experimentIdHash,
  verifyExport,
} from '@poa/commitments';

export interface PublicationEvidence {
  registryAddress: Hex;
  registryCodeHash: Hex;
  publisherAddress: Hex;
  transactionHash: Hex;
  blockNumber: string;
  blockHash: Hex;
  blockTimestamp: string;
  observedAt: string;
}

const at = '2026-09-10T12:00:00.000Z';
const experimentId = 'm6-export-fixture';
const provenance = 'SYNTHETIC_TEST' as const;

function exportObject(
  objectType: ExportObjectData['objectType'],
  schemaVersion: string,
  payload: unknown,
  scenarioId: string | null = 'capital-1k',
): ExportObjectData {
  return {
    objectType,
    schemaVersion,
    experimentId: objectType === 'SCHEMA_CATALOG' ? null : experimentId,
    scenarioId,
    resultProvenance: objectType === 'SCHEMA_CATALOG' ? null : provenance,
    contentHash: contentHash(payload),
    payload,
  };
}

export function createM6ExportFixture(
  publication?: PublicationEvidence,
  replayableEvaluation = false,
) {
  const schemaCatalog = JSON.parse(
    readFileSync('schemas/generated/v1.json', 'utf8'),
  );
  const policy = {
    schemaVersion: 'proof-of-alpha/frozen-policy-export/v1',
    experimentId,
    networkProfile: 'ETHEREUM_MAINNET_FORWARD',
    resultProvenance: provenance,
    automaticFundingEnabled: false,
  };
  const configuration = {
    schemaVersion: 'proof-of-alpha/frozen-configuration/v1',
    manifestBundleHash: contentHash('m6-fixture-manifest'),
    commitmentMode: 'PERIODIC_AFTER_RECEIPT',
  };
  const profile = {
    schemaVersion: 'proof-of-alpha/frozen-profile/v1',
    profileId: 'synthetic-m6-fixture',
    capitalAmountsUsdcMinor: ['1000000000', '10000000000', '100000000000'],
    resultProvenance: provenance,
  };
  const adapters = {
    schemaVersion: 'proof-of-alpha/adapter-set/v1',
    versions: [{ id: 'synthetic-m2-adapter', version: '1.0.0' }],
  };
  const parsers = {
    schemaVersion: 'proof-of-alpha/parser-set/v1',
    versions: [{ id: 'm2-economic-inputs', version: '1.0.0' }],
  };
  const checkpoint = {
    schemaVersion: 'proof-of-alpha/scenario-checkpoint/v1',
    checkpointId: 'fixture-checkpoint',
    dataQuality: 'FRESH',
    amountUsdcMinor: '1000000000',
  };
  const descriptiveEvaluation = {
    schemaVersion: 'proof-of-alpha/scenario-evaluation/v1',
    evaluationId: 'fixture-descriptive-evaluation',
    capitalScenarioRelationship: 'CORRELATED_POLICY_VIEWS',
  };
  const eligibility = replayableEvaluation
    ? evaluateEligibility({
        experimentId,
        scenarioId: 'capital-1k',
        policyHash: contentHash(policy),
        checkpointHash: contentHash(checkpoint),
        resultProvenance: provenance,
        networkProfile: 'ETHEREUM_MAINNET_FORWARD',
        operationalStatus: 'COMPLIANT',
        economicStatus: 'CRITERIA_MET',
        statisticalStatus: 'NOT_ASSESSED',
        statisticalMethodVersion: null,
      })
    : {
        schemaVersion: 'proof-of-alpha/evaluation-receipt/v1' as const,
        evaluationId: 'fixture-eligibility-evaluation',
        operationalStatus: 'COMPLIANT',
        economicStatus: 'CRITERIA_MET',
        statisticalStatus: 'NOT_ASSESSED',
        overallStatus: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
        automaticFundingEnabled: false,
        resultProvenance: provenance,
      };
  const objects = [
    exportObject(
      'SCHEMA_CATALOG',
      schemaCatalog.schemaVersion,
      schemaCatalog,
      null,
    ),
    exportObject('FROZEN_POLICY', policy.schemaVersion, policy, null),
    exportObject(
      'FROZEN_CONFIGURATION',
      configuration.schemaVersion,
      configuration,
      null,
    ),
    exportObject('FROZEN_PROFILE', profile.schemaVersion, profile, null),
    exportObject('ADAPTER_SET', adapters.schemaVersion, adapters, null),
    exportObject('PARSER_SET', parsers.schemaVersion, parsers, null),
    exportObject('SIGNED_INTENT', 'proof-of-alpha/signed-intent-bytes/v1', {
      schemaVersion: 'proof-of-alpha/signed-intent-bytes/v1',
      encoding: 'EIP712',
      bytesHex: '01020304',
      durableReceivedAt: at,
    }),
    exportObject(
      'RAW_INPUT_DESCRIPTOR',
      'proof-of-alpha/raw-input-descriptor/v1',
      {
        schemaVersion: 'proof-of-alpha/raw-input-descriptor/v1',
        objectKey: 'raw/keccak256/' + contentHash('fixture-raw'),
        sourceVersion: '1.0.0',
        parserVersion: '1.0.0',
        adapterVersion: '1.0.0',
      },
    ),
    exportObject('RAW_INPUT', 'proof-of-alpha/raw-input/v1', {
      schemaVersion: 'proof-of-alpha/raw-input/v1',
      bytesHex: '7b2266697874757265223a747275657d',
    }),
    exportObject('ACCOUNTING_RECEIPT', 'proof-of-alpha/accounting-receipt/v1', {
      schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
      operationId: 'fixture-accounting-operation',
      conservationVerified: true,
      resultProvenance: provenance,
    }),
    exportObject('EXECUTION_RECEIPT', 'proof-of-alpha/execution-receipt/v1', {
      schemaVersion: 'proof-of-alpha/execution-receipt/v1',
      actionId: 'fixture-action',
      status: 'PARTIALLY_SUCCEEDED',
      successfulPriorStepsPreserved: true,
    }),
    exportObject('TRANSFER_RECEIPT', 'proof-of-alpha/transfer-receipt/v1', {
      schemaVersion: 'proof-of-alpha/transfer-receipt/v1',
      transferId: 'fixture-transfer',
      state: 'SETTLED',
      destinationCreditCount: '1',
    }),
    exportObject(
      'CHECKPOINT',
      'proof-of-alpha/scenario-checkpoint/v1',
      checkpoint,
    ),
    exportObject(
      'SCENARIO_EVALUATION',
      'proof-of-alpha/scenario-evaluation/v1',
      descriptiveEvaluation,
    ),
    exportObject(
      'ELIGIBILITY_EVALUATION',
      'proof-of-alpha/evaluation-receipt/v1',
      eligibility,
    ),
  ];
  const auditEvents: AuditEventData[] = [];
  for (const [index, entry] of objects.entries())
    auditEvents.push(
      createAuditEvent({
        experimentId,
        sequence: String(index + 1),
        objectType:
          entry.objectType === 'ELIGIBILITY_EVALUATION'
            ? 'EVALUATION'
            : entry.objectType === 'TRANSFER_RECEIPT'
              ? 'TRANSFER'
              : entry.objectType === 'CHECKPOINT'
                ? 'VALUATION'
                : entry.objectType === 'SIGNED_INTENT'
                  ? 'ACTION_ACCEPTED'
                  : 'EXECUTION',
        occurredAt: at,
        resultProvenance: provenance,
        objectSchemaVersion: entry.schemaVersion,
        contentHash: entry.contentHash as Hex,
        previousEvent: auditEvents.at(-1) ?? null,
      }),
    );
  const pending = buildBatch({
    experimentId,
    batchId: 'm6-export-batch',
    events: auditEvents,
  });
  const evidence: PublicationEvidence = publication ?? {
    registryAddress: '0x1111111111111111111111111111111111111111',
    registryCodeHash: contentHash('synthetic-registry-code'),
    publisherAddress: '0x2222222222222222222222222222222222222222',
    transactionHash: contentHash('synthetic-publication-transaction'),
    blockNumber: '100',
    blockHash: contentHash('synthetic-publication-block'),
    blockTimestamp: at,
    observedAt: at,
  };
  const receipt: RegistryPublicationReceiptData = {
    schemaVersion: 'proof-of-alpha/registry-publication-receipt/v1',
    batchId: pending.batch.batchId,
    batchHash: pending.batchHash,
    experimentIdHash: experimentIdHash(experimentId),
    registryNetworkId: 'arc-testnet',
    chainId: '5042002',
    registryAddress: evidence.registryAddress,
    registryCodeHash: evidence.registryCodeHash,
    publisherAddress: evidence.publisherAddress,
    transactionHash: evidence.transactionHash,
    block: {
      networkId: 'arc-testnet',
      environment: 'testnet',
      chainId: '5042002',
      number: evidence.blockNumber,
      hash: evidence.blockHash,
      timestamp: evidence.blockTimestamp,
      finality: 'FINALIZED',
    },
    observedAt: evidence.observedAt,
    status: 'CONFIRMED',
  };
  const batch = {
    ...pending.batch,
    status: 'CONFIRMED' as const,
    transactionHash: receipt.transactionHash,
    block: receipt.block,
  };
  const selectedEvent = auditEvents.at(-1)!;
  const selectedLeaf = pending.leafSet.leaves.at(-1)!;
  const bundle = ReproducibleExport.parse({
    schemaVersion: 'proof-of-alpha/reproducible-export/v1',
    exportId: 'm6-export-fixture',
    exportVersion: '1.0.0',
    createdAt: evidence.observedAt,
    experimentId,
    networkProfile: 'ETHEREUM_MAINNET_FORWARD',
    resultProvenance: provenance,
    policyHash: contentHash(policy),
    configurationHash: contentHash(configuration),
    profileHash: contentHash(profile),
    adapterSetHash: contentHash(adapters),
    parserSetHash: contentHash(parsers),
    engineVersions: {
      accounting: '1.0.0',
      planner: '1.0.0',
      execution: '1.0.0',
      valuation: '1.0.0',
      evaluation: '1.0.0',
      commitments: '1.0.0',
      export: '1.0.0',
    },
    objects,
    auditEvents,
    leaves: pending.leafSet.leaves,
    batches: [batch],
    proofs: pending.proofs,
    registryReceipts: [receipt],
    selectedResult: {
      objectContentHash: selectedEvent.contentHash,
      auditSequence: selectedEvent.sequence,
      leafHash: selectedLeaf.leafHash,
      batchId: batch.batchId,
    },
    requiredObjectHashes: objects.map((entry) => entry.contentHash),
    limitations: [
      'Synthetic fixture; never real-capital eligible.',
      'Periodic Arc anchoring proves integrity after publication, not pre-execution receipt time.',
    ],
    automaticFundingEnabled: false,
  });
  verifyExport(bundle);
  return {
    bundle,
    batch,
    batchHash: commitmentBatchHash(batch),
    receipt,
  };
}

/** Appends a canonical eligibility correction without rewriting the first
 * publication. Both report versions and both batch roots remain provable. */
export function createM6CorrectedExportFixture(
  publication?: PublicationEvidence,
  firstPublication?: PublicationEvidence,
  correctionOccurredAt = publication?.observedAt ?? at,
) {
  const first = createM6ExportFixture(firstPublication);
  const oldObject = first.bundle.objects.find(
    (entry) =>
      entry.contentHash === first.bundle.selectedResult.objectContentHash,
  )!;
  const policy = first.bundle.objects.find(
    (entry) => entry.objectType === 'FROZEN_POLICY',
  )!;
  const checkpoint = first.bundle.objects.find(
    (entry) => entry.objectType === 'CHECKPOINT',
  )!;
  const correctedReceipt = evaluateEligibility({
    experimentId,
    scenarioId: 'capital-1k',
    policyHash: policy.contentHash as Hex,
    checkpointHash: checkpoint.contentHash as Hex,
    resultProvenance: provenance,
    networkProfile: 'ETHEREUM_MAINNET_FORWARD',
    operationalStatus: 'COMPLIANT',
    economicStatus: 'CRITERIA_MET',
    statisticalStatus: 'NOT_ASSESSED',
    statisticalMethodVersion: null,
    supersedesHash: oldObject.contentHash as Hex,
  });
  const correctedObject = exportObject(
    'ELIGIBILITY_EVALUATION',
    correctedReceipt.schemaVersion,
    correctedReceipt,
  );
  const correctedEvent = createAuditEvent({
    experimentId,
    sequence: '16',
    objectType: 'EVALUATION',
    occurredAt: correctionOccurredAt,
    resultProvenance: provenance,
    objectSchemaVersion: correctedObject.schemaVersion,
    contentHash: correctedObject.contentHash as Hex,
    previousEvent: first.bundle.auditEvents.at(-1)!,
    supersedesContentHash: oldObject.contentHash as Hex,
  });
  const pending = buildBatch({
    experimentId,
    batchId: 'm6-export-correction-batch',
    events: [correctedEvent],
    previousBatchHash: first.batchHash,
  });
  const evidence: PublicationEvidence = publication ?? {
    registryAddress: first.receipt.registryAddress as Hex,
    registryCodeHash: first.receipt.registryCodeHash as Hex,
    publisherAddress: first.receipt.publisherAddress as Hex,
    transactionHash: contentHash('synthetic-correction-publication'),
    blockNumber: '101',
    blockHash: contentHash('synthetic-correction-block'),
    blockTimestamp: at,
    observedAt: at,
  };
  const receipt: RegistryPublicationReceiptData = {
    schemaVersion: 'proof-of-alpha/registry-publication-receipt/v1',
    batchId: pending.batch.batchId,
    batchHash: pending.batchHash,
    experimentIdHash: experimentIdHash(experimentId),
    registryNetworkId: 'arc-testnet',
    chainId: '5042002',
    registryAddress: evidence.registryAddress,
    registryCodeHash: evidence.registryCodeHash,
    publisherAddress: evidence.publisherAddress,
    transactionHash: evidence.transactionHash,
    block: {
      networkId: 'arc-testnet',
      environment: 'testnet',
      chainId: '5042002',
      number: evidence.blockNumber,
      hash: evidence.blockHash,
      timestamp: evidence.blockTimestamp,
      finality: 'FINALIZED',
    },
    observedAt: evidence.observedAt,
    status: 'CONFIRMED',
  };
  const batch = {
    ...pending.batch,
    status: 'CONFIRMED' as const,
    transactionHash: receipt.transactionHash,
    block: receipt.block,
  };
  const bundle = ReproducibleExport.parse({
    ...first.bundle,
    exportId: 'm6-corrected-export-fixture',
    createdAt: evidence.observedAt,
    objects: [...first.bundle.objects, correctedObject],
    auditEvents: [...first.bundle.auditEvents, correctedEvent],
    leaves: [...first.bundle.leaves, ...pending.leafSet.leaves],
    batches: [first.batch, batch],
    proofs: [...first.bundle.proofs, ...pending.proofs],
    registryReceipts: [first.receipt, receipt],
    selectedResult: {
      objectContentHash: correctedObject.contentHash,
      auditSequence: correctedEvent.sequence,
      leafHash: pending.leafSet.leaves[0]!.leafHash,
      batchId: batch.batchId,
    },
    requiredObjectHashes: [
      ...first.bundle.requiredObjectHashes,
      correctedObject.contentHash,
    ],
    limitations: [
      ...first.bundle.limitations,
      'The original report and first commitment remain available; this canonical receipt is an append-only correction.',
    ],
  });
  verifyExport(bundle);
  return {
    bundle,
    batch,
    batchHash: commitmentBatchHash(batch),
    receipt,
    first,
    correctedReceipt,
  };
}
