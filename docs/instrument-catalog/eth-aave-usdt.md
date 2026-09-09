# Instrument fact sheet — eth-aave-usdt

Adapted from the authoritative instrument-fact-sheet template. Version 0.2.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: ethereum-mainnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Contract identity from pinned official source: Pool `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`; aUSDT `0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a`. Runtime code hash remains `null`; no on-chain verification claimed.
- Asset and decimals from pinned official source: USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7`, 6 decimals.
- Date/source: 2026-09-09; `aave-address-book@09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9`, raw hash `0x253ed5028ff169c6f82d325e59613267baf3c71f3a7396223e27bc7bcfb8eb78`.
- Adapter and manifest versions: aave-v3-ethereum 1.0.0; manifest 0.2.0.

## Economic mechanics

- Purpose: Aave V3 USDT supply.
- Deposit/input assets: USDT; no borrowing or leverage.
- Position/share representation: reserve index/receipt token.
- Yield source and accrual: TO_VERIFY; use index/share changes, never displayed APY. Test vaults require finite predeclared funded schedule.
- Fees and rounding: capture applicable gas and protocol fees once; integer units, floor outputs/ceil obligations with retained remainder. Calibration outstanding.
- Entry limits/capacity: TO_VERIFY; protocol caps/liquidity/pauses and virtual-holder capacity must be documented.
- Exit mechanics/blocked states: TO_VERIFY; synchronous exit required, expose partial recoverability and blocked value.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: TO_VERIFY from deployed code and official governance.
- Underlying protocol: aave; common protocol exposure aggregates across instruments/chains.
- Asset/depeg exposure: USDT; canonical USDC accounting does not reveal USDC/USD losses.
- Liquidity: cash availability or protocol withdrawal capacity; no assumption of virtual ownership on-chain.
- Oracle/data: exact block/hash RPC inputs; conversion feed and stale-data rules are separate dependencies.
- Governance/shared exposure: Aave USDC and USDT share Aave infrastructure.
- Unsupported risks: endogenous market response, MEV, future liquidity, exploit probabilities and hidden dependencies.

## Data and replay

- Execution reads/quotes: Pin official Aave V3 address book commit, pool, USDC/USDT reserves, receipt token and decimals. Archive reserve index, caps, liquidity, pause/freeze flags and bytecode. Fork supply/accrue/withdraw at a fixed block for all three amounts, limits, gas and failed exits.
- Indexed sources: optional analytics only, with indexing block and lag.
- Block/hash/freshness: chain-specific fixed block and raw inputs; no last-price fallback.
- Raw responses archived: canonical interface and content-addressed fixture replay implemented; no mainnet response captured.
- Historical access: TO_VERIFY.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: M2 covers USDC exact-input swap into USDT followed by Aave USDT supply with separate approval/gas costs and M1 conservation.
- Fixed-block fork: code path exists, but USDT supply mechanics were not run because the archive-RPC gate was unavailable.
- Latest evidence: official-source evidence above; all activation evidence remains incomplete.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: all evidence kinds in the manifest, plus exact addresses, code, capacity and data.
- Decision: ADR-0002 and ADR-0003. New manifest/profile version before X; never rewrite an experiment.
