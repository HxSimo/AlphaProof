# ADR-0015 — M5 live evidence finality and resume

- Status: accepted
- Date: 2026-09-10
- Applies to: credentialed Sepolia ↔ Arc Testnet verification

## Context

The first credentialed attempt exposed two harness boundaries: environment keys may be raw 32-byte hex without an `0x` prefix, and Circle's decoded `mintRecipient` is a 20-byte address while the signed message carries a 32-byte word. A process can also stop after broadcasting a burn, so retrying by creating another burn would create a second source debit.

## Decision

Normalize either valid private-key spelling without logging it. Archive every transaction hash before its receipt wait and archive inclusion separately. Decode source domain, destination domain, amount and recipient from the raw CCTP v2 message and require agreement with Circle's decoded response. A resumed outbound burn is accepted only after re-fetching and decoding the exact transaction and checking every frozen call argument.

Dependent calls may proceed after successful inclusion. PASS is emitted only after one chain-level sweep proves every retained success and expected duplicate-receive revert is below the finalized head. A separate read-only capture binds finalized deployment block hashes to historical token/vault bytecode and token decimals. The verifier recomputes every content address and produces a deterministic evidence index.

## Consequences

The live harness remains restart-auditable without repeating a burn and avoids serial finality waits after every dependent call. Included artifacts cannot be presented as final until the sweep succeeds. All promoted entries are `VERIFIED_FOR_TESTNET`; the resulting profile remains ineligible for real capital and disabled until later independent gates are satisfied.
