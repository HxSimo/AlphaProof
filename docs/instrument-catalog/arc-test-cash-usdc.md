# Instrument fact sheet — arc-test-cash-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.3.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: arc-testnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Contract address and code/version evidence: official candidate `0x3600000000000000000000000000000000000000`; runtime code remains unverified.
- Asset and decimals: USDC, 6-decimal ERC-20 interface and 18-decimal native view of one economic balance.
- Date checked and official sources: source review 2026-09-09; no on-chain check. https://developers.circle.com/stablecoins/usdc-contract-addresses; https://docs.arc.io/integrate/connect-to-arc
- Adapter and manifest versions: cash-arc-testnet 1.0.0; manifest 0.3.0.

## Economic mechanics

- Purpose: Arc test USDC cash; native and ERC-20 views alias.
- Deposit/input assets: USDC; no borrowing or leverage.
- Position/share representation: cash minimum units; Arc native and ERC-20 views share one balance.
- Yield source and accrual: none.
- Fees and rounding: capture applicable gas and protocol fees once; integer units, floor outputs/ceil obligations with retained remainder. Calibration outstanding.
- Entry limits/capacity: available cash and gas reserve.
- Exit mechanics/blocked states: available cash; transfers require a separate allowed route.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: TO_VERIFY from deployed code and official governance.
- Underlying protocol: circle; common protocol exposure aggregates across instruments/chains.
- Asset/depeg exposure: USDC; canonical USDC accounting does not reveal USDC/USD losses.
- Liquidity: cash availability or protocol withdrawal capacity; no assumption of virtual ownership on-chain.
- Oracle/data: exact block/hash RPC inputs; conversion feed and stale-data rules are separate dependencies.
- Governance/shared exposure: Stablecoin issuer and chain dependencies remain.
- Unsupported risks: endogenous market response, MEV, future liquidity, exploit probabilities and hidden dependencies.

## Data and replay

- Execution reads/quotes: Resolve USDC token/interface and decimals, verify bytecode and balance reads. For Arc compare native and ERC-20 views at one block, normalize with retained dust and alias one economic balance. Verify USDT separately where listed.
- Indexed sources: optional analytics only, with indexing block and lag.
- Block/hash/freshness: chain-specific fixed block and raw inputs; no last-price fallback.
- Raw responses archived: required before activation; none captured in M0.
- Historical access: TO_VERIFY.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: M5 normalizes same-block native and ERC-20 values, retains sub-USDC-native dust and rejects disagreement; neither view is added twice.
- Fixed-block fork, deposit/withdraw round trip, limits, gas and rounding: not run; assigned M2 for Ethereum and M5 for test vaults.
- Latest evidence links/hashes: none; `verification.evidence` is empty.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: matching-chain bytecode and actual same-block alias capture in the M5 credentialed gate.
- Decision: ADR-0014. New manifest/profile version before X; never rewrite an experiment.
