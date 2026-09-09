# ADR-0013 — Finite funded test-vault yield

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: Sepolia and Arc Testnet demonstration vault version 1.0.0
- Supersedes: none

## Context

The cross-chain demonstration needs a synchronous USDC deposit and withdrawal on both test networks. Testnet yield cannot stand in for market yield, and an unlimited faucet or administrator mint would make the accounting meaningless.

## Decision

`FiniteYieldVault` is a test-only ERC-4626-compatible vault with six-decimal shares. Its sole schedule owner funds one finite USDC budget in `freezeYieldSchedule`. The call must succeed before the schedule starts and can never be repeated. Unvested tokens are excluded from `totalAssets`; vested yield enters linearly from the frozen start through the frozen end. Deposit and redeem use integer floor output, while mint and withdraw use integer ceiling obligations.

The credentialed M5 gate deploys a fresh immutable-asset vault on Sepolia and Arc Testnet, verifies runtime code and owner/asset identity, funds and reads back the schedule before experiment start, and performs an actual deposit/redeem round trip. The deployment, funding, bytecode and transaction receipts are content addressed. Until those artifacts exist, both manifest addresses remain null, disabled and `TO_VERIFY`.

## Consequences

The schedule proves only technical accounting and lifecycle behavior. It makes no APY, safety, liquidity or economic-performance claim. Test USDC funding and native gas never enter a shadow portfolio as free capital. A later deployment creates new manifest evidence; it does not rewrite an old experiment.
