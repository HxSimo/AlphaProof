# M7 operations and verification

The demonstration is local software with synthetic economics and separately retained real testnet evidence. No external product profile is enabled. Start with the [deployment guide](../deployment.md), then run the [timed demonstration](../demo-runbook.md). The M2–M6 runbooks remain authoritative for their original integrations and receipts.

## Canonical controls

`GET /health/live` reports process availability; `GET /health/ready` tests PostgreSQL. `GET /health/operations` returns the v1 snapshot: database observation time, operational policy hash, ready/running/retry/failed jobs, maximum attempt, nullable queue age, worker heartbeats, unresolved incidents and rejected ingress count. Monitoring unavailable is never healthy. One recent demo worker is required; old worker heartbeats remain visible as stale.

`GET /v1/experiments/:id/incidents` preserves original messages and resolution history. `POST /v1/incidents` accepts the strict `IncidentInput` schema; `resolvesIncidentId` may only name an incident in the same experiment. Append a recovery instead of editing an outage. Terminal execution failures, exhausted retries and expired intents produce incidents automatically. A repeated incident ID with changed content fails `IDEMPOTENCY_CONFLICT`.

All mutation routes except signed action submission require `Authorization: Bearer <POA_OPERATOR_TOKEN>`. Generate a random secret of at least 32 characters, store it outside Git, and send it only from the operator process. The public signed action route uses EIP-712 verification and frozen per-scenario quotas. Neither credential belongs in browser storage. Publisher keys stay in the separate host publication process, not API/worker containers.

`POST /v1/experiments/:id/stop` accepts `{"reason":"..."}` with a mandatory bounded reason. It refuses an active action with `SCENARIO_BUSY`; first reconcile its existing durable work. Successful stop retains all portfolio hashes, closes submissions and appends `STOPPED_EARLY`. It is idempotent for the exact same reason. It does not settle transfers or erase capital in transit. Transfer deadline accounting remains the M5 `CLOSE` lifecycle, tested separately in the failure fixture.

The proposed operational policy is `config/operations-v1.json`: 120 requests per 60 seconds per direct peer, ten active agents, one active experiment per agent/profile. HTTP 429 includes `Retry-After`; rejected traffic creates no economic event. Health routes remain available. Accepted-intent quotas are frozen in the experiment profile. Proxies are not implicitly trusted, so a reverse proxy shares its peer quota until explicitly reviewed.

## Recovery

1. Inspect the action, canonical receipts, incidents and operational snapshot. A failed action and its costs are evidence; never delete them to make a demonstration look successful.
2. Restart the same worker service. Ready/retry jobs and expired leases use the persisted plan and receipt identities. Once the frozen attempt bound is exhausted the job stays failed, successful steps stay applied, and the scenario is released. New receipt content under an old operation ID fails.
3. A failure after plan persistence reuses those archived inputs. A failure after a receipt replays the same receipt idempotently. A byte-identical duplicate SDK submission retrieves the original acknowledgment, including after expiry or operator stop.
4. For source-chain failure, delayed attestation, destination retries, reorg or unresolved closure, follow the [M5 lifecycle runbook](m5-testnet-lifecycle.md). A clock or a service restart is not settlement evidence. Do not create another burn or manually credit a destination.
5. If Arc publication stops after broadcast, retain `m7-session.json.transaction.json` and run the same publication command. It checks the retained transaction against session identity, calldata, receipt, bytecode, finalized block and registry head. Never overwrite a published export or send another batch blindly. A reorg/mismatch fails closed.

## Export and publication

`pnpm demo:prepare` creates a new local isolated schema and immutable session if its output path is absent. Existing output is replayed, never relabeled fresh. On a clean clone use a new output path:

```sh
POA_DEMO_OUTPUT=.local/new-session.json pnpm demo:prepare
POA_DEMO_OUTPUT=.local/new-session.json pnpm demo:configure
```

The committed session has its own retained schema only on the presenting machine. A clean clone can always replay the committed JSON offline, or create the new session above. `pnpm demo:replay docs/evidence/m7-session-published.json` verifies frozen files against the current source revision, replays all three signed actions and six references, recomputes checkpoints/eligibility and verifies proofs. Restore the archived source revision if `VERSION_DRIFT` occurs; do not waive it. The dashboard's download link serves the latest immutable canonical session from PostgreSQL.

Publication is optional for a newly generated clone session until actual evidence exists; its dashboard says the anchor is unavailable. To publish, use the retained M6 Arc Testnet registry and its separate testnet publisher, with `ARC_TESTNET_RPC_URL` and `POA_REGISTRY_PUBLISHER_PRIVATE_KEY` (or the documented M5 test relayer fallback) available only to this host process:

```sh
POA_RUN_LIVE_M7_PUBLICATION=1 pnpm demo:publish
POA_RUN_LIVE_M7_VERIFY=1 pnpm test:evidence:m7
```

The first command spends testnet gas and writes immutable pending/published revisions, a transaction recovery record, a content-addressed raw object and the verified receipt. The second makes read-only public RPC checks and validates the archived raw object. Without their explicit flag these commands print `SKIPPED_TO_VERIFY`. Missing credentials after opening a gate fail, never silently skip. Publication cannot activate Ethereum economics, S3 retention or a product profile.

## Required checks

```sh
pnpm plan M7
pnpm check
pnpm db:migrate
pnpm test:db
pnpm test:fork
pnpm test:replay
forge test --root contracts
pnpm test:e2e:signed-intent
pnpm test:e2e:scenarios
pnpm test:e2e:export-proof
pnpm test:e2e:demo
pnpm demo:forward-gate
pnpm smoke
```

`test:fork` uses the existing explicit M2 gate; see that runbook for exact archive RPC, pinned blocks, fee/feed and code evidence. `POA_REQUIRE_FRESH_FORWARD=1 pnpm demo:forward-gate` must fail while any current gate is missing. No synthetic fallback can satisfy that request. The August replay adds zero mainnet forward observations. Local filesystem archives demonstrate content integrity and replay; S3 retention/restore and public hosting remain unverified.
