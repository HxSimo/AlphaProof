# Instrument fact sheet — arc-test-vault-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.6.0.

## Status

- Verification: `VERIFIED_FOR_TESTNET`; adapter enabled only for testnet evidence.
- Environment and chain: arc-testnet, chain `5042002`; finalized RPC and pinned historical reads passed.
- Contract address and code/version evidence: `0xc5febf4494adfdef2f3a10e46ea8845ec60c0f93`; code hash `0x49b1f2d8aa7c8385387e497cc6fab909384a8ea2d5587e017329fdfd2c33b9b7`.
- Asset and decimals: Arc Testnet USDC `0x3600000000000000000000000000000000000000`, 6-decimal ERC-20 view and 18-decimal native alias verified.
- Date checked and official sources: 2026-09-10; sources are listed in the live evidence index.
- Adapter and manifest versions: demo-vault-arc-testnet 1.0.0; manifest 0.6.0.

## Economic mechanics

- Purpose: Arc demonstration ERC-4626 vault.
- Deposit/input assets: USDC; no borrowing or leverage.
- Position/share representation: ERC-4626 shares with explicit conversion and rounding.
- Yield source and accrual: repository `FiniteYieldVault` accepts one finite test-USDC budget and immutable linear schedule before X. Unvested budget is excluded from `totalAssets`. This is test mechanics, not an APY.
- Fees and rounding: the vault bytecode charges no protocol fee; retained live receipts record Arc native gas. Integer units use floor outputs and ceil obligations with retained remainder. The testnet gas-to-USDC economic ratio remains explicitly synthetic.
- Entry limits/capacity: synchronous ERC-4626 previews/max methods are covered in Foundry. A finalized 1 USDC live deposit passed; capacity beyond observed test amounts is not claimed.
- Exit mechanics/blocked states: synchronous redeem passed in the finalized Arc Testnet round trip. Future availability is not inferred from that receipt.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: immutable asset and schedule owner; schedule can be frozen once and cannot be changed. Contract is not upgradeable. Deployment address, runtime code and owner reads are retained in M5 evidence.
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
- Raw responses archived: retained under `.local-evidence/m5/raw/keccak256` and indexed in `docs/evidence/m5-live-index.json`.
- Historical access: pinned deployment-block header, token/vault bytecode and decimals read passed.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: Foundry validates finite funding, pre-start schedule, linear vesting, immutable schedule, all three capital amounts, floor/ceiling rounding and local round trip.
- Live deposit/withdraw, deployment, bytecode, Arc alias and gas: finalized credentialed round trip passed.
- Latest evidence: `docs/evidence/m5-live-index.json`, keccak256 `0xd425cac12d0d28839cd245fb3f08d90a1993bec39bc22b6dc12fc83369a71527`.

## Activation decision

- Enabled profiles: none; the instrument gate is verified for testnet evidence, while the containing profile remains disabled by its explicit profile gate and `archive-storage`.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: none for this M5 instrument gate; testnet provenance remains permanently ineligible for real capital.
- Decision: ADR-0013. New manifest/profile version before X; never rewrite an experiment.
