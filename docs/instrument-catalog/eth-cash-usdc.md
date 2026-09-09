# Instrument fact sheet — eth-cash-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.2.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: ethereum-mainnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Official source candidate recorded in manifest: USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, 6 decimals. Runtime code remains unverified and the instrument disabled.
- Date checked and official sources: documentation reviewed 2026-09-08; no on-chain check. https://developers.circle.com/stablecoins/usdc-contract-addresses
- Adapter and manifest versions: cash-ethereum-mainnet 0.0.0 (reserved identity, mechanics not implemented); manifest 0.1.0.

## Economic mechanics

- Purpose: Ethereum USDC cash.
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

- Unit/fixture: M0 validates this manifest and disabled dependency fixture; no economic behavior claimed.
- Fixed-block fork, deposit/withdraw round trip, limits, gas and rounding: not run; assigned M2 for Ethereum and M5 for test vaults.
- Latest evidence links/hashes: none; `verification.evidence` is empty.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: all evidence kinds in the manifest, plus exact addresses, code, capacity and data.
- Decision: ADR-0002 and ADR-0003. New manifest/profile version before X; never rewrite an experiment.
