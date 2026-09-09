# ADR-0008 — M2 Ethereum adapter boundaries

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: Aave V3, MetaMorpho V1 family and Uniswap V3 adapter version `1.0.0`.
- Supersedes: none.

## Context

The first local economic slice needs lending, a synchronous ERC-4626 vault, and a direct stablecoin swap while the current environment lacks an archive RPC, a selected vault instance, a verified conversion feed and production object storage.

## Decision

Use Aave V3 supply and withdraw for USDC and USDT. The adapter accepts archived reserve state containing asset identity, scales, liquidity index, supply cap, supplied amount, available liquidity and active/frozen/paused flags. It rejects an inadmissible entry or exit before receipt creation. Book accrual uses the observed liquidity-index ratio with conservative M1 floor rounding.

Select the Morpho MetaMorpho V1 contract family for the M2 ERC-4626 boundary. An exact USDC vault instance remains unselected until its current curator, queues, caps, fee behavior, code and exit liquidity pass a pinned-block test. The adapter consumes exact captured previews and all max/capacity values for the requested amount; it never estimates a large virtual holder from a smaller preview.

Use the original Uniswap V3 periphery `SwapRouter` and `Quoter` family for direct USDC/USDT exact-input execution. Pool and fee-tier selection is performed only among archived quotes for the exact direction and amount. The greatest output net of separately captured gas wins, with pool ID as the deterministic tie break. A quote below the frozen minimum output fails.

The three capital values are separate adapter calls and separate gas/quote/preview observations. No fixture is multiplied to represent another size. Protocol output gaps, protocol fees, approvals and gas have distinct cost identities so M1 idempotency prevents duplicate effects.

## Source evidence and limits

The official Aave address book commit `09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9`, Uniswap V3 periphery commit `0682387198a24c7cd63566a2c58398533860a5d1`, and MetaMorpho source commit `ded84e59668155b34d3c24906c4f7461c12828af` are recorded with raw content hashes in the manifest. Source review does not verify deployed bytecode, current capacity, a pool route, fees, a vault instance or a successful transaction.

## Activation gate

All three dependencies remain `TO_VERIFY` and disabled. Run the fixed-block suite with the exact variables in `docs/runbooks/m2-integration-verification.md`, archive its RPC inputs and gas/feed outputs, verify source code hashes, and add every required manifest evidence kind before creating an enabled manifest version.
