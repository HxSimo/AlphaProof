# Proof of Alpha — final hackathon demonstration

The story is prospective decisions and auditable consequences, with evidence before capital. Self-hosted agents sign allocations; the service durably receives them, freezes rules, evaluates three global treasuries and two fixed references, and exports verifiable receipts. It never automatically funds an agent.

The full-path M7 demonstration uses real local SDK signatures and PostgreSQL transactions with **synthetic economic inputs**. The separate Sepolia/Arc vault and bidirectional CCTP evidence is actual retained testnet activity. The Arc registry receipt is an actual retained testnet integrity anchor over synthetic results. The longer August replay is **synthetic dated input**, not historical market performance. There is **no verified fresh Ethereum mainnet-forward session**. All three product profiles remain disabled.

## Prepare before the timed portion

Follow [local deployment](deployment.md) and [M7 operations](runbooks/m7-demo-operations.md). Preserve `.env`, existing database schemas and the committed evidence.

```sh
pnpm plan M7
pnpm check
pnpm db:migrate
pnpm test:db
pnpm test:fork
pnpm test:replay
forge test --root contracts
pnpm test:e2e:export-proof
pnpm test:evidence:m5
pnpm test:e2e:demo
pnpm demo:forward-gate
```

A gate returning `SKIPPED_TO_VERIFY` is not a successful fork or live test. Reproduce the committed selected session without credentials:

```sh
pnpm demo:replay docs/evidence/m7-session-published.json
```

On the presenting machine the selected schema is retained. Configure the read-only dashboard and verify its downloaded export:

```sh
pnpm demo:configure
docker compose --env-file .env --env-file .local/m7-demo.env up --build -d
node --env-file=.env --env-file=.local/m7-demo.env --import tsx tests/smoke.ts
```

A clean clone can run every offline proof/replay and create its own new local SDK session using `POA_DEMO_OUTPUT=.local/new-session.json pnpm demo:prepare`. Its output is a distinct experiment, remains synthetic, and has an unavailable anchor until an actual publication is verified. Do not claim that a clean-clone replay restored the presenting machine's database. Publishing is a separate explicit test-token action described in the M7 runbook, not part of a fallback replay.

## Timed complete software rehearsal

Open http://localhost:3000. Run:

```sh
pnpm demo:rehearse
```

This executes the following sequence, fails on any assertion, records per-step and total wall time, and writes a create-only `docs/evidence/m7-rehearsal.json`. For a subsequent run, preserve that report and use `POA_REHEARSAL_REPORT=.local/rehearsal-2.json pnpm demo:rehearse`. The time measures the software demonstration, not the multi-day economic observation window or a human presentation duration.

| Step | Action and evidence to show                                                                                                                                                          | Honest interpretation                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Three external signer child processes fetch frozen policy and submit different scenario-bound EIP-712 intents; repeat the same bytes                                                 | Actual local signatures and durable receive times, with no remote agent code or key                                                             |
| 2    | Interrupt the worker after its first receipt, restart it, reproduce the same plan and retain approval/supply costs once                                                              | Synthetic future consequences under the declared compressed clock; no chain transaction claimed                                                 |
| 3    | Compare independent 1,000 / 10,000 / 100,000 USDC portfolios with cash and the frozen conservative reference                                                                         | Correlated views of one policy, n = 1; no quote or capital silently scaled                                                                      |
| 4    | Show failed conservative entry for the 1k scenario, cash/costs retained, comparison unavailable, original incident visible                                                           | No replacement instrument and no missing value replaced by zero                                                                                 |
| 5    | Replay withdrawal → failed swap; show delayed transfer, unavailable receivable at closure and later same-message settlement                                                          | Every prior success, cost and deadline hash survives; late settlement cannot improve the deadline result                                        |
| 6    | Replay thirty dated August checkpoints with drawdown and both references                                                                                                             | Source provenance stays synthetic; losses remain visible and zero forward observations are added                                                |
| 7    | Replay the M5 lifecycle and M6 original/correction commitments, keeping their original transaction dates and provenance                                                              | Retained real testnet evidence and synthetic software replay are separate; nothing is described as a fresh transaction                          |
| 8    | Fetch the canonical dashboard, operational health, incidents and downloadable selected M7 export; show mark/liquidation, cash/positions/transit/blocked, costs and separate statuses | Browser displays backend objects; incomplete economic window is unassessable, statistical inference disabled, real-capital eligibility excluded |
| 9    | Independently replay the selected published M7 session, verify its ordered Merkle proof and deliberately modify a leaf/input/source                                                  | Original verifies; tampering, missing objects and provenance splicing fail closed                                                               |
| 10   | Print the Ethereum forward gate and its exact remaining blockers                                                                                                                     | No fresh mainnet-forward history exists; replay/testnet cannot extend it                                                                        |

The selected retained M7 export is [m7-session-published.json](evidence/m7-session-published.json). Its prior [unpublished revision](evidence/m7-session.json), [verified publication evidence](evidence/m7-registry-publication.json) and [timed report](evidence/m7-rehearsal.json) remain separate immutable artifacts. Complete detailed failure states and every receipt are in [failure/stress inputs](../tests/fixtures/m7-failure_stress.json) and [longer synthetic replay inputs](../tests/fixtures/m7-longer_replay.json); `pnpm demo:diagnostics` prints their identity hashes, and the replay tests reconstruct every intermediate state.

## Optional current read-only public verification

These commands do not create transactions. They fail on missing credentials/evidence once explicitly enabled:

```sh
POA_RUN_LIVE_M6_VERIFY=1 pnpm test:evidence:m6
POA_RUN_LIVE_M7_VERIFY=1 pnpm test:evidence:m7
```

`pnpm test:evidence:m5` is an offline validator of the retained real M5 raw receipts and index; it does not make fresh RPC calls. The M5 runbook documents its separate historical-capture and testnet transaction gates. Never infer a successful live check from an offline hash match. Periodic post-execution anchoring proves integrity after the anchor block. It does not independently prove that server receipt preceded execution or establish economic correctness.

## Failure and fallback

If the API is unavailable, the page says so; it does not substitute a cached report. Use the committed export and original dates in an explicitly labeled offline replay. If a worker stops, inspect its incident and durable job, then restart under the same retry bound. If attestation is delayed, capital stays unavailable. If publication is unavailable, results and proof candidates remain visible but no confirmed anchor is claimed. Preserve errors, early stops, unfavorable comparisons and exhausted retries.

For questions from judges: the artifact demonstrates signatures, policy freeze, deterministic accounting, independent scenarios/references, real testnet technical execution, and tamper-evident replay. It does not demonstrate profitable live mainnet performance, statistical alpha, unrestricted virtual-position exit capacity, production storage retention, public hosting or automatic real-capital allocation. Remaining dependency details are in [integrations](integrations.md) and [M7 validation evidence](evidence/m7-validation.md).
