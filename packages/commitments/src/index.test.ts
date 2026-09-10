import { expect, it } from 'vitest';
import { contentHash, PoaError } from '@poa/domain';
import type {
  AuditEventData,
  RegistryPublicationReceiptData,
} from '@poa/schemas';
import {
  assertAuditContinuity,
  assertBatchContinuity,
  auditEventHash,
  buildBatch,
  commitmentBatchHash,
  createAuditEvent,
  createProof,
  experimentIdHash,
  verifyProof,
  verifyPublication,
} from './index.js';

const hash = (value: string) => contentHash(value) as `0x${string}`;
const at = (minute: number) =>
  `2026-09-10T12:${String(minute).padStart(2, '0')}:00.000Z`;
const makeEvents = (count = 5) => {
  const events: AuditEventData[] = [];
  for (let index = 0; index < count; index++)
    events.push(
      createAuditEvent({
        experimentId: 'commitment-experiment',
        sequence: String(index + 1),
        objectType: index === count - 1 ? 'EVALUATION' : 'EXECUTION',
        occurredAt: at(index),
        resultProvenance: 'CROSS_CHAIN_TESTNET',
        objectSchemaVersion:
          index === count - 1
            ? 'proof-of-alpha/evaluation-receipt/v1'
            : 'proof-of-alpha/accounting-receipt/v1',
        contentHash: hash(`object-${index}`),
        previousEvent: events.at(-1) ?? null,
      }),
    );
  return events;
};

it('uses deterministic domain-separated leaves, odd-leaf roots and proofs', () => {
  const events = makeEvents();
  expect(assertAuditContinuity(events)).toHaveLength(5);
  const built = buildBatch({
    experimentId: 'commitment-experiment',
    batchId: 'batch-one',
    events,
  });
  expect(new Set(built.leafSet.leaves.map((leaf) => leaf.leafHash)).size).toBe(
    5,
  );
  expect(built.proofs.every(verifyProof)).toBe(true);
  expect(
    buildBatch({
      experimentId: 'commitment-experiment',
      batchId: 'batch-one',
      events,
    }).batch.root,
  ).toBe(built.batch.root);
  const tampered = structuredClone(built.proofs[2]!);
  tampered.siblings[0]!.hash = hash('tampered');
  expect(() => verifyProof(tampered)).toThrowError(PoaError);
});

it('detects audit gaps, overlaps, wrong predecessors and batch chain errors', () => {
  const events = makeEvents(4);
  expect(() =>
    assertAuditContinuity([
      events[0]!,
      { ...events[2]!, previousEventHash: auditEventHash(events[0]!) },
    ]),
  ).toThrow(/gap or overlap/);
  expect(() =>
    assertAuditContinuity([
      events[0]!,
      { ...events[1]!, previousEventHash: hash('wrong') },
    ]),
  ).toThrow(/predecessor/);
  const first = buildBatch({
    experimentId: 'commitment-experiment',
    batchId: 'batch-one',
    events: events.slice(0, 2),
  });
  const second = buildBatch({
    experimentId: 'commitment-experiment',
    batchId: 'batch-two',
    events: events.slice(2),
    previousBatchHash: first.batchHash,
  });
  expect(assertBatchContinuity([first.batch, second.batch])).toBe(true);
  expect(() =>
    assertBatchContinuity([
      first.batch,
      { ...second.batch, firstSequence: '4', lastSequence: '5' },
    ]),
  ).toThrow(/gap or overlap/);
  expect(() =>
    assertBatchContinuity([
      first.batch,
      { ...second.batch, previousBatchHash: hash('wrong') },
    ]),
  ).toThrow(/predecessor/);
});

it('binds a finalized registry receipt and detects reorged code or blocks', () => {
  const batch = buildBatch({
    experimentId: 'commitment-experiment',
    batchId: 'batch-one',
    events: makeEvents(2),
  }).batch;
  const receipt: RegistryPublicationReceiptData = {
    schemaVersion: 'proof-of-alpha/registry-publication-receipt/v1',
    batchId: batch.batchId,
    batchHash: commitmentBatchHash(batch),
    experimentIdHash: experimentIdHash(batch.experimentId),
    registryNetworkId: 'arc-testnet',
    chainId: '5042002',
    registryAddress: '0x1111111111111111111111111111111111111111',
    registryCodeHash: hash('registry-code'),
    publisherAddress: '0x2222222222222222222222222222222222222222',
    transactionHash: hash('publication'),
    block: {
      networkId: 'arc-testnet',
      environment: 'testnet',
      chainId: '5042002',
      number: '100',
      hash: hash('block'),
      timestamp: at(5),
      finality: 'FINALIZED',
    },
    observedAt: at(6),
    status: 'CONFIRMED',
  };
  expect(
    verifyPublication(batch, receipt, {
      blockHash: receipt.block.hash as `0x${string}`,
      registryCodeHash: receipt.registryCodeHash as `0x${string}`,
    }),
  ).toBe(true);
  expect(() =>
    verifyPublication(batch, receipt, {
      blockHash: hash('replacement-block'),
      registryCodeHash: receipt.registryCodeHash as `0x${string}`,
    }),
  ).toThrow(/not canonical/);
  expect(() =>
    verifyPublication(batch, receipt, {
      blockHash: receipt.block.hash as `0x${string}`,
      registryCodeHash: hash('replacement-code'),
    }),
  ).toThrow(/not canonical/);
  expect(() =>
    verifyPublication(batch, { ...receipt, batchHash: hash('other') }),
  ).toThrow(/does not bind/);
});

it('rejects an invalid proof index', () => {
  expect(() => createProof('batch-one', [hash('one')], 1)).toThrow(
    /out of range/,
  );
});
