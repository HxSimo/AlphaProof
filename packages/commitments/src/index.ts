import {
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  toBytes,
  type Hex,
} from 'viem';
import {
  canonicalJson,
  contentHash,
  PoaError,
  rawBytesHash,
} from '@poa/domain';
import {
  AuditEvent,
  CommitmentBatch,
  CommitmentLeaf,
  CommitmentLeafSet,
  MerkleProof,
  RegistryPublicationReceipt,
  ReproducibleExport,
  type AuditEventData,
  type CommitmentBatchData,
  type CommitmentLeafData,
  type MerkleProofData,
  type RegistryPublicationReceiptData,
  type ReproducibleExportData,
} from '@poa/schemas';

export const LEAF_DOMAIN = 'PROOF_OF_ALPHA_AUDIT_LEAF_V1' as const;
export const NODE_DOMAIN = 'PROOF_OF_ALPHA_MERKLE_NODE_V1' as const;
export const BATCH_DOMAIN = 'PROOF_OF_ALPHA_COMMITMENT_BATCH_V1' as const;
export const ZERO_HASH = `0x${'0'.repeat(64)}` as Hex;
const textEncoder = new TextEncoder();

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function auditEventHash(eventInput: AuditEventData) {
  return contentHash(AuditEvent.parse(eventInput));
}

export function assertAuditContinuity(eventsInput: AuditEventData[]) {
  const events = eventsInput.map((event) => AuditEvent.parse(event));
  let previous: Hex | null = null;
  for (const [index, event] of events.entries()) {
    if (BigInt(event.sequence) !== BigInt(index + 1))
      throw new PoaError(
        'BATCH_CONTINUITY',
        'Audit sequence has a gap or overlap',
      );
    if (event.previousEventHash !== previous)
      throw new PoaError('BATCH_CONTINUITY', 'Audit event predecessor differs');
    previous = auditEventHash(event);
  }
  return events;
}

export function createAuditEvent(input: {
  experimentId: string;
  sequence: string;
  objectType: AuditEventData['objectType'];
  occurredAt: string;
  resultProvenance: AuditEventData['resultProvenance'];
  objectSchemaVersion: string;
  contentHash: Hex;
  previousEvent?: AuditEventData | null;
  supersedesContentHash?: Hex | null;
}) {
  const previous = input.previousEvent ?? null;
  if (
    BigInt(input.sequence) !== BigInt(previous?.sequence ?? '0') + 1n ||
    (previous && previous.experimentId !== input.experimentId)
  )
    throw new PoaError('BATCH_CONTINUITY', 'Audit event is not the next event');
  return AuditEvent.parse({
    schemaVersion: 'proof-of-alpha/audit-event/v1',
    experimentId: input.experimentId,
    sequence: input.sequence,
    objectType: input.objectType,
    occurredAt: input.occurredAt,
    resultProvenance: input.resultProvenance,
    objectSchemaVersion: input.objectSchemaVersion,
    contentHash: input.contentHash,
    previousEventHash: previous ? auditEventHash(previous) : null,
    supersedesContentHash: input.supersedesContentHash ?? null,
  });
}

export function leafHash(eventInput: AuditEventData): Hex {
  const event = AuditEvent.parse(eventInput);
  const body = {
    domain: LEAF_DOMAIN,
    experimentId: event.experimentId,
    sequence: event.sequence,
    objectType: event.objectType,
    objectSchemaVersion: event.objectSchemaVersion,
    contentHash: event.contentHash,
    auditEventHash: auditEventHash(event),
  };
  return rawBytesHash(
    concatBytes(
      textEncoder.encode(`${LEAF_DOMAIN}\0`),
      textEncoder.encode(canonicalJson(body)),
    ),
  );
}

export function createLeaf(eventInput: AuditEventData): CommitmentLeafData {
  const event = AuditEvent.parse(eventInput);
  return CommitmentLeaf.parse({
    schemaVersion: 'proof-of-alpha/commitment-leaf/v1',
    domain: LEAF_DOMAIN,
    experimentId: event.experimentId,
    sequence: event.sequence,
    objectType: event.objectType,
    objectSchemaVersion: event.objectSchemaVersion,
    contentHash: event.contentHash,
    auditEventHash: auditEventHash(event),
    leafHash: leafHash(event),
  });
}

function nodeHash(left: Hex, right: Hex): Hex {
  return rawBytesHash(
    concatBytes(
      textEncoder.encode(`${NODE_DOMAIN}\0`),
      hexToBytes(left),
      hexToBytes(right),
    ),
  );
}

function nextLevel(level: Hex[]) {
  const next: Hex[] = [];
  for (let index = 0; index < level.length; index += 2)
    next.push(nodeHash(level[index]!, level[index + 1] ?? level[index]!));
  return next;
}

export function merkleRoot(hashes: Hex[]): Hex {
  if (!hashes.length)
    throw new PoaError('COMMITMENT_INVALID', 'Merkle tree requires a leaf');
  let level = [...hashes];
  while (level.length > 1) level = nextLevel(level);
  return level[0]!;
}

export function createProof(
  batchId: string,
  hashes: Hex[],
  leafIndex: number,
): MerkleProofData {
  if (
    !Number.isInteger(leafIndex) ||
    leafIndex < 0 ||
    leafIndex >= hashes.length
  )
    throw new PoaError(
      'COMMITMENT_INVALID',
      'Merkle leaf index is out of range',
    );
  const siblings: MerkleProofData['siblings'] = [];
  let index = leafIndex;
  let level = [...hashes];
  while (level.length > 1) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    siblings.push({
      side: index % 2 === 0 ? 'RIGHT' : 'LEFT',
      hash: level[siblingIndex] ?? level[index]!,
    });
    index = Math.floor(index / 2);
    level = nextLevel(level);
  }
  return MerkleProof.parse({
    schemaVersion: 'proof-of-alpha/merkle-proof/v1',
    batchId,
    leafHash: hashes[leafIndex]!,
    leafIndex,
    leafCount: hashes.length,
    siblings,
    root: level[0],
  });
}

export function verifyProof(proofInput: MerkleProofData) {
  const proof = MerkleProof.parse(proofInput);
  let value = proof.leafHash as Hex;
  for (const sibling of proof.siblings)
    value =
      sibling.side === 'LEFT'
        ? nodeHash(sibling.hash as Hex, value)
        : nodeHash(value, sibling.hash as Hex);
  if (value !== proof.root)
    throw new PoaError('COMMITMENT_INVALID', 'Merkle inclusion proof differs');
  return true;
}

export function experimentIdHash(experimentId: string): Hex {
  return keccak256(toBytes(experimentId));
}

export function commitmentBatchHash(batchInput: CommitmentBatchData): Hex {
  const batch = CommitmentBatch.parse(batchInput);
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [
        keccak256(toBytes(BATCH_DOMAIN)),
        experimentIdHash(batch.experimentId),
        BigInt(batch.firstSequence),
        BigInt(batch.lastSequence),
        batch.root as Hex,
        (batch.previousBatchHash ?? ZERO_HASH) as Hex,
        batch.leavesObjectHash as Hex,
      ],
    ),
  );
}

export function buildBatch(input: {
  experimentId: string;
  batchId: string;
  events: AuditEventData[];
  previousBatchHash?: Hex | null;
  registryNetworkId?: string;
  status?: CommitmentBatchData['status'];
  transactionHash?: Hex | null;
  block?: CommitmentBatchData['block'];
}) {
  if (!input.events.length)
    throw new PoaError('COMMITMENT_INVALID', 'Batch requires audit events');
  const events = input.events.map((event) => AuditEvent.parse(event));
  for (const [index, event] of events.entries()) {
    if (event.experimentId !== input.experimentId)
      throw new PoaError('PROVENANCE_SPLICE', 'Batch combines experiments');
    if (
      index &&
      BigInt(event.sequence) !== BigInt(events[index - 1]!.sequence) + 1n
    )
      throw new PoaError(
        'BATCH_CONTINUITY',
        'Batch sequence has a gap or overlap',
      );
  }
  const leaves = events.map(createLeaf);
  const leafSet = CommitmentLeafSet.parse({
    schemaVersion: 'proof-of-alpha/commitment-leaf-set/v1',
    batchId: input.batchId,
    firstSequence: events[0]!.sequence,
    lastSequence: events.at(-1)!.sequence,
    leaves,
  });
  const root = merkleRoot(leaves.map((leaf) => leaf.leafHash as Hex));
  const batch = CommitmentBatch.parse({
    schemaVersion: 'proof-of-alpha/commitment-batch/v1',
    experimentId: input.experimentId,
    batchId: input.batchId,
    firstSequence: events[0]!.sequence,
    lastSequence: events.at(-1)!.sequence,
    root,
    previousBatchHash: input.previousBatchHash ?? null,
    leavesObjectHash: contentHash(leafSet),
    mode: 'PERIODIC_AFTER_RECEIPT',
    registryNetworkId: input.registryNetworkId ?? 'arc-testnet',
    status: input.status ?? 'PENDING',
    transactionHash: input.transactionHash ?? null,
    block: input.block ?? null,
  });
  return {
    batch,
    batchHash: commitmentBatchHash(batch),
    leafSet,
    proofs: leaves.map((_, index) =>
      createProof(
        input.batchId,
        leaves.map((leaf) => leaf.leafHash as Hex),
        index,
      ),
    ),
  };
}

export function assertBatchContinuity(batchesInput: CommitmentBatchData[]) {
  const batches = batchesInput.map((batch) => CommitmentBatch.parse(batch));
  let last = 0n;
  let previous: Hex | null = null;
  let experimentId: string | null = null;
  for (const batch of batches) {
    if (experimentId && batch.experimentId !== experimentId)
      throw new PoaError(
        'PROVENANCE_SPLICE',
        'Batch chain combines experiments',
      );
    if (BigInt(batch.firstSequence) !== last + 1n)
      throw new PoaError(
        'BATCH_CONTINUITY',
        'Batch chain has a gap or overlap',
      );
    if (batch.previousBatchHash !== previous)
      throw new PoaError('BATCH_CONTINUITY', 'Batch predecessor differs');
    experimentId = batch.experimentId;
    last = BigInt(batch.lastSequence);
    previous = commitmentBatchHash(batch);
  }
  return true;
}

export function verifyPublication(
  batchInput: CommitmentBatchData,
  receiptInput: RegistryPublicationReceiptData,
  canonical?: { blockHash: Hex; registryCodeHash: Hex },
) {
  const batch = CommitmentBatch.parse(batchInput);
  const receipt = RegistryPublicationReceipt.parse(receiptInput);
  if (
    receipt.batchId !== batch.batchId ||
    receipt.batchHash !== commitmentBatchHash(batch) ||
    receipt.experimentIdHash !== experimentIdHash(batch.experimentId) ||
    receipt.registryNetworkId !== batch.registryNetworkId
  )
    throw new PoaError(
      'COMMITMENT_INVALID',
      'Registry receipt does not bind the batch',
    );
  if (
    receipt.status === 'REORGED' ||
    (canonical?.blockHash !== undefined &&
      canonical.blockHash !== receipt.block.hash) ||
    (canonical?.registryCodeHash !== undefined &&
      canonical.registryCodeHash !== receipt.registryCodeHash)
  )
    throw new PoaError(
      'PUBLICATION_REORGED',
      'Registry publication is not canonical',
    );
  return true;
}

const REQUIRED_EXPORT_TYPES = [
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
] as const;

export const SUPPORTED_EXPORT_ENGINES = {
  accounting: '1.0.0',
  planner: '1.0.0',
  execution: '1.0.0',
  valuation: '1.0.0',
  evaluation: '1.0.0',
  commitments: '1.0.0',
  export: '1.0.0',
} as const;

export function verifyExport(input: ReproducibleExportData) {
  const bundle = ReproducibleExport.parse(input);
  for (const [engine, version] of Object.entries(SUPPORTED_EXPORT_ENGINES))
    if (
      bundle.engineVersions[engine as keyof typeof bundle.engineVersions] !==
      version
    )
      throw new PoaError(
        'VERSION_DRIFT',
        `Unsupported ${engine} engine version`,
      );
  const types = new Set(bundle.objects.map((object) => object.objectType));
  for (const type of REQUIRED_EXPORT_TYPES)
    if (!types.has(type))
      throw new PoaError('EXPORT_INCOMPLETE', `Export omits ${type}`);
  const objects = new Map(
    bundle.objects.map((object) => [object.contentHash, object]),
  );
  if (objects.size !== bundle.objects.length)
    throw new PoaError('EXPORT_INCOMPLETE', 'Export repeats an object hash');
  for (const required of bundle.requiredObjectHashes)
    if (!objects.has(required))
      throw new PoaError(
        'EXPORT_INCOMPLETE',
        'Required export object is absent',
      );
  for (const object of bundle.objects) {
    if (object.experimentId && object.experimentId !== bundle.experimentId)
      throw new PoaError('PROVENANCE_SPLICE', 'Export combines experiments');
    if (
      object.resultProvenance &&
      object.resultProvenance !== bundle.resultProvenance
    )
      throw new PoaError(
        'PROVENANCE_SPLICE',
        'Export combines provenance classes',
      );
  }
  const byType = (type: (typeof REQUIRED_EXPORT_TYPES)[number]) =>
    bundle.objects.find((object) => object.objectType === type)!;
  if (
    byType('FROZEN_POLICY').contentHash !== bundle.policyHash ||
    byType('FROZEN_CONFIGURATION').contentHash !== bundle.configurationHash ||
    byType('FROZEN_PROFILE').contentHash !== bundle.profileHash ||
    byType('ADAPTER_SET').contentHash !== bundle.adapterSetHash ||
    byType('PARSER_SET').contentHash !== bundle.parserSetHash
  )
    throw new PoaError('REPLAY_MISMATCH', 'Frozen experiment hashes differ');
  assertAuditContinuity(bundle.auditEvents);
  for (const event of bundle.auditEvents)
    if (!objects.has(event.contentHash))
      throw new PoaError('EXPORT_INCOMPLETE', 'Audit event object is absent');
  if (bundle.leaves.length !== bundle.auditEvents.length)
    throw new PoaError(
      'EXPORT_INCOMPLETE',
      'Export does not commit every audit event exactly once',
    );
  for (const [index, event] of bundle.auditEvents.entries()) {
    const leaf = bundle.leaves[index];
    if (
      !leaf ||
      contentHash(createLeaf(event)) !== contentHash(leaf) ||
      leaf.sequence !== event.sequence
    )
      throw new PoaError(
        'COMMITMENT_INVALID',
        'Committed leaf differs from audit event',
      );
  }
  assertBatchContinuity(bundle.batches);
  if (
    bundle.batches.at(-1)?.lastSequence !== bundle.auditEvents.at(-1)?.sequence
  )
    throw new PoaError(
      'EXPORT_INCOMPLETE',
      'Batch chain does not cover the complete audit sequence',
    );
  for (const batch of bundle.batches) {
    const leaves = bundle.leaves.filter(
      (leaf) =>
        BigInt(leaf.sequence) >= BigInt(batch.firstSequence) &&
        BigInt(leaf.sequence) <= BigInt(batch.lastSequence),
    );
    const expectedLeafCount =
      BigInt(batch.lastSequence) - BigInt(batch.firstSequence) + 1n;
    if (BigInt(leaves.length) !== expectedLeafCount)
      throw new PoaError(
        'BATCH_CONTINUITY',
        'Batch range does not contain every ordered leaf',
      );
    const leafSet = CommitmentLeafSet.parse({
      schemaVersion: 'proof-of-alpha/commitment-leaf-set/v1',
      batchId: batch.batchId,
      firstSequence: batch.firstSequence,
      lastSequence: batch.lastSequence,
      leaves,
    });
    if (
      contentHash(leafSet) !== batch.leavesObjectHash ||
      merkleRoot(leaves.map((leaf) => leaf.leafHash as Hex)) !== batch.root
    )
      throw new PoaError('COMMITMENT_INVALID', 'Batch leaf set differs');
    const proofs = bundle.proofs.filter(
      (proof) => proof.batchId === batch.batchId,
    );
    if (proofs.length !== leaves.length)
      throw new PoaError(
        'EXPORT_INCOMPLETE',
        'Batch does not include exactly one proof per leaf',
      );
    for (const [index, leaf] of leaves.entries()) {
      const matches = proofs.filter(
        (proof) => proof.leafHash === leaf.leafHash,
      );
      if (
        matches.length !== 1 ||
        matches[0]!.leafIndex !== index ||
        matches[0]!.leafCount !== leaves.length ||
        matches[0]!.root !== batch.root
      )
        throw new PoaError(
          'COMMITMENT_INVALID',
          'Batch proof does not bind its ordered leaf',
        );
      verifyProof(matches[0]!);
    }
    const receipts = bundle.registryReceipts.filter(
      (receipt) => receipt.batchId === batch.batchId,
    );
    if (receipts.length !== 1)
      throw new PoaError(
        'EXPORT_INCOMPLETE',
        'Batch does not include exactly one registry receipt',
      );
    verifyPublication(batch, receipts[0]!);
  }
  if (bundle.registryReceipts.length !== bundle.batches.length)
    throw new PoaError(
      'EXPORT_INCOMPLETE',
      'Export has an unbound registry receipt',
    );
  const selectedObject = objects.get(bundle.selectedResult.objectContentHash);
  const selectedEvent = bundle.auditEvents.find(
    (event) => event.sequence === bundle.selectedResult.auditSequence,
  );
  const selectedLeaf = bundle.leaves.find(
    (leaf) => leaf.leafHash === bundle.selectedResult.leafHash,
  );
  const selectedBatch = bundle.batches.find(
    (batch) => batch.batchId === bundle.selectedResult.batchId,
  );
  const selectedProof = bundle.proofs.find(
    (proof) =>
      proof.batchId === bundle.selectedResult.batchId &&
      proof.leafHash === bundle.selectedResult.leafHash,
  );
  const publication = bundle.registryReceipts.find(
    (receipt) => receipt.batchId === bundle.selectedResult.batchId,
  );
  if (
    !selectedObject ||
    !selectedEvent ||
    !selectedLeaf ||
    !selectedBatch ||
    !selectedProof ||
    !publication ||
    selectedEvent.contentHash !== selectedObject.contentHash ||
    selectedLeaf.contentHash !== selectedObject.contentHash ||
    selectedProof.root !== selectedBatch.root
  )
    throw new PoaError(
      'EXPORT_INCOMPLETE',
      'Selected result proof chain is incomplete',
    );
  verifyPublication(selectedBatch, publication);
  return {
    exportId: bundle.exportId,
    selectedObjectHash: selectedObject.contentHash,
    leafHash: selectedLeaf.leafHash,
    root: selectedBatch.root,
    batchHash: commitmentBatchHash(selectedBatch),
    transactionHash: publication.transactionHash,
  };
}
