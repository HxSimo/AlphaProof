import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  canonicalJson,
  contentHash,
  PoaError,
  rawBytesHash,
} from '@poa/domain';
import {
  ArchivedObservation,
  type ArchivedObservationData,
  type RawObjectDescriptorData,
  SourceRef,
} from '@poa/schemas';

export interface ObjectArchive {
  putIfAbsent(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export class MemoryObjectArchive implements ObjectArchive {
  readonly objects = new Map<string, Uint8Array>();

  async putIfAbsent(key: string, bytes: Uint8Array) {
    const prior = this.objects.get(key);
    if (prior && !equal(prior, bytes))
      integrity(`Object key collision at ${key}`);
    if (!prior) this.objects.set(key, bytes.slice());
  }

  async get(key: string) {
    return this.objects.get(key)?.slice() ?? null;
  }
}

export class FileObjectArchive implements ObjectArchive {
  constructor(private readonly root: string) {}

  private path(key: string) {
    if (!/^raw\/keccak256\/0x[0-9a-f]{64}$/.test(key))
      integrity(`Invalid content-addressed object key: ${key}`);
    return join(this.root, key);
  }

  async putIfAbsent(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const prior = await readFile(path);
      if (!equal(prior, bytes)) integrity(`Object key collision at ${key}`);
    }
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

// Production supplies a credentialed S3-compatible driver. Keeping this small
// interface makes retention/restore tests possible without embedding credentials
// or treating a successful PUT as evidence that retention is configured.
export interface S3CompatibleDriver {
  putObjectIfAbsent(key: string, bytes: Uint8Array): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
}

export class S3CompatibleObjectArchive implements ObjectArchive {
  constructor(private readonly driver: S3CompatibleDriver) {}
  putIfAbsent(key: string, bytes: Uint8Array) {
    return this.driver.putObjectIfAbsent(key, bytes);
  }
  get(key: string) {
    return this.driver.getObject(key);
  }
}

function equal(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function integrity(message: string): never {
  throw new PoaError('ARCHIVE_INTEGRITY', message);
}

export async function archiveJson(
  archive: ObjectArchive,
  value: unknown,
  capturedAt: string,
): Promise<RawObjectDescriptorData> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const objectHash = rawBytesHash(bytes);
  const objectKey = `raw/keccak256/${objectHash}`;
  await archive.putIfAbsent(objectKey, bytes);
  return {
    schemaVersion: 'proof-of-alpha/raw-object/v1',
    objectHash,
    objectKey,
    mediaType: 'application/json',
    contentLengthBytes: String(bytes.length),
    capturedAt,
  };
}

export async function archiveRawJsonBytes(
  archive: ObjectArchive,
  bytes: Uint8Array,
  capturedAt: string,
): Promise<RawObjectDescriptorData> {
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    integrity('Raw object is not valid JSON');
  }
  const objectHash = rawBytesHash(bytes);
  const objectKey = `raw/keccak256/${objectHash}`;
  await archive.putIfAbsent(objectKey, bytes);
  return {
    schemaVersion: 'proof-of-alpha/raw-object/v1',
    objectHash,
    objectKey,
    mediaType: 'application/json',
    contentLengthBytes: String(bytes.length),
    capturedAt,
  };
}

export async function readArchivedJson(
  archive: ObjectArchive,
  descriptor: RawObjectDescriptorData,
): Promise<unknown> {
  const bytes = await archive.get(descriptor.objectKey);
  if (!bytes)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      `Archived object missing: ${descriptor.objectHash}`,
    );
  if (String(bytes.length) !== descriptor.contentLengthBytes)
    integrity(`Archived byte length differs for ${descriptor.objectHash}`);
  if (rawBytesHash(bytes) !== descriptor.objectHash)
    integrity(`Archived content hash differs for ${descriptor.objectHash}`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    integrity(`Archived JSON is invalid for ${descriptor.objectHash}`);
  }
}

export function createObservation(
  input: Omit<ArchivedObservationData, 'schemaVersion'>,
): ArchivedObservationData {
  return ArchivedObservation.parse({
    schemaVersion: 'proof-of-alpha/archived-observation/v1',
    ...input,
  });
}

export function requireFresh(
  observation: ArchivedObservationData,
  evaluationTime: string,
) {
  const parsed = ArchivedObservation.parse(observation);
  if (evaluationTime < parsed.observedAt || evaluationTime >= parsed.expiresAt)
    throw new PoaError(
      'DATA_STALE',
      `Observation ${parsed.observationId} is outside its validity interval`,
    );
  return parsed;
}

export function toSourceRef(
  observation: ArchivedObservationData,
  evaluationTime: string,
) {
  const fresh = requireFresh(observation, evaluationTime);
  return SourceRef.parse({
    sourceId: fresh.sourceId,
    sourceVersion: fresh.sourceVersion,
    requestedAt: fresh.requestedAt,
    observedAt: fresh.observedAt,
    block: fresh.block,
    rawObjectHash: fresh.rawObject.objectHash,
    parserVersion: fresh.parserVersion,
    adapterVersion: fresh.adapterVersion,
    freshness: 'FRESH',
    resultProvenance: fresh.resultProvenance,
  });
}

export const observationSourceHash = (refs: ReturnType<typeof toSourceRef>[]) =>
  contentHash({ schemaVersion: 'proof-of-alpha/adapter-sources/v1', refs });
