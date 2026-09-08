# Architecture and persistence

M0 accepts the v0.3 architecture in ADR-0001. There are three applications and PostgreSQL. Raw external data will use S3-compatible storage in M2. No Redis, message broker, inference hosting or additional services are required.

| Boundary | Implemented in M0                                                                           | Next responsibility                                                                                 |
| -------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| domain   | Stable error codes, canonical JSON, content hashes, provenance/scenario constants           | Keep free of RPC and UI; amount arithmetic belongs to M1 accounting                                 |
| schemas  | Strict wire contracts and generated JSON Schema                                             | Expand with tested versioned kernel/adapter contracts as behavior arrives                           |
| config   | Relational manifest validation, seal checking, fail-closed dependency gate                  | Frozen experiment snapshots at M3                                                                   |
| storage  | PostgreSQL pool, checksummed transactional migrations and immutable configuration snapshots | Economic event store and queue at M3; S3 archival at M2                                             |
| api      | Live/ready health and validated `/v1/profiles` catalog                                      | Authentication, signing, locking and atomic durable intent receipt at M3                            |
| worker   | Repeated configuration validation/archive with restart-safe insertion                       | Resumable planning, capture, execution, transfers, valuations and publication as distinct job types |
| web      | Server-rendered canonical API catalog and explicit unavailable state                        | Read-only economic results, proofs and exports; no browser accounting                               |

Package imports form an acyclic graph: domain → schemas → config → API/worker; storage depends on domain. Web consumes schemas/API output. Packages for accounting, adapters, market-data, SDK, experiments, execution, valuation, evaluation and commitments are created when they have executable consumers in their assigned milestone. A conceptual interface is not a finished integration.

## Database design

M0 persists `schema_migrations` and `configuration_snapshots`. A migration advisory lock serializes installers, each migration runs transactionally, applied SQL is checksummed, and duplicate snapshots use a content-hash primary key. Snapshot UPDATE/DELETE/TRUNCATE are rejected by a statement trigger. A database administrator can bypass application protections; this is not a blockchain commitment.

M3 migration scope includes agents, agent_versions, profiles, experiments, capital_scenarios, portfolios, chain_balances, positions, reserved_balances, action_intents, execution_plans, execution_receipts, audit_events and jobs. M4 adds reference_portfolios and valuation_checkpoints; M5 adds transfer_intents/receipts/events; M6 adds evaluations and commitment_batches. Instrument snapshots and incidents enter with their first consumers. Avoid creating untested empty projection tables now.

Canonical SQL amounts will use `numeric(78,0)` with nonnegative/uint256 bounds and string decoding; JavaScript never receives a balance as a floating-point number. IDs and event sequences are explicit; sequence values also travel as decimal strings. The kernel's serialized state is sufficient to rebuild projections.

The M3 acceptance transaction locks scenario state, verifies authorization/nonce/expected version, writes the signed intent, server receipt time, monotonic audit sequence and job, then commits before acknowledging. Require unique `(experiment, scenario, authorized key, nonce)`, scoped idempotency keys/content hashes, a partial unique active-intent index and one effect per operation identity. Exact request retries return the original receipt; differing content under the same nonce does not enqueue work.

Job claiming uses a short transaction and `FOR UPDATE SKIP LOCKED`, with a persisted lease, attempt count and next-run time. External calls occur outside the lock. Completion atomically appends the receipt/effect and updates the job/projection; duplicate workers or an expired lease cannot repeat an economic effect. Transfer message uniqueness includes environment and domains. Queue retries never invent a new financial identity. Lease expiration is not proof a chain transaction failed: reconcile its stored transaction/message identity before rebroadcasting. These behaviors are M3/M5 tests, not M0 claims.

## External input and export boundary

Each capture retains requested/observed time, source/adapter/parser version, environment/chain/block/hash, freshness, exact amount-dependent quote and raw object hash. Persist raw bytes by content hash before relying on the response. Do not replace an archived ephemeral quote with a block number or a download URL. Reorgs invalidate dependent observations visibly; no favorable fallback block.

Every profile/adapter/data change requires a versioned configuration before a new X. Corrections append new events/results and link the original; historical reports and losses stay available. M6 export includes source versions, schemas, frozen configuration, events, raw inputs, receipts, checkpoints, ordered leaves, batches and proofs.
