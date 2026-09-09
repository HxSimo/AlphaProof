# ADR-0009 — Prospective signed experiment boundary

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: experiment and signed-intent schema version 1.
- Supersedes: none.

## Context

An agent decision must be attributable to an authorized self-hosted key and durably received before economic planning. Arc registry deployment remains unverified, so a real EIP-712 verifying contract cannot yet be configured.

## Decision

Starting an experiment freezes the complete policy plus separate configuration, profile, adapter-set and parser-set hashes. PostgreSQL supplies `lockedAt` and `receivedAt`. Once started, a database trigger rejects changes to every policy-bearing field. Corrections append a new record and journal event that names the original and corrected hashes; they do not rewrite the policy or original evidence.

The signed EIP-712 message binds experiment, scenario, agent/version, policy, transfer policy, network profile, nonce, expected portfolio version, deadline, cost/transfer/slippage bounds, and `keccak256(POA-CJSON-1(allocation))`. `validUntil` is Unix seconds. The API stores the exact canonical typed-data bytes, signature, three hashes and durable receipt time in the same transaction that appends the acceptance event and job.

The SDK accepts a signer interface and never accepts or transmits a private key. The example process creates its account locally and sends only its address, declared hashes and signature.

## Local signing domain

M3 tests alone may start `synthetic-m3-local` when `POA_ENABLE_SYNTHETIC_M3=1`. It uses chain ID 31337, the zero address, and `SYNTHETIC_TEST` provenance. This is a declared non-deployment fixture and can never produce real-capital eligibility. Every manifest profile remains disabled. A real profile cannot start until its dependency gates and exact registry deployment pass verification.
