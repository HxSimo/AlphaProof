# Architecture and persistence

M0 accepts the v0.3 architecture in ADR-0001. There are three applications and PostgreSQL. Raw external data will use S3-compatible storage in M2. No Redis, message broker, inference hosting or additional services are required.

| Boundary   | Implemented in M0                                                                           | Next responsibility                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| domain     | Stable error codes, canonical JSON, content hashes, provenance/scenario constants           | Keep free of RPC and UI                                                                             |
| schemas    | Strict wire contracts and generated JSON Schema, including M1 accounting receipts/state     | Expand with tested versioned adapter contracts as behavior arrives                                  |
| accounting | Pure receipt reducer, conservation, bigint rounding, transfers and valuation views          | M2 supplies archived mechanics/observations; M3 persists reductions atomically                      |
| config     | Relational manifest validation, seal checking, fail-closed dependency gate                  | Frozen experiment snapshots at M3                                                                   |
| storage    | PostgreSQL pool, checksummed transactional migrations and immutable configuration snapshots | Economic event store and queue at M3; S3 archival at M2                                             |
| api        | Live/ready health and validated `/v1/profiles` catalog                                      | Authentication, signing, locking and atomic durable intent receipt at M3                            |
| worker     | Repeated configuration validation/archive with restart-safe insertion                       | Resumable planning, capture, execution, transfers, valuations and publication as distinct job types |
| web        | Server-rendered canonical API catalog and explicit unavailable state                        | Read-only economic results, proofs and exports; no browser accounting                               |

Package imports form an acyclic graph: domain → schemas → accounting; config consumes domain/schemas; storage depends on domain; API/worker consume config/storage. Web consumes schemas/API output. Accounting has no RPC, database or UI dependency. Packages for adapters, market-data, SDK, experiments, execution, valuation, evaluation and commitments are created when they have executable consumers in their assigned milestone. A conceptual interface is not a finished integration.

## Deterministic accounting boundary

`ShadowPortfolio` is one global treasury for exactly one experiment/scenario. Its network cash families, reservations, indexed positions, transfer receivables and fee payables satisfy `net assets = initial capital + modeled PnL - recognized costs` after every receipt. Multiple balance views may alias one family, which models Arc native/ERC-20 access without creating another balance. The three standard capital sizes instantiate separate portfolio objects and operation/version streams.

Receipt application is optimistic and immutable. A receipt binds accounting version, experiment, scenario, provenance, expected portfolio version, operation identity, source hashes and observed time. Exact redelivery returns the prior state; changed content under the same operation identity fails. Serialization is a durable boundary: replay reparses and revalidates state after every receipt.

The transfer reducer moves value through cash → reservation → one unavailable receivable → destination cash. Source failure releases the reservation minus proven costs. A delayed or exhausted transfer keeps the receivable. Settlement removes it before crediting the destination and cannot be applied twice. Deadline closure stores a hash of the pre-close state; later transfer reconciliation is allowed while local investing and accrual are rejected.

Valuation is a pure projection. Mark includes a transfer receivable at its recorded amount; immediate liquidation excludes it and applies supplied recoverability/exit costs. Stale and unavailable inputs remain explicit. Estimated exit costs never mutate portfolio cash or cumulative costs.

## Database design

M0 persists `schema_migrations` and `configuration_snapshots`. A migration advisory lock serializes installers, each migration runs transactionally, applied SQL is checksummed, and duplicate snapshots use a content-hash primary key. Snapshot UPDATE/DELETE/TRUNCATE are rejected by a statement trigger. A database administrator can bypass application protections; this is not a blockchain commitment.

M3 migration scope includes agents, agent_versions, profiles, experiments, capital_scenarios, portfolios, chain_balances, positions, reserved_balances, action_intents, execution_plans, execution_receipts, audit_events and jobs. M4 adds reference_portfolios and valuation_checkpoints; M5 adds transfer_intents/receipts/events; M6 adds evaluations and commitment_batches. Instrument snapshots and incidents enter with their first consumers. Avoid creating untested empty projection tables now.

Canonical SQL amounts will use `numeric(78,0)` with nonnegative/uint256 bounds and string decoding; JavaScript never receives a balance as a floating-point number. IDs and event sequences are explicit; sequence values also travel as decimal strings. The kernel's serialized state is sufficient to rebuild projections.

The M3 acceptance transaction locks scenario state, verifies authorization/nonce/expected version, writes the signed intent, server receipt time, monotonic audit sequence and job, then commits before acknowledging. Require unique `(experiment, scenario, authorized key, nonce)`, scoped idempotency keys/content hashes, a partial unique active-intent index and one effect per operation identity. Exact request retries return the original receipt; differing content under the same nonce does not enqueue work.

Job claiming uses a short transaction and `FOR UPDATE SKIP LOCKED`, with a persisted lease, attempt count and next-run time. External calls occur outside the lock. Completion atomically appends the receipt/effect and updates the job/projection; duplicate workers or an expired lease cannot repeat an economic effect. Transfer message uniqueness includes environment and domains. Queue retries never invent a new financial identity. Lease expiration is not proof a chain transaction failed: reconcile its stored transaction/message identity before rebroadcasting. These behaviors are M3/M5 tests, not M0 claims.

## External input and export boundary

Each capture retains requested/observed time, source/adapter/parser version, environment/chain/block/hash, freshness, exact amount-dependent quote and raw object hash. Persist raw bytes by content hash before relying on the response. Do not replace an archived ephemeral quote with a block number or a download URL. Reorgs invalidate dependent observations visibly; no favorable fallback block.

Every profile/adapter/data change requires a versioned configuration before a new X. Corrections append new events/results and link the original; historical reports and losses stay available. M6 export includes source versions, schemas, frozen configuration, events, raw inputs, receipts, checkpoints, ordered leaves, batches and proofs.
