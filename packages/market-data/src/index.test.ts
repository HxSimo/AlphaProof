import { describe, expect, it } from 'vitest';
import { PoaError } from '@poa/domain';
import {
  archiveJson,
  archiveRawJsonBytes,
  createObservation,
  MemoryObjectArchive,
  readArchivedJson,
  requireFresh,
  S3CompatibleObjectArchive,
} from './index.js';

const time = '2026-01-01T00:00:00.000Z';

describe('content-addressed raw input archive', () => {
  it('stores canonical bytes idempotently and rejects corrupted reads', async () => {
    const archive = new MemoryObjectArchive();
    const a = await archiveJson(archive, { b: '2', a: '1' }, time);
    const b = await archiveJson(archive, { a: '1', b: '2' }, time);
    expect(a.objectHash).toBe(b.objectHash);
    expect(archive.objects.size).toBe(1);
    expect(await readArchivedJson(archive, a)).toEqual({ a: '1', b: '2' });
    archive.objects.set(a.objectKey, new TextEncoder().encode('{}'));
    await expect(readArchivedJson(archive, a)).rejects.toMatchObject({
      code: 'ARCHIVE_INTEGRITY',
    });
  });

  it('preserves exact upstream JSON bytes instead of normalizing them', async () => {
    const archive = new MemoryObjectArchive();
    const first = await archiveRawJsonBytes(
      archive,
      new TextEncoder().encode('{"jsonrpc":"2.0", "result":"0x1"}\n'),
      time,
    );
    const second = await archiveRawJsonBytes(
      archive,
      new TextEncoder().encode('{"result":"0x1","jsonrpc":"2.0"}'),
      time,
    );
    expect(first.objectHash).not.toBe(second.objectHash);
    expect(await readArchivedJson(archive, first)).toEqual({
      jsonrpc: '2.0',
      result: '0x1',
    });
  });

  it('fails closed for missing and stale inputs', async () => {
    const archive = new MemoryObjectArchive();
    const descriptor = await archiveJson(archive, { value: '1' }, time);
    const observation = createObservation({
      observationId: 'test-observation',
      sourceId: 'fixture-source',
      sourceVersion: '1.0.0',
      parserVersion: '1.0.0',
      adapterVersion: '1.0.0',
      requestedAt: time,
      observedAt: time,
      expiresAt: '2026-01-01T00:01:00.000Z',
      block: null,
      rawObject: descriptor,
      resultProvenance: 'SYNTHETIC_TEST',
    });
    expect(() =>
      requireFresh(observation, '2026-01-01T00:01:00.000Z'),
    ).toThrowError(PoaError);
    const empty = new MemoryObjectArchive();
    await expect(readArchivedJson(empty, descriptor)).rejects.toMatchObject({
      code: 'DATA_UNAVAILABLE',
    });
  });

  it('uses the same contract for an injected S3-compatible driver', async () => {
    const objects = new Map<string, Uint8Array>();
    const archive = new S3CompatibleObjectArchive({
      async putObjectIfAbsent(key, bytes) {
        if (!objects.has(key)) objects.set(key, bytes.slice());
      },
      async getObject(key) {
        return objects.get(key)?.slice() ?? null;
      },
    });
    const descriptor = await archiveJson(
      archive,
      { source: 's3-fixture' },
      time,
    );
    expect(await readArchivedJson(archive, descriptor)).toEqual({
      source: 's3-fixture',
    });
  });
});
