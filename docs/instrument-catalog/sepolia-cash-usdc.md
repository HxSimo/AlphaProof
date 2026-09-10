# Instrument fact sheet — sepolia-cash-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.5.1.

## Status

- Verification: `VERIFIED_FOR_TESTNET`; enabled only for testnet evidence.
- Environment and chain: ethereum-sepolia, chain `11155111`; finalized RPC and pinned historical reads passed.
- Contract address and code/version evidence: `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`; code hash `0xcd3f29e2ea9c61dadd48bfeaf8b2884b6de9dfee7bf45329452c4c33d0868ceb`.
- Asset and decimals: USDC, 6 decimals.
- Date checked and official sources: 2026-09-10; sources are listed in the live evidence index.
- Adapter and manifest versions: cash-ethereum-sepolia 1.0.0; manifest 0.5.1.

## Economic mechanics

- Purpose: Sepolia test USDC cash.
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
- Raw responses archived: retained and indexed in `docs/evidence/m5-live-index.json`.
- Historical access: pinned finalized-block bytecode and decimals read passed.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: M5 uses strict six-decimal transfer and vault accounting.
- Live token, transfer, gas and pinned historical reads passed on Sepolia.
- Latest evidence: `docs/evidence/m5-live-index.json`, keccak256 `0xd425cac12d0d28839cd245fb3f08d90a1993bec39bc22b6dc12fc83369a71527`.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: none for this M5 instrument gate; testnet evidence remains ineligible for real capital.
- Decision: ADR-0014. New manifest/profile version before X; never rewrite an experiment.
