# Proof of Alpha — project state

## Current milestone

- Milestone: **M5 deterministic implementation is locally verified; M5 remains incomplete because required Sepolia/Arc live evidence is unavailable. All external gates remain `TO_VERIFY`.**
- Target observable outcome: finalized test-token vault round trips on Sepolia and Arc Testnet plus finalized CCTP burn/attestation/mint evidence in both directions, backed by restart-safe accounting and replay.
- Last updated: 2026-09-09.
- Baseline: repository contained the authoritative skill only, no implementation or commits. Existing skill files are preserved unchanged.

## Implemented and verified

| Capability                                                                             | Evidence/test                                                                                                                                      | Profile/environment                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| pnpm workspace, pinned toolchain and container images                                  | Frozen lockfile install and local build; source/version checks in [M0 sources](evidence/m0-source-checks.md)                                       | Local development only                   |
| Strict canonical objects and integer-safe wire format                                  | Schema and uint boundary, allocation, chronology and provenance tests                                                                              | Synthetic software validation            |
| Canonical JSON/content hashes                                                          | Stable ordering, 120 key permutations, malformed-value rejection; golden hash cross-checked with Foundry cast                                      | No public anchor claimed                 |
| Three profiles, four networks, eleven instrument candidates, twenty-three dependencies | Manifest relational validation and content seal; disabled activation and environment rejection tests                                               | Three product profiles all disabled      |
| API catalog and liveness/readiness                                                     | Fastify injection tests, shared output schema, unavailable DB state without leaked details                                                         | Local configuration review               |
| Web configuration review                                                               | Next production build and Docker web/API smoke passed; page renders exact API bundle hash                                                          | No accounting in browser                 |
| Worker configuration archival and migration                                            | Eight PostgreSQL checks: concurrent migrations/delivery, restart/reconnect, hash, mutation rejection, drift and rollback                           | Local PostgreSQL 17.9                    |
| Milestone plan and decisions                                                           | `pnpm plan M0` through `M7`; fourteen accepted ADRs                                                                                                | Requested scope ends at M5               |
| Deterministic global accounting                                                        | Conservation asserted after every receipt; cash, reservations, indexed positions, receivables, payables and allowances                             | Synthetic M1 only                        |
| Rounding and balance aliases                                                           | 500 bigint floor/ceil cases with remainders; Arc native/ERC-20 aliases share one balance family                                                    | No live asset balance claimed            |
| Receipt idempotency and partial failure                                                | Exact duplicate no-op, changed duplicate conflict, stale-version rejection, approval/withdrawal/failed-swap cases                                  | Pure reducer, no database queue yet      |
| Transfer lifecycle and restart                                                         | 100 generated serialize/reload sequences plus JSON burn/delay/retry/settlement/payable fixture                                                     | Synthetic CCTP-style lifecycle           |
| Mark and liquidation contracts                                                         | In-transit, blocked, stale and unavailable values explicit; repeated estimates leave accounting unchanged                                          | Synthetic observation inputs             |
| Content-addressed raw inputs                                                           | Keccak byte addressing, create-only memory/filesystem/S3-compatible interface, length/hash verification and corruption tests                       | Synthetic/local archive only             |
| Aave V3 adapter                                                                        | All three amounts independently supply, accrue and withdraw; USDT supply path; pause/cap/liquidity, exact gas and approval checks                  | Synthetic captures; disabled             |
| MetaMorpho V1 ERC-4626 family adapter                                                  | Exact previews/max values, capacity, floor/ceil boundaries and round trips at all three amounts                                                    | Synthetic captures; no instance selected |
| Direct Uniswap V3 adapter                                                              | Both directions and every amount use separate exact-input quote/gas captures; deterministic pool tie break and one impact charge                   | Synthetic captures; disabled             |
| Economic replay                                                                        | Another Node process reloads raw objects and reproduces final portfolio hash `0x5308faa40e13f4f522da417bf3fd3b330497fa2123cc58b257333a8d67b54b1b`  | Synthetic filesystem fixture             |
| Agent/version and experiment registry                                                  | Version/key registration and revocation; start freezes policy/config/profile/adapter/parser hashes; database trigger rejects later policy changes  | PostgreSQL; synthetic start only         |
| EIP-712 SDK and external agent                                                         | Canonical allocation hash, exact typed bytes, injected signer, acknowledgment verification; separate child process keeps the decision key local    | Local chain-31337 zero-address fixture   |
| Prospective action API                                                                 | Database receipt time, exact bytes/signature, nonce, expiry, stale version, binding, payload, quota, idempotency and scenario-concurrency checks   | Synthetic experiment; no chain claim     |
| Journal, jobs and worker recovery                                                      | Atomic acceptance/journal/job; leased `SKIP LOCKED` queue; create-only plan and receipts; crash/restart and partial success preserve effects/costs | PostgreSQL plus archived M2 fixtures     |
| Independent capital and fixed references                                               | Separate signed 1k/10k/100k streams; six reference portfolios copy capital, distribution, period and convention with distinct identities           | Synthetic M4 only                        |
| Passive reference lifecycle                                                            | One amount-specific Aave-family entry per size; archived entry replay; failed entry retains cash/costs and database freeze prevents replacement    | Synthetic captures; adapter disabled     |
| Checkpoint valuation and evaluation                                                    | Inactivity accrual receipts; mark/liquidation, cash, positions, transit, blocked value, costs, drawdown and nullable reference differences         | Common synthetic checkpoint              |
| M4 persistence and replay                                                              | Atomic append-only checkpoints/evaluations, idempotent redelivery, content-addressed raw-input validation and cross-process hash reproduction      | PostgreSQL/local process                 |
| Finite funded test vault                                                               | Solidity schedule funding/immutability, linear vesting, ERC-4626 rounding and round trips at all three capital amounts                             | Local Foundry only                       |
| CCTP route and transfer kernel                                                         | Chain/domain validation, finalized-evidence gate, Arc decimal aliases, ceil gas conversion, bounded retries, reorg/closure and one-credit tests    | Synthetic testnet fixtures               |
| Durable cross-chain worker                                                             | Migration 0004, atomic event/accounting/portfolio/job transaction, concurrent duplicate delivery, lease recovery and attestation wait behavior     | Local PostgreSQL                         |
| M5 replay and credentialed gate                                                        | Cross-process lifecycle hash; live runner validates both vaults/routes, current fees, finality, message binding, duplicate rejection and balances  | Replay passes; live gate unavailable     |

## In progress

M5 adds a strict route/transfer/event schema, deterministic state machine and M1 receipt translation. Reservation, source failure, finalized burn, delayed attestation, same-message retry, destination failure, finalized settlement, dependency invalidation and deadline closure are explicit. PostgreSQL commits each append-only event with its accounting receipt, scenario portfolio and job state. A crashed lease is reclaimable; an absent attestation schedules another observation and cannot create a destination credit.

The local `FiniteYieldVault` freezes one pre-funded test-USDC budget before its start. Foundry proves schedule immutability, linear vesting, synchronous deposit/redeem and rounding. Generic Sepolia/Arc vault adapters emit source-hashed M1 receipts. Arc native 18-decimal and ERC-20 6-decimal views normalize into one balance family, and relayer funding becomes a payable rather than shadow cash.

The credentialed runner is fail-closed and archives current fee responses, bytecode, finalized receipts and exact balance reconciliations. The required RPC URLs, disposable deployer/relayer keys and faucet balances were unavailable, so it returned `SKIPPED_TO_VERIFY`. No vault address, deployment, code hash, transaction, attestation, current fee result or successful live round trip is claimed. M5 therefore has not met its observable exit criteria and M6 is not authorized.

## External verifications

No real protocol adapter, deployed contract, liquidity, current fee, archive RPC or test-token transfer is verified. M5 official-source review records Sepolia chain `11155111`, Arc Testnet chain `5042002`, CCTP domains `0` and `26`, the documented USDC and CCTP V2 candidate addresses, and the Arc native/ERC-20 decimal convention. Matching-chain code, balances, finality, current fees and transactions remain unresolved. The complete inventory lives in [integrations](integrations.md); the executable M5 gate is in the [testnet lifecycle runbook](runbooks/m5-testnet-lifecycle.md).

| Dependency                             | Status      | Exact environment             | Evidence/date                                           | Next action                                                             |
| -------------------------------------- | ----------- | ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `rpc-ethereum-mainnet`                 | `TO_VERIFY` | ethereum-mainnet              | No activation evidence                                  | M2; [verification instructions](integrations.md)                        |
| `rpc-ethereum-sepolia`                 | `TO_VERIFY` | ethereum-sepolia              | Official identity source-reviewed; no RPC evidence      | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `rpc-arc-testnet`                      | `TO_VERIFY` | arc-testnet                   | Official identity source-reviewed; no RPC evidence      | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `rpc-arc-mainnet`                      | `TO_VERIFY` | arc-mainnet                   | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |
| `cash-ethereum-mainnet`                | `TO_VERIFY` | ethereum-mainnet              | No activation evidence                                  | M2; [verification instructions](integrations.md)                        |
| `cash-ethereum-sepolia`                | `TO_VERIFY` | ethereum-sepolia              | Official address/scale source-reviewed; no code         | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `cash-arc-testnet`                     | `TO_VERIFY` | arc-testnet                   | Official address/alias source-reviewed; no code         | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `cash-arc-mainnet`                     | `TO_VERIFY` | arc-mainnet                   | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |
| `aave-v3-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | Pinned official source only                             | Run credentialed M2 gate; archive code/block/mechanics/gas              |
| `erc4626-ethereum`                     | `TO_VERIFY` | ethereum-mainnet              | Pinned family source only                               | Select exact USDC instance; run and archive credentialed gate           |
| `uniswap-v3-ethereum`                  | `TO_VERIFY` | ethereum-mainnet              | Pinned periphery source only                            | Resolve pools/tiers; run six exact-size captures and fork               |
| `demo-vault-ethereum-sepolia`          | `TO_VERIFY` | ethereum-sepolia              | Local contract/tests only; no deployment                | Deploy and run [M5 live gate](runbooks/m5-testnet-lifecycle.md)         |
| `demo-vault-arc-testnet`               | `TO_VERIFY` | arc-testnet                   | Local contract/tests only; no deployment                | Deploy and run [M5 live gate](runbooks/m5-testnet-lifecycle.md)         |
| `yield-arc-mainnet`                    | `TO_VERIFY` | arc-mainnet                   | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |
| `cctp-ethereum-sepolia-to-arc-testnet` | `TO_VERIFY` | ethereum-sepolia, arc-testnet | Official route source-reviewed; no live round trip      | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `cctp-arc-testnet-to-ethereum-sepolia` | `TO_VERIFY` | arc-testnet, ethereum-sepolia | Official route source-reviewed; no live round trip      | Run [M5 live gate](runbooks/m5-testnet-lifecycle.md)                    |
| `cctp-ethereum-mainnet-to-arc-mainnet` | `TO_VERIFY` | ethereum-mainnet, arc-mainnet | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |
| `cctp-arc-mainnet-to-ethereum-mainnet` | `TO_VERIFY` | arc-mainnet, ethereum-mainnet | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |
| `eth-usdc-conversion`                  | `TO_VERIFY` | ethereum-mainnet              | No activation evidence                                  | M2; [verification instructions](integrations.md)                        |
| `testnet-gas-conversion`               | `TO_VERIFY` | ethereum-sepolia, arc-testnet | Integer converter tested; no live gas calibration       | Capture both chains in [M5 live gate](runbooks/m5-testnet-lifecycle.md) |
| `registry-arc-testnet`                 | `TO_VERIFY` | arc-testnet                   | Local zero-address fixture only; no deployment evidence | M6; replace fixture using [M3 runbook](runbooks/m3-signed-intent.md)    |
| `archive-storage`                      | `TO_VERIFY` | deployment-specific           | No activation evidence                                  | M2; [verification instructions](integrations.md)                        |
| `graph-selected-history`               | `TO_VERIFY` | ethereum-mainnet              | No activation evidence                                  | Optional / deferred; [verification instructions](integrations.md)       |

## Risks and scope cuts

| Risk                                             | Impact                         | Mitigation or cut                                                                     | Trigger                              |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Unverified external deployments/data/costs       | False economic claims          | All gates disabled; archive official/code/fork/transaction evidence before activation | Before M2/M5 enablement              |
| Mixed mainnet/testnet market history             | Invalid eligibility            | Separate experiments; registry location does not imply market provenance              | Every profile/receipt/export         |
| Duplicate capital or financial effects           | Invalid accounting             | M1 invariants plus M3 transaction, nonce, active-action, receipt and job constraints  | Every acceptance and worker retry    |
| Exact MetaMorpho vault instance is unselected    | Cannot claim capacity or exits | Family selected; keep adapter disabled until instance/code/queues/liquidity pass gate | Before external adapter activation   |
| Short history or disabled inference              | Unsupported green eligibility  | NOT_ASSESSED and eligibility disabled; no automatic funds                             | Every future report                  |
| Unavailable raw data/export storage              | Irreproducible result          | S3 retention/restore remains gated; local config archive is narrower                  | Before external capture is relied on |
| Public receipt timing trusted to server          | Late anchor can be overstated  | Periodic integrity guarantee only; pre-execution anchoring deferred                   | Demo language and proof UI           |
| Mainnet cross-chain gas/market policy unresolved | Testnet assumptions misapplied | Future mainnet profile cannot activate in this version                                | Future new profile/experiment        |

## Decisions

- Accepted ADRs: [0001 architecture](adr/0001-architecture.md), [0002 profiles/provenance](adr/0002-profiles-and-provenance.md), [0003 scope](adr/0003-scope-and-integrations.md), [0004 proposed economics](adr/0004-proposed-economic-policy.md), [0005 canonical schemas](adr/0005-canonical-schemas.md), [0006 deterministic accounting](adr/0006-deterministic-accounting.md), [0007 archived economic inputs](adr/0007-content-addressed-economic-inputs.md), [0008 Ethereum adapter boundaries](adr/0008-m2-ethereum-adapter-boundaries.md), [0009 signed experiment boundary](adr/0009-m3-signed-experiment-boundary.md), [0010 journal/job transactions](adr/0010-m3-journal-and-job-transactions.md), [0011 scenarios/references](adr/0011-m4-scenarios-and-fixed-references.md), [0012 checkpoints/evaluation](adr/0012-m4-checkpoints-and-descriptive-evaluation.md), [0013 finite test-vault yield](adr/0013-m5-finite-test-vault.md), [0014 durable CCTP lifecycle](adr/0014-m5-durable-cctp-lifecycle.md).
- Proposed parameters: numerical risk/timing/cadence/quota defaults, passive reference target, exact market selection and calibrations remain profile proposals. ADR acceptance does not enable a profile.
- Superseded ADRs: none.
- LOCKED product requirements are preserved; extra vaults, advanced inference, custom profiles, optional sponsor integrations and live capital controls are cut/deferred as documented.

## Test health

- Unit/property: 108 focused tests passed in thirteen files. M5 adds route identity, Arc alias/dust, ceil gas, funded-schedule, finalized evidence, source failure, delayed attestation, bounded retry, reorg, closure and exactly-once settlement coverage.
- Database/integration: PostgreSQL foundation, M3/M4 checks and M5 concurrent duplicate delivery, post-burn polling, atomic event/accounting/portfolio/job persistence, lease recovery, source failure and restart checks passed.
- Fork/adapter: gated Solidity suite implemented. It was explicitly skipped because `POA_RUN_ETHEREUM_FORK` and required verified inputs were absent; no RPC or bytecode pass is claimed.
- Replay: content-addressed raw objects reproduce M2 and M4 results. Another Node process reproduced M5 transfer hash `0xc86f5ca463cafe8661a846d117809df7f914da140aaa2a42cb8768b0850f5c9e` across burn, delay, retry, closure and later reconciliation.
- End to end: the M3 external-agent/restart path still passes. M4 signs all three scenario decisions separately, confirms three amounts and cost sets, enters six references, accrues inactive positions, writes aligned checkpoints, replays stored inputs and preserves one correlated-sample label.
- Live testnet: explicit disabled run returned `SKIPPED_TO_VERIFY`; forcing the gate without credentials failed before network access with `LIVE_TESTNET_CONFIGURATION_MISSING`. Actual M5 transactions remain required.
- Solidity: Solidity 0.8.30 finite-vault suite passed 3/3. The separate M2 fixed-block fork gate remained `SKIPPED_TO_VERIFY`; no fork or testnet deployment pass is claimed.
- GitHub CI: workflow configured; remote execution not run or claimed.
- Full local check: `pnpm check`, migration 0004, `pnpm test:db`, both earlier end-to-end flows, `pnpm test:replay`, Foundry, M5 Docker build and container smoke passed. Details are recorded in [M5 evidence](evidence/m5-validation.md). No new external verification or deployment is claimed.

## Next smallest credible milestone

M5 only: obtain disposable testnet credentials and faucet balances, run the [credentialed lifecycle gate](runbooks/m5-testnet-lifecycle.md), review and retain its content-addressed evidence, then create a new verified manifest version. M6 must not begin until both actual vault round trips and both actual CCTP directions satisfy the M5 exits.

The [exact M6 continuation prompt](continuation-m6.md) is prepared for use only after the M5 live evidence gate is complete.
