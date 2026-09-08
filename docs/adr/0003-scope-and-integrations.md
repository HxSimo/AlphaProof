# ADR-0003 — Integration scope and honest demo path

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: no experiment is active; proposed profiles must pass activation gates before X.
- Supersedes: none.

## Context

The v0.3 Ethereum catalog proposes two vaults, while the delivery plan permits cutting equivalent instruments to protect end-to-end correctness. No deployed target has been verified in this repository.

## Constraints and evidence

- Locked requirements: authoritative project charter and v0.3 specification; M0 only is authorized.
- Current official/empirical evidence: see [source checks](../evidence/m0-source-checks.md) and [project state](../project-state.md).
- Unknowns: exact protocol addresses, deployed services, live fees/liquidity and fork/transaction evidence remain TO_VERIFY.

## Options considered

### Option A

One Aave V3 adapter supporting USDC and USDT, one synchronous USDC vault family, one direct Uniswap V3 USDC/USDT swap path, two test vault deployments, one CCTP adapter and an Arc registry.

### Option B

Two similar Ethereum vaults, multiple swap aggregators or a sponsor-only data integration: extra verification surface without a new critical capability.

## Decision

Accept one Ethereum USDC vault instead of two for the initial MVP. Gauntlet Prime/Core remain review candidates; no exact vault is selected or endorsed. Aave V3 USDC is the proposed passive economic reference; the Sepolia vault is only a technical reference. Both CCTP directions and Arc test-vault deposit/withdraw remain mandatory. The Graph is optional only if indexed history helps the agent; Privy, World, Hedera/x402, alternate bridges/routers, custom profile editor and advanced inference are cut/deferred.

## Consequences

M2 demonstrates real Ethereum mechanics under fixed-block/captured evidence. M5 demonstrates actual Sepolia↔Arc test-token lifecycle separately. Sepolia has no allowlisted USDT route in M0: the presentation must not pretend the Ethereum swap receipt and testnet transfer form one clean economic history. If a compressed combined narrative needs a swap, label the entire scenario synthetic. All 23 external inventory entries stay TO_VERIFY; mocks cannot satisfy M5 actual-transaction exit.

## Activation gate

Exact official deployments, matching RPC chain/code, archived inputs, fixed-block cases and direction-specific actual test-token receipts are required before activating their respective integrations.
