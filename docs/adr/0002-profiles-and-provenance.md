# ADR-0002 — Evidence profiles and configuration identity

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: no experiment is active; proposed profiles must pass activation gates before X.
- Supersedes: none.

## Context

The demo uses Arc Testnet while economic forward observations use Ethereum mainnet. The source permits a testnet registry for a mainnet economic experiment, but forbids mixing market evidence.

## Constraints and evidence

- Locked requirements: authoritative project charter and v0.3 specification; M0 only is authorized.
- Current official/empirical evidence: see [source checks](../evidence/m0-source-checks.md) and [project state](../project-state.md).
- Unknowns: exact protocol addresses, deployed services, live fees/liquidity and fork/transaction evidence remain TO_VERIFY.

## Options considered

### Option A

Separate versioned Ethereum forward, cross-chain testnet and disabled future cross-chain mainnet profiles.

### Option B

One mixed profile for all demonstrations: could falsely attribute artificial test yield to mainnet economics.

## Decision

Accept three separate profile templates, all disabled at M0. A registry network is distinct from market networks. CROSS_CHAIN_MAINNET_FORWARD cannot activate in v0.1.0 even by toggling every gate: it requires a new mainnet gas-funding policy and exact verified targets. Diagnostic fixtures/replays are identified by provenance and are never appended to a forward series. Every active numerical setting remains PROPOSED_NOT_PRODUCTION until a future experiment freezes a versioned snapshot before X.

## Consequences

JSON manifests adapt the supplied YAML templates; null means unresolved, never an illustrative address. Required dependencies carry evidence kinds, blockers, official entry points and disabled activation. POA-CJSON-1 plus keccak256 binds every config file into a bundle seal. An initial seal is a reproducibility check, not a public commitment or experiment start. A material change creates a new manifest/profile version and a new experiment or explicit correction; no historical overwrite.

## Activation gate

M0 manifest tests reject cross-environment routes, unresolved activation, unknown/duplicate identities, wrong references/provenance and changed seals. M3 must enforce frozen snapshots transactionally and M6 must anchor/verifiably export them.
