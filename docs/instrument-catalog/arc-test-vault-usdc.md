# Instrument fact sheet — arc-test-vault-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.3.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: arc-testnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Contract address and code/version evidence: unresolved (`null`); no deployment claimed.
- Asset and decimals: official Arc Testnet USDC candidate `0x3600000000000000000000000000000000000000`, 6-decimal ERC-20 view; matching-chain bytecode remains unverified.
- Date checked and official sources: source review 2026-09-09; no on-chain check. https://developers.circle.com/stablecoins/usdc-contract-addresses; https://docs.arc.io/integrate/connect-to-arc; https://eips.ethereum.org/EIPS/eip-4626
- Adapter and manifest versions: demo-vault-arc-testnet 1.0.0; manifest 0.3.0.

## Economic mechanics

- Purpose: Arc demonstration ERC-4626 vault.
- Deposit/input assets: USDC; no borrowing or leverage.
- Position/share representation: ERC-4626 shares with explicit conversion and rounding.
- Yield source and accrual: repository `FiniteYieldVault` accepts one finite test-USDC budget and immutable linear schedule before X. Unvested budget is excluded from `totalAssets`. This is test mechanics, not an APY.
- Fees and rounding: capture applicable gas and protocol fees once; integer units, floor outputs/ceil obligations with retained remainder. Calibration outstanding.
- Entry limits/capacity: local contract exposes synchronous ERC-4626 previews/max methods; live balance, bytecode and gas remain `TO_VERIFY`.
- Exit mechanics/blocked states: synchronous redeem/withdraw is implemented and locally tested; actual Arc Testnet exit evidence is absent.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: immutable asset and schedule owner; schedule can be frozen once and cannot be changed. Contract is not upgradeable. Actual deployment identity remains `TO_VERIFY`.
- Underlying protocol: poa-demo; common protocol exposure aggregates across instruments/chains.
- Asset/depeg exposure: USDC; canonical USDC accounting does not reveal USDC/USD losses.
- Liquidity: cash availability or protocol withdrawal capacity; no assumption of virtual ownership on-chain.
- Oracle/data: exact block/hash RPC inputs; conversion feed and stale-data rules are separate dependencies.
- Governance/shared exposure: Both demo vaults share operator/admin risk.
- Unsupported risks: endogenous market response, MEV, future liquidity, exploit probabilities and hidden dependencies.

## Data and replay

- Execution reads/quotes: Deploy or select an ERC-4626 test USDC vault. Archive deployment bytecode/address, admin powers and decimals. Publish finite funded test-yield budget/schedule before X. Record actual deposit/withdraw test-token receipts and limits/rounding fixtures; no commercial APY claim.
- Indexed sources: optional analytics only, with indexing block and lag.
- Block/hash/freshness: chain-specific fixed block and raw inputs; no last-price fallback.
- Raw responses archived: required before activation; none captured in M0.
- Historical access: TO_VERIFY.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: Foundry validates finite funding, pre-start schedule, linear vesting, immutable schedule, all three capital amounts, floor/ceiling rounding and local round trip.
- Live deposit/withdraw, deployment, bytecode, Arc alias and gas: implemented by `pnpm test:live:testnet`; not run because the credential gate is unavailable.
- Latest evidence links/hashes: none; `verification.evidence` is empty.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: actual Arc Testnet deployment and finalized bytecode, schedule funding, deposit and withdrawal evidence from the M5 runbook.
- Decision: ADR-0013. New manifest/profile version before X; never rewrite an experiment.
