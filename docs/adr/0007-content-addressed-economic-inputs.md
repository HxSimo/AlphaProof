# ADR-0007 — Content-addressed economic inputs and adapter replay

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: market-data and adapter version `1.0.0`; no external adapter is enabled.
- Supersedes: none.

## Context

M2 economic receipts depend on exact block reads, amount-specific protocol previews and quotes, measured gas, and a dated native-asset conversion. Re-querying any source during replay could change the result. Missing data cannot become a zero fee, zero impact, or successful operation.

## Decision

Archive exact upstream JSON bytes under `raw/keccak256/<hash>`. A descriptor commits to the hash, byte length, media type and capture time. Reads verify length and hash before parsing. Synthetic in-process values have a separate canonical JSON helper, while collectors use the raw-byte path so whitespace, ordering and provider formatting remain committed. Local memory and filesystem stores implement the same append-only `putIfAbsent` contract as the injected S3-compatible driver; a key collision with different bytes is an integrity error.

Every observation binds source, source version, parser version, adapter version, request/observation/expiry times, optional exact block, provenance and raw object. Callers provide the evaluation time. Inputs outside their validity interval fail with `DATA_STALE`; missing and corrupt objects fail with `DATA_UNAVAILABLE` and `ARCHIVE_INTEGRITY`.

Adapters parse archived payloads and emit M1 receipts. They do not decide policy or eligibility. Gas uses captured gas units and effective gas price with a captured ETH/USDC rational, rounding the USDC obligation up. Exact-input swaps recognize the token output gap once as `SWAP_FEE_IMPACT`; gas is a separate payable. A sufficient allowance produces a no-effect receipt and no repeated approval charge.

The replay bundle contains the initial portfolio, observation descriptors, ordered adapter steps and expected final portfolio hash. A separate process must reconstruct receipts from raw objects and pinned versions and match that hash.

## Consequences

Synthetic fixtures exercise the production parser boundary without claiming chain evidence. S3 credentials, retention policy and restore evidence remain an activation gate. Archive objects are immutable; corrected data creates a new object, observation and bundle. Source collectors retain exact responses; normalized adapter schemas encode large integers as strings.

## Activation gate

Forward shadow activation requires credentialed content storage, a finalized exact block, code hashes, source-specific freshness, amount-specific captures, and a successful replay restore. The local fixture pass alone cannot satisfy those evidence kinds.
