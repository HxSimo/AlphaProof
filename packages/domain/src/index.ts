import { keccak256, toBytes } from 'viem';
export {
  hashTypedData,
  hexToString,
  recoverTypedDataAddress,
  stringToHex,
} from 'viem';
export type { Address, Hex } from 'viem';
export { privateKeyToAccount } from 'viem/accounts';

export const ERROR_CODES = [
  'INVALID_SCHEMA',
  'INVALID_CANONICAL_VALUE',
  'CONFIG_INVALID',
  'CONFIG_HASH_MISMATCH',
  'DEPENDENCY_UNVERIFIED',
  'PROFILE_DISABLED',
  'ENVIRONMENT_MISMATCH',
  'SCENARIO_BUSY',
  'STALE_PORTFOLIO',
  'NONCE_USED',
  'EXPIRED',
  'INVALID_SIGNATURE',
  'POLICY_VIOLATION',
  'UNSUPPORTED_INSTRUMENT',
  'INSUFFICIENT_AVAILABLE_BALANCE',
  'DATA_UNAVAILABLE',
  'QUOTE_UNAVAILABLE',
  'MIGRATION_CHANGED',
  'DATABASE_UNAVAILABLE',
  'ACCOUNTING_INVARIANT',
  'OPERATION_CONFLICT',
  'INVALID_TRANSITION',
  'CLOSED_PORTFOLIO',
  'PAYABLE_NOT_FOUND',
  'ARCHIVE_INTEGRITY',
  'DATA_STALE',
  'LIMIT_EXCEEDED',
  'LIQUIDITY_UNAVAILABLE',
  'SLIPPAGE_EXCEEDED',
  'REPLAY_MISMATCH',
  'AGENT_NOT_FOUND',
  'AGENT_VERSION_NOT_FOUND',
  'KEY_REVOKED',
  'EXPERIMENT_NOT_FOUND',
  'EXPERIMENT_NOT_STARTED',
  'EXPERIMENT_LOCKED',
  'IDEMPOTENCY_CONFLICT',
  'QUOTA_EXCEEDED',
  'PAYLOAD_TOO_LARGE',
  'JOB_LEASE_LOST',
  'COMMITMENT_INVALID',
  'BATCH_CONTINUITY',
  'PUBLICATION_REORGED',
  'EXPORT_INCOMPLETE',
  'VERSION_DRIFT',
  'PROVENANCE_SPLICE',
  'AUTH_REQUIRED',
  'RATE_LIMITED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export class PoaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PoaError';
  }
}

// POA-CJSON-1: strict JSON subset. Amounts are decimal strings; only small
// integer counters/scales may be numbers. No coercion, undefined or toJSON hooks.
export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();
  const invalid = (): never => {
    throw new PoaError(
      'INVALID_CANONICAL_VALUE',
      'Expected acyclic plain JSON with safe integer numbers',
    );
  };
  function encode(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'string') {
      if (/[\uD800-\uDFFF]/u.test(v)) return invalid();
      return JSON.stringify(v);
    }
    if (typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || Object.is(v, -0)) return invalid();
      return JSON.stringify(v);
    }
    if (typeof v !== 'object' || seen.has(v)) return invalid();
    seen.add(v);
    if (Object.getOwnPropertySymbols(v).length) return invalid();
    let out: string;
    if (Array.isArray(v)) {
      if (
        Object.keys(v).length !== v.length ||
        Object.getOwnPropertyNames(v).length !== v.length + 1
      )
        return invalid();
      out =
        '[' +
        Array.from({ length: v.length }, (_, i) => {
          const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
          if (!descriptor || !('value' in descriptor)) return invalid();
          return encode(descriptor.value);
        }).join(',') +
        ']';
    } else {
      if (
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        return invalid();
      if (Object.getOwnPropertyNames(v).length !== Object.keys(v).length)
        return invalid();
      const record = v as Record<string, unknown>;
      out =
        '{' +
        Object.keys(record)
          .sort()
          .map((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(record, key);
            if (!descriptor || !('value' in descriptor)) return invalid();
            return encode(key) + ':' + encode(record[key]);
          })
          .join(',') +
        '}';
    }
    seen.delete(v);
    return out;
  }
  return encode(value);
}

export const contentHash = (value: unknown): `0x${string}` =>
  keccak256(toBytes(canonicalJson(value)));
export const rawBytesHash = (value: Uint8Array): `0x${string}` =>
  keccak256(value);
export const RESULT_PROVENANCE = [
  'FORWARD_SHADOW',
  'HISTORICAL_REPLAY',
  'SYNTHETIC_TEST',
  'LIVE_SEPARATE',
  'CROSS_CHAIN_TESTNET',
  'MIXED_DIAGNOSTIC',
] as const;
export const NETWORK_PROFILES = [
  'ETHEREUM_MAINNET_FORWARD',
  'CROSS_CHAIN_TESTNET',
  'CROSS_CHAIN_MAINNET_FORWARD',
  'MIXED_DIAGNOSTIC',
] as const;
export const STANDARD_CAPITAL = [
  '1000000000',
  '10000000000',
  '100000000000',
] as const;
export const TRANSFER_STATES = [
  'RESERVED',
  'SOURCE_FAILED',
  'IN_TRANSIT',
  'READY_TO_RECEIVE',
  'DELAYED',
  'DESTINATION_RETRY',
  'SETTLED',
] as const;
