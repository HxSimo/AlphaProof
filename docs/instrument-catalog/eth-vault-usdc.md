# Instrument fact sheet — eth-vault-usdc

Adapted from the authoritative instrument-fact-sheet template. Version 0.2.0.

## Status

- Verification: `TO_VERIFY`; disabled.
- Environment and chain: ethereum-mainnet; see `config/v1/networks.json` for documented identity. RPC verification outstanding.
- Selected family: Morpho MetaMorpho V1. Exact vault address and runtime code hash remain `null`; no instance or deployment is claimed.
- Asset and decimals: exact instance must return the official Ethereum USDC asset and verified scale at the pinned block.
- Date/source: 2026-09-09; `morpho-org/metamorpho@ded84e59668155b34d3c24906c4f7461c12828af`, raw hash `0x9e3f778a1e53c6c0dcaaedeb043883205ae79c4b0ad18fc1ec7cadea73b640e7`; EIP-4626.
- Adapter and manifest versions: erc4626-ethereum 1.0.0; manifest 0.2.0.

## Economic mechanics

- Purpose: one selected synchronous USDC MetaMorpho V1 vault family; exact active instance remains an activation choice based on fixed-block evidence.
- Deposit/input assets: USDC; no borrowing or leverage.
- Position/share representation: ERC-4626 shares with explicit conversion and rounding.
- Yield source and accrual: TO_VERIFY; use index/share changes, never displayed APY. Test vaults require finite predeclared funded schedule.
- Fees and rounding: capture applicable gas and protocol fees once; integer units, floor outputs/ceil obligations with retained remainder. Calibration outstanding.
- Entry limits/capacity: TO_VERIFY; protocol caps/liquidity/pauses and virtual-holder capacity must be documented.
- Exit mechanics/blocked states: TO_VERIFY; synchronous exit required, expose partial recoverability and blocked value.
- Amount-dependent effects: each capital size has separate costs, limits and quotes.

## Risk and dependency map

- Contracts/admin/upgrade powers: TO_VERIFY from deployed code and official governance.
- Underlying protocol: morpho; common protocol exposure aggregates across instruments/chains.
- Asset/depeg exposure: USDC; canonical USDC accounting does not reveal USDC/USD losses.
- Liquidity: cash availability or protocol withdrawal capacity; no assumption of virtual ownership on-chain.
- Oracle/data: exact block/hash RPC inputs; conversion feed and stale-data rules are separate dependencies.
- Governance/shared exposure: Morpho vaults share infrastructure even with different curators.
- Unsupported risks: endogenous market response, MEV, future liquidity, exploit probabilities and hidden dependencies.

## Data and replay

- Execution reads/quotes: Select one synchronous USDC vault after reviewing Gauntlet Prime/Core candidates. Pin exact version/address/asset and governance dependencies. Verify conversions, all previews/max methods, fees, available exits, virtual-holder capacity, rounding and gas on fixed-block forks; archive raw reads.
- Indexed sources: optional analytics only, with indexing block and lag.
- Block/hash/freshness: chain-specific fixed block and raw inputs; no last-price fallback.
- Raw responses archived: exact-preview schema and content-addressed synthetic fixture implemented; no mainnet instance response captured.
- Historical access: TO_VERIFY.
- Valuation/liquidation: distinct mark and net recoverable USDC values; quotes do not mutate cash.

## Test evidence

- Unit/fixture: M2 independently validates 1,000, 10,000 and 100,000 USDC previews, floor/ceil conversion, deposit/redeem, max limits, available exit, gas and conservation using synthetic captures.
- Fixed-block fork: implemented behind the documented explicit gate; not run because no exact vault instance/archive RPC was available.
- Latest evidence: source-family hash above. Exact instance, governance, queues, code, fees, capacity and liquidity remain `TO_VERIFY`.

## Activation decision

- Enabled profiles: none.
- Locked assumptions: no auto funding; prospective receipt; separated provenance; same global capital across chains.
- Remaining blockers: all evidence kinds in the manifest, plus exact addresses, code, capacity and data.
- Decision: ADR-0002 and ADR-0003. New manifest/profile version before X; never rewrite an experiment.
