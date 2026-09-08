# Instrument fact sheet — arc-test-vault-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.1.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: arc-testnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Contract address and code/version evidence: unresolved (`null`); no deployment claimed.
- Asset and decimals: USDC; decimals require contract verification.
- Date checked and official sources: documentation reviewed 2026-09-08; no on-chain check. https://eips.ethereum.org/EIPS/eip-4626; https://docs.arc.io/arc/references/connect-to-arc
- Adapter and manifest versions: demo-vault-arc-testnet 0.0.0 (reserved identity, mechanics not implemented); manifest 0.1.0.

## Economic mechanics

- Purpose: Arc demonstration ERC-4626 vault.
- Deposit/input assets: USDC; no borrowing or leverage.
- Position/share representation: ERC-4626 shares with explicit conversion and rounding.
- Yield source and accrual: TO_VERIFY; use index/share changes, never displayed APY. Test vaults require finite predeclared funded schedule.
- Fees and rounding: capture applicable gas and protocol fees once; integer units, floor outputs/ceil obligations with retained remainder. Calibration outstanding.
- Entry limits/capacity: TO_VERIFY; protocol caps/liquidity/pauses and virtual-holder capacity must be documented.
- Exit mechanics/blocked states: TO_VERIFY; synchronous exit required, expose partial recoverability and blocked value.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: TO_VERIFY from deployed code and official governance.
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

- Unit/fixture: M0 validates this manifest and disabled dependency fixture; no economic behavior claimed.
- Fixed-block fork, deposit/withdraw round trip, limits, gas and rounding: not run; assigned M2 for Ethereum and M5 for test vaults.
- Latest evidence links/hashes: none; `verification.evidence` is empty.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: all evidence kinds in the manifest, plus exact addresses, code, capacity and data.
- Decision: ADR-0002 and ADR-0003. New manifest/profile version before X; never rewrite an experiment.
