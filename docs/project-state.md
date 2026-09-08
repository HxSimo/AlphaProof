# Proof of Alpha — project state

## Current milestone

- Milestone: **M1 complete — exit criteria verified. M2 has not started.**
- Target observable outcome: deterministic global portfolio accounting with canonical integer arithmetic, conservation, exactly-once receipt effects, restart-safe transfer lifecycle and pure mark/liquidation valuation.
- Last updated: 2026-09-08.
- Baseline: repository contained the authoritative skill only, no implementation or commits. Existing skill files are preserved unchanged.

## Implemented and verified

| Capability                                                                             | Evidence/test                                                                                                            | Profile/environment                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| pnpm workspace, pinned toolchain and container images                                  | Frozen lockfile install and local build; source/version checks in [M0 sources](evidence/m0-source-checks.md)             | Local development only              |
| Strict canonical objects and integer-safe wire format                                  | Schema and uint boundary, allocation, chronology and provenance tests                                                    | Synthetic software validation       |
| Canonical JSON/content hashes                                                          | Stable ordering, 120 key permutations, malformed-value rejection; golden hash cross-checked with Foundry cast            | No public anchor claimed            |
| Three profiles, four networks, eleven instrument candidates, twenty-three dependencies | Manifest relational validation and content seal; disabled activation and environment rejection tests                     | Three product profiles all disabled |
| API catalog and liveness/readiness                                                     | Fastify injection tests, shared output schema, unavailable DB state without leaked details                               | Local configuration review          |
| Web configuration review                                                               | Next production build and Docker web/API smoke passed; page renders exact API bundle hash                                | No accounting in browser            |
| Worker configuration archival and migration                                            | Eight PostgreSQL checks: concurrent migrations/delivery, restart/reconnect, hash, mutation rejection, drift and rollback | Local PostgreSQL 17.9               |
| Milestone plan and decisions                                                           | `pnpm plan M0` through `M7`; six accepted ADRs                                                                           | Requested scope ends at M1          |
| Deterministic global accounting                                                        | Conservation asserted after every receipt; cash, reservations, indexed positions, receivables, payables and allowances   | Synthetic M1 only                   |
| Rounding and balance aliases                                                           | 500 bigint floor/ceil cases with remainders; Arc native/ERC-20 aliases share one balance family                          | No live asset balance claimed       |
| Receipt idempotency and partial failure                                                | Exact duplicate no-op, changed duplicate conflict, stale-version rejection, approval/withdrawal/failed-swap cases        | Pure reducer, no database queue yet |
| Transfer lifecycle and restart                                                         | 100 generated serialize/reload sequences plus JSON burn/delay/retry/settlement/payable fixture                           | Synthetic CCTP-style lifecycle      |
| Mark and liquidation contracts                                                         | In-transit, blocked, stale and unavailable values explicit; repeated estimates leave accounting unchanged                | Synthetic observation inputs        |

## In progress

No implementation work remains in M1. The reducer, schemas, fixture, ADR and validation evidence are complete; this document is updated before the focused M1 commit. M2 remains unauthorized and unstarted.

M1 exit: every accepted receipt preserves one global scenario value under the declared cost/PnL identity. Source failure, transfer delay/retry/settlement, duplicate delivery, restart, partial success, Arc aliasing, valuation failure and closure-in-transit paths are covered. All three profiles and every external dependency remain disabled. The local catalog is reviewable at <http://localhost:3000>; it is not an active experiment.

## External verifications

No real protocol adapter, deployed contract, liquidity, current fee, archive RPC or test-token transfer is verified. Documentation checks remain distinct from on-chain activation evidence. Four network gates and eleven instrument gates are also disabled; exact addresses/code/token scales remain unresolved in manifests. The complete inventory and precise instructions live in [integrations](integrations.md).

| Dependency                             | Status      | Exact environment             | Evidence/date          | Next action                                                       |
| -------------------------------------- | ----------- | ----------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `rpc-ethereum-mainnet`                 | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `rpc-ethereum-sepolia`                 | `TO_VERIFY` | ethereum-sepolia              | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `rpc-arc-testnet`                      | `TO_VERIFY` | arc-testnet                   | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `rpc-arc-mainnet`                      | `TO_VERIFY` | arc-mainnet                   | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |
| `cash-ethereum-mainnet`                | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `cash-ethereum-sepolia`                | `TO_VERIFY` | ethereum-sepolia              | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `cash-arc-testnet`                     | `TO_VERIFY` | arc-testnet                   | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `cash-arc-mainnet`                     | `TO_VERIFY` | arc-mainnet                   | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |
| `aave-v3-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `erc4626-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `uniswap-v3-ethereum`                  | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `demo-vault-ethereum-sepolia`          | `TO_VERIFY` | ethereum-sepolia              | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `demo-vault-arc-testnet`               | `TO_VERIFY` | arc-testnet                   | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `yield-arc-mainnet`                    | `TO_VERIFY` | arc-mainnet                   | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |
| `cctp-ethereum-sepolia-to-arc-testnet` | `TO_VERIFY` | ethereum-sepolia, arc-testnet | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `cctp-arc-testnet-to-ethereum-sepolia` | `TO_VERIFY` | arc-testnet, ethereum-sepolia | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `cctp-ethereum-mainnet-to-arc-mainnet` | `TO_VERIFY` | ethereum-mainnet, arc-mainnet | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |
| `cctp-arc-mainnet-to-ethereum-mainnet` | `TO_VERIFY` | arc-mainnet, ethereum-mainnet | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |
| `eth-usdc-conversion`                  | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `testnet-gas-conversion`               | `TO_VERIFY` | ethereum-sepolia, arc-testnet | No activation evidence | M5; [verification instructions](integrations.md)                  |
| `registry-arc-testnet`                 | `TO_VERIFY` | arc-testnet                   | No activation evidence | M6; [verification instructions](integrations.md)                  |
| `archive-storage`                      | `TO_VERIFY` | deployment-specific           | No activation evidence | M2; [verification instructions](integrations.md)                  |
| `graph-selected-history`               | `TO_VERIFY` | ethereum-mainnet              | No activation evidence | Optional / deferred; [verification instructions](integrations.md) |

## Risks and scope cuts

| Risk                                             | Impact                         | Mitigation or cut                                                                     | Trigger                              |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Unverified external deployments/data/costs       | False economic claims          | All gates disabled; archive official/code/fork/transaction evidence before activation | Before M2/M5 enablement              |
| Mixed mainnet/testnet market history             | Invalid eligibility            | Separate experiments; registry location does not imply market provenance              | Every profile/receipt/export         |
| Duplicate capital or financial effects           | Invalid accounting             | M1 pure invariants/idempotency pass; M3 must add transaction and queue constraints    | Before accepting any signed intent   |
| Two similar Ethereum vaults increase scope       | Delays critical flow           | Cut to one synchronous USDC vault family; candidates remain unselected                | M2 integration selection             |
| Short history or disabled inference              | Unsupported green eligibility  | NOT_ASSESSED and eligibility disabled; no automatic funds                             | Every future report                  |
| Unavailable raw data/export storage              | Irreproducible result          | S3 retention/restore remains gated; local config archive is narrower                  | Before external capture is relied on |
| Public receipt timing trusted to server          | Late anchor can be overstated  | Periodic integrity guarantee only; pre-execution anchoring deferred                   | Demo language and proof UI           |
| Mainnet cross-chain gas/market policy unresolved | Testnet assumptions misapplied | Future mainnet profile cannot activate in this version                                | Future new profile/experiment        |

## Decisions

- Accepted ADRs: [0001 architecture](adr/0001-architecture.md), [0002 profiles/provenance](adr/0002-profiles-and-provenance.md), [0003 scope](adr/0003-scope-and-integrations.md), [0004 proposed economics](adr/0004-proposed-economic-policy.md), [0005 canonical schemas](adr/0005-canonical-schemas.md), [0006 deterministic accounting](adr/0006-deterministic-accounting.md).
- Proposed parameters: numerical risk/timing/cadence/quota defaults, passive reference target, exact market selection and calibrations remain profile proposals. ADR acceptance does not enable a profile.
- Superseded ADRs: none.
- LOCKED product requirements are preserved; extra vaults, advanced inference, custom profiles, optional sponsor integrations and live capital controls are cut/deferred as documented.

## Test health

- Unit/property: 65 focused tests passed in five files. M1 adds 13 tests covering int256 bounds, 500 rounding examples, 100 generated transfer/restart sequences, three scenario sizes, aliases, costs, failure, idempotency, transfer settlement and valuation.
- Database/integration: eight PostgreSQL foundation checks passed. Economic receipt/queue concurrency tests belong to M3.
- Fork/adapter: not implemented/run; no RPC or bytecode evidence claimed.
- Replay: configuration reload/seal and snapshot hash checked; independent M1 fixture replays parse serialization at every receipt and produce identical state hashes.
- End to end: Docker web/API/database smoke passed; the actual restarted worker retained one configuration snapshot and returned inserted=false. SDK-signed economic flow not implemented (M3).
- Live testnet: not run; requires actual M5 transactions.
- Solidity: toolchain settings selected; no contract suite exists yet and no pass is claimed.
- GitHub CI: workflow configured; remote execution not run or claimed.
- Full local check: `pnpm check` passed with formatting, all typechecks, config/schema/plan validation, 65 tests and production builds. M0 Docker, migrations, DB tests and smoke remain previously verified and unchanged. [M1 evidence](evidence/m1-validation.md); [M0 evidence](evidence/m0-validation.md).

## Next smallest credible milestone

M2 only: content-addressed external input archival and a first Ethereum economic path covering Aave V3 USDC, one selected synchronous USDC ERC-4626 vault family, direct Uniswap V3 USDC/USDT swaps and USDT supply. Exact deployments, code, blocks, limits, liquidity, fees and quote/conversion sources must be verified from current official sources and fixed-block evidence before activation. When credentials or facts are unavailable, deterministic fixtures and fail-closed TO_VERIFY gates remain required. No M3 API/signing/database work begins.

The [exact M2 continuation prompt](continuation-m2.md) is ready.
