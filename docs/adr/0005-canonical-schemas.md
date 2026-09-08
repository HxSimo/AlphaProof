# ADR-0005 — Canonical wire schemas and trust boundaries

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: no experiment is active; proposed profiles must pass activation gates before X.
- Supersedes: none.

## Context

API, SDK, accounting, persistence and exports need a shared representation before independent implementations arrive.

## Constraints and evidence

- Locked requirements: authoritative project charter and v0.3 specification; M0 only is authorized.
- Current official/empirical evidence: see [source checks](../evidence/m0-source-checks.md) and [project state](../project-state.md).
- Unknowns: exact protocol addresses, deployed services, live fees/liquidity and fork/transaction evidence remain TO_VERIFY.

## Options considered

### Option A

Strict Zod schemas with generated JSON Schema and a small deterministic JSON subset.

### Option B

Coercing decimals through JavaScript number or relying on unversioned JSON.stringify defaults: ambiguous amounts and hashes.

## Decision

Use decimal-string uint256 minimum units, lowercase 0x hashes/addresses, strict unknown-field rejection and explicit asset/scenario/network identities. Small counts/scales/weights may use safe integer numbers. Allocation arrays are unique, positive-weight entries sorted by networkId/instrumentId, summing to 10000. Action validUntil is a decimal string of Unix seconds for EIP-712; server/archive timestamps use UTC ISO with millisecond precision. A separate policy snapshot binds declared agent version, profile/bundle/transfer hashes, engine sources/versions and signing domain.

## Consequences

POA-CJSON-1 orders object keys lexicographically by UTF-16, preserves array order, uses JSON string escaping and UTF-8 bytes; rejects unsafe/fractional numbers, -0, undefined, BigInt objects, getters, nonplain objects, cycles and lone surrogates. It does not claim full RFC 8785 conformance. Policy/content hashes use keccak256 of these bytes; EIP-712 typed-data hashing is a distinct M3 contract, not an interchangeable JSON hash. Generated JSON Schema covers shape; TS refinements and bundle validation enforce relational invariants. M0 schemas define boundaries, not full execution/eligibility implementations. M1–M6 may add versioned contracts with tests; no active experiment exists to migrate yet.

## Activation gate

Golden canonicalization, uint boundaries, ordering, policy timing, provenance, fake-attestation and unavailable-valuation cases pass. M3 must publish EIP-712 array/type definitions and cross-process signer vectors; M6 adds Merkle leaf domain separation and batch proofs.
