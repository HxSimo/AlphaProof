# Proof of Alpha — project state

## Current milestone

- Milestone: **M2 complete on the deterministic fixture path; external activation gates remain `TO_VERIFY`. M3 has not started.**
- Target observable outcome: archived exact inputs drive versioned Aave, ERC-4626 and Uniswap adapters into reproducible M1 receipts, with stale/missing/unverified data failing closed.
- Last updated: 2026-09-09.
- Baseline: repository contained the authoritative skill only, no implementation or commits. Existing skill files are preserved unchanged.

## Implemented and verified

| Capability                                                                             | Evidence/test                                                                                                                                     | Profile/environment                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| pnpm workspace, pinned toolchain and container images                                  | Frozen lockfile install and local build; source/version checks in [M0 sources](evidence/m0-source-checks.md)                                      | Local development only                   |
| Strict canonical objects and integer-safe wire format                                  | Schema and uint boundary, allocation, chronology and provenance tests                                                                             | Synthetic software validation            |
| Canonical JSON/content hashes                                                          | Stable ordering, 120 key permutations, malformed-value rejection; golden hash cross-checked with Foundry cast                                     | No public anchor claimed                 |
| Three profiles, four networks, eleven instrument candidates, twenty-three dependencies | Manifest relational validation and content seal; disabled activation and environment rejection tests                                              | Three product profiles all disabled      |
| API catalog and liveness/readiness                                                     | Fastify injection tests, shared output schema, unavailable DB state without leaked details                                                        | Local configuration review               |
| Web configuration review                                                               | Next production build and Docker web/API smoke passed; page renders exact API bundle hash                                                         | No accounting in browser                 |
| Worker configuration archival and migration                                            | Eight PostgreSQL checks: concurrent migrations/delivery, restart/reconnect, hash, mutation rejection, drift and rollback                          | Local PostgreSQL 17.9                    |
| Milestone plan and decisions                                                           | `pnpm plan M0` through `M7`; eight accepted ADRs                                                                                                  | Requested scope ends at M2               |
| Deterministic global accounting                                                        | Conservation asserted after every receipt; cash, reservations, indexed positions, receivables, payables and allowances                            | Synthetic M1 only                        |
| Rounding and balance aliases                                                           | 500 bigint floor/ceil cases with remainders; Arc native/ERC-20 aliases share one balance family                                                   | No live asset balance claimed            |
| Receipt idempotency and partial failure                                                | Exact duplicate no-op, changed duplicate conflict, stale-version rejection, approval/withdrawal/failed-swap cases                                 | Pure reducer, no database queue yet      |
| Transfer lifecycle and restart                                                         | 100 generated serialize/reload sequences plus JSON burn/delay/retry/settlement/payable fixture                                                    | Synthetic CCTP-style lifecycle           |
| Mark and liquidation contracts                                                         | In-transit, blocked, stale and unavailable values explicit; repeated estimates leave accounting unchanged                                         | Synthetic observation inputs             |
| Content-addressed raw inputs                                                           | Keccak byte addressing, create-only memory/filesystem/S3-compatible interface, length/hash verification and corruption tests                      | Synthetic/local archive only             |
| Aave V3 adapter                                                                        | All three amounts independently supply, accrue and withdraw; USDT supply path; pause/cap/liquidity, exact gas and approval checks                 | Synthetic captures; disabled             |
| MetaMorpho V1 ERC-4626 family adapter                                                  | Exact previews/max values, capacity, floor/ceil boundaries and round trips at all three amounts                                                   | Synthetic captures; no instance selected |
| Direct Uniswap V3 adapter                                                              | Both directions and every amount use separate exact-input quote/gas captures; deterministic pool tie break and one impact charge                  | Synthetic captures; disabled             |
| Economic replay                                                                        | Another Node process reloads raw objects and reproduces final portfolio hash `0x5308faa40e13f4f522da417bf3fd3b330497fa2123cc58b257333a8d67b54b1b` | Synthetic filesystem fixture             |

## In progress

No implementation work remains in the authorized M2 fixture path. Raw observations bind source/parser/adapter versions, provenance, validity time and optional block; adapters reproduce M1 receipts without eligibility logic. Three independent capital sizes, both swap directions, USDT supply, approval/gas/protocol/impact cost identities, exact previews, failure boundaries and cross-process replay are covered.

Credentialed mainnet validation was unavailable. `pnpm test:fork` therefore returned the documented `SKIPPED_TO_VERIFY` result. No fixed block, bytecode, live cap/liquidity, vault instance, quote, fee, conversion feed, transaction or object-store retention result is claimed. All three profiles and every external dependency remain disabled.

## External verifications

No real protocol adapter, deployed contract, liquidity, current fee, archive RPC or test-token transfer is verified. Pinned official source review resolved Ethereum USDC/USDT scales, Aave Pool/aToken identities and original Uniswap periphery identities, and selected the MetaMorpho V1 family. Code hashes, a vault instance, pools/tiers, block behavior and conversions remain unresolved. The complete inventory lives in [integrations](integrations.md); the executable M2 gate is in the [verification runbook](runbooks/m2-integration-verification.md).

| Dependency                             | Status      | Exact environment             | Evidence/date                | Next action                                                       |
| -------------------------------------- | ----------- | ----------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `rpc-ethereum-mainnet`                 | `TO_VERIFY` | ethereum-mainnet              | No activation evidence       | M2; [verification instructions](integrations.md)                  |
| `rpc-ethereum-sepolia`                 | `TO_VERIFY` | ethereum-sepolia              | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `rpc-arc-testnet`                      | `TO_VERIFY` | arc-testnet                   | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `rpc-arc-mainnet`                      | `TO_VERIFY` | arc-mainnet                   | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |
| `cash-ethereum-mainnet`                | `TO_VERIFY` | ethereum-mainnet              | No activation evidence       | M2; [verification instructions](integrations.md)                  |
| `cash-ethereum-sepolia`                | `TO_VERIFY` | ethereum-sepolia              | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `cash-arc-testnet`                     | `TO_VERIFY` | arc-testnet                   | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `cash-arc-mainnet`                     | `TO_VERIFY` | arc-mainnet                   | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |
| `aave-v3-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | Pinned official source only  | Run credentialed M2 gate; archive code/block/mechanics/gas        |
| `erc4626-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | Pinned family source only    | Select exact USDC instance; run and archive credentialed gate     |
| `uniswap-v3-ethereum`                  | `TO_VERIFY` | ethereum-mainnet              | Pinned periphery source only | Resolve pools/tiers; run six exact-size captures and fork         |
| `demo-vault-ethereum-sepolia`          | `TO_VERIFY` | ethereum-sepolia              | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `demo-vault-arc-testnet`               | `TO_VERIFY` | arc-testnet                   | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `yield-arc-mainnet`                    | `TO_VERIFY` | arc-mainnet                   | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |
| `cctp-ethereum-sepolia-to-arc-testnet` | `TO_VERIFY` | ethereum-sepolia, arc-testnet | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `cctp-arc-testnet-to-ethereum-sepolia` | `TO_VERIFY` | arc-testnet, ethereum-sepolia | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `cctp-ethereum-mainnet-to-arc-mainnet` | `TO_VERIFY` | ethereum-mainnet, arc-mainnet | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |
| `cctp-arc-mainnet-to-ethereum-mainnet` | `TO_VERIFY` | arc-mainnet, ethereum-mainnet | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |
| `eth-usdc-conversion`                  | `TO_VERIFY` | ethereum-mainnet              | No activation evidence       | M2; [verification instructions](integrations.md)                  |
| `testnet-gas-conversion`               | `TO_VERIFY` | ethereum-sepolia, arc-testnet | No activation evidence       | M5; [verification instructions](integrations.md)                  |
| `registry-arc-testnet`                 | `TO_VERIFY` | arc-testnet                   | No activation evidence       | M6; [verification instructions](integrations.md)                  |
| `archive-storage`                      | `TO_VERIFY` | deployment-specific           | No activation evidence       | M2; [verification instructions](integrations.md)                  |
| `graph-selected-history`               | `TO_VERIFY` | ethereum-mainnet              | No activation evidence       | Optional / deferred; [verification instructions](integrations.md) |

## Risks and scope cuts

| Risk                                             | Impact                         | Mitigation or cut                                                                     | Trigger                              |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Unverified external deployments/data/costs       | False economic claims          | All gates disabled; archive official/code/fork/transaction evidence before activation | Before M2/M5 enablement              |
| Mixed mainnet/testnet market history             | Invalid eligibility            | Separate experiments; registry location does not imply market provenance              | Every profile/receipt/export         |
| Duplicate capital or financial effects           | Invalid accounting             | M1 pure invariants/idempotency pass; M3 must add transaction and queue constraints    | Before accepting any signed intent   |
| Exact MetaMorpho vault instance is unselected    | Cannot claim capacity or exits | Family selected; keep adapter disabled until instance/code/queues/liquidity pass gate | Before external adapter activation   |
| Short history or disabled inference              | Unsupported green eligibility  | NOT_ASSESSED and eligibility disabled; no automatic funds                             | Every future report                  |
| Unavailable raw data/export storage              | Irreproducible result          | S3 retention/restore remains gated; local config archive is narrower                  | Before external capture is relied on |
| Public receipt timing trusted to server          | Late anchor can be overstated  | Periodic integrity guarantee only; pre-execution anchoring deferred                   | Demo language and proof UI           |
| Mainnet cross-chain gas/market policy unresolved | Testnet assumptions misapplied | Future mainnet profile cannot activate in this version                                | Future new profile/experiment        |

## Decisions

- Accepted ADRs: [0001 architecture](adr/0001-architecture.md), [0002 profiles/provenance](adr/0002-profiles-and-provenance.md), [0003 scope](adr/0003-scope-and-integrations.md), [0004 proposed economics](adr/0004-proposed-economic-policy.md), [0005 canonical schemas](adr/0005-canonical-schemas.md), [0006 deterministic accounting](adr/0006-deterministic-accounting.md), [0007 archived economic inputs](adr/0007-content-addressed-economic-inputs.md), [0008 Ethereum adapter boundaries](adr/0008-m2-ethereum-adapter-boundaries.md).
- Proposed parameters: numerical risk/timing/cadence/quota defaults, passive reference target, exact market selection and calibrations remain profile proposals. ADR acceptance does not enable a profile.
- Superseded ADRs: none.
- LOCKED product requirements are preserved; extra vaults, advanced inference, custom profiles, optional sponsor integrations and live capital controls are cut/deferred as documented.

## Test health

- Unit/property: 86 focused tests passed in seven files. M2 adds archive integrity/freshness, Aave/vault/swap amount boundaries, every capital size, both swap directions, USDT supply, cost-once behavior and failure checks on top of M1 coverage.
- Database/integration: eight PostgreSQL foundation checks passed. Economic receipt/queue concurrency tests belong to M3.
- Fork/adapter: gated Solidity suite implemented. It was explicitly skipped because `POA_RUN_ETHEREUM_FORK` and required verified inputs were absent; no RPC or bytecode pass is claimed.
- Replay: content-addressed raw objects were restored in another process and reproduced the expected M2 portfolio hash; missing, stale and corrupt objects fail closed.
- End to end: Docker web/API/database smoke passed; the actual restarted worker retained one configuration snapshot and returned inserted=false. SDK-signed economic flow not implemented (M3).
- Live testnet: not run; requires actual M5 transactions.
- Solidity: M2 fixed-block fork suite compiles with Solidity 0.8.30. It was not executed because the credential gate was closed; no fork pass is claimed.
- GitHub CI: workflow configured; remote execution not run or claimed.
- Full local check: `pnpm check` passed formatting, all typechecks, config/schema/plan validation, 86 tests and production builds. Frozen offline install, cross-process replay and Solidity compilation passed; the explicitly gated mainnet fork was skipped as `TO_VERIFY`. [M2 evidence](evidence/m2-validation.md). M0 Docker, migrations, DB tests and smoke remain previously verified and unchanged.

## Next smallest credible milestone

M3 only: prospective agent/version registration, immutable experiments, signed intent API/SDK, atomic persistence, deterministic planning, database jobs and restart-safe external agent flow. M2 external gates stay disabled and synthetic observations remain the permitted development input until their evidence is complete.

The [exact M3 continuation prompt](continuation-m3.md) is ready.
