import { z } from 'zod';
import { ERROR_CODES, NETWORK_PROFILES, RESULT_PROVENANCE } from '@poa/domain';

export const Id = z.string().regex(/^[a-z][a-z0-9-]{0,95}$/);
export const Hash = z.string().regex(/^0x[0-9a-f]{64}$/);
export const Address = z.string().regex(/^0x[0-9a-f]{40}$/);
export const UInt = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine(
    (v) => /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n,
    'Expected uint256',
  );
export const PositiveUInt = UInt.refine((v) => v !== '0', 'Must be positive');
export const Int = z
  .string()
  .regex(/^(0|-?[1-9][0-9]{0,77})$/)
  .refine(
    (v) =>
      /^(0|-?[1-9][0-9]{0,77})$/.test(v) &&
      BigInt(v) >= -(1n << 255n) &&
      BigInt(v) < 1n << 255n,
    'Expected int256',
  );
export const Bps = z.number().int().min(0).max(10000);
export const Seconds = z.number().int().positive().max(31536000);
export const Timestamp = z.iso.datetime({ precision: 3 });
export const Version = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/);
export const Environment = z.enum(['mainnet', 'testnet']);
export const NetworkProfile = z.enum(NETWORK_PROFILES);
export const Provenance = z.enum(RESULT_PROVENANCE);
export const ErrorCode = z.enum(ERROR_CODES);
export const RequirementStatus = z.enum([
  'LOCKED',
  'PROPOSED',
  'TO_VERIFY',
  'POST_MVP',
]);
export const BlockRef = z.strictObject({
  networkId: Id,
  environment: Environment,
  chainId: PositiveUInt,
  number: UInt,
  hash: Hash,
  timestamp: Timestamp,
  finality: z.enum(['PROVISIONAL', 'FINALIZED', 'INVALIDATED']),
});
export const Amount = z.strictObject({
  networkId: Id,
  assetId: Id,
  assetAddress: Address,
  decimals: z.number().int().min(0).max(36),
  minor: UInt,
});
export const SourceRef = z.strictObject({
  sourceId: Id,
  sourceVersion: Version,
  requestedAt: Timestamp,
  observedAt: Timestamp,
  block: BlockRef.nullable(),
  rawObjectHash: Hash,
  parserVersion: Version,
  adapterVersion: Version,
  freshness: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
  resultProvenance: Provenance,
});
export const AllocationEntry = z.strictObject({
  networkId: Id,
  instrumentId: Id,
  weightBps: Bps.refine((v) => v > 0),
});
export const Allocation = z
  .array(AllocationEntry)
  .min(1)
  .max(32)
  .superRefine((entries, ctx) => {
    if (entries.reduce((sum, x) => sum + x.weightBps, 0) !== 10000)
      ctx.addIssue({ code: 'custom', message: 'Weights must sum to 10000' });
    const keys = entries.map((x) => `${x.networkId}/${x.instrumentId}`);
    if (keys.some((key, i) => i > 0 && key <= keys[i - 1]!))
      ctx.addIssue({
        code: 'custom',
        message:
          'Allocation must be unique and sorted by networkId/instrumentId',
      });
  });

export type NetworkProfileData = z.infer<typeof NetworkProfile>;
export type ProvenanceData = z.infer<typeof Provenance>;
