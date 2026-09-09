# Proof of Alpha

Prospective evaluation for self-hosted stablecoin treasury agents. The intended MVP receives signed allocation intents, evaluates future consequences with virtual capital and observed market data, and publishes reproducible results. It never automatically allocates real funds.

**Current delivery: M5 is implemented and locally verified but blocked on mandatory live testnet evidence.** The durable CCTP lifecycle preserves one source debit, one unavailable receivable and at most one destination credit across retries and restarts. Sepolia and Arc Testnet share a finite funded test-vault implementation; Arc native/ERC-20 USDC aliases one balance. All external adapters and profiles remain disabled. The credentialed runner has not executed because RPC credentials, disposable keys and faucet balances are unavailable, so no deployment, attestation or chain transaction is claimed and M6 has not started.

## Run with Docker

```sh
docker compose up --build -d
```

Open <http://localhost:3000>. API: <http://localhost:3001/v1/profiles>. PostgreSQL listens on `localhost:54329`. Compose uses local development credentials and binds exposed services to localhost. The migration must succeed before API/worker start; the web waits for API readiness. `docker compose logs worker` shows an initial inserted configuration snapshot and subsequent idempotent checks.

```sh
docker compose logs --no-color
docker compose down
```

Stopping preserves the PostgreSQL volume. Do not remove a volume containing evidence. The M0 image deliberately retains the TypeScript toolchain; production image optimization is outside this milestone.

## Run on the host

Use Node from `.node-version`, Docker Compose and pinned pnpm:

```sh
npm install --global pnpm@10.34.5
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Run `pnpm build` before using `pnpm --filter @poa/web start`. API and worker load the repository `.env`; Next defaults to the local API on port 3001. For a different host API, export `API_INTERNAL_URL` into the process running Next. No chain RPC or signing key is needed for the M2 synthetic path. An agent's decision key never belongs in service configuration.

## Validate

```sh
pnpm check
pnpm test:replay
pnpm test:fork
pnpm plan M5
pnpm test:db
pnpm test:e2e:signed-intent
pnpm test:e2e:scenarios
forge fmt --check --root contracts
forge test --root contracts
pnpm test:live:testnet
pnpm smoke
git diff --check
```

`check` runs formatting, type checks, manifest/seal validation, generated-schema drift, unit/boundary tests and builds. `test:replay` reproduces M2, M4 and M5 results in fresh processes. `test:fork` skips with an explicit `TO_VERIFY` result unless the [M2 gate](docs/runbooks/m2-integration-verification.md) is enabled. `test:live:testnet` skips unless the explicit [M5 live gate](docs/runbooks/m5-testnet-lifecycle.md) is enabled and then fails closed on missing evidence. `test:db` requires PostgreSQL and `DATABASE_URL`; it creates/removes only uniquely named schemas. `smoke` requires the running web/API/PostgreSQL stack.

## Configuration and evidence

[`config/v1`](config/v1) is the selected version of the catalog, **not permission to start an experiment**. All three profiles are disabled. Twenty-three external dependencies and eleven candidate instruments have explicit `TO_VERIFY` gates. Unknown addresses, bytecode, fees, scales and deployment evidence are `null` or absent, not fabricated values. Documentation alone does not enable an adapter.

`ETHEREUM_MAINNET_FORWARD` has Ethereum markets and may use an Arc testnet registry. `CROSS_CHAIN_TESTNET` has Sepolia and Arc test markets. The future cross-chain mainnet profile is explicitly blocked. Replay, synthetic and mixed evidence cannot supply real-capital eligibility; statistics remain `NOT_ASSESSED`.

The three proposed scenario amounts are independent global treasuries, with no duplicated capital between chains. M2 runs each amount through separate synthetic protocol captures; it does not claim a live balance or scalable quote. Cash and one fixed passive investment are the only references. Numerical risk/timing defaults are proposed profile data. See [policy conventions](docs/experiment-policy/m0.md) for limits and unresolved calibration.

- [Project state and validation evidence](docs/project-state.md)
- [Executable milestone plan](docs/milestones.json) — `pnpm plan M0` through `M7`
- [Architecture and future database boundaries](docs/architecture.md)
- [ADRs](docs/adr)
- [External verification inventory](docs/integrations.md) and [instrument fact sheets](docs/instrument-catalog)
- [Canonical schemas](docs/schemas.md) and [generated JSON Schema](schemas/generated/v1.json)
- [M3 API and signing contract](docs/api/m3.md)
- [M4 API](docs/api/m4.md), [validation evidence](docs/evidence/m4-validation.md), [scenario/reference decision](docs/adr/0011-m4-scenarios-and-fixed-references.md), [checkpoint/evaluation decision](docs/adr/0012-m4-checkpoints-and-descriptive-evaluation.md), and [runbook](docs/runbooks/m4-scenarios-and-evaluation.md)
- [M5 validation evidence](docs/evidence/m5-validation.md), [finite-vault decision](docs/adr/0013-m5-finite-test-vault.md), [CCTP lifecycle decision](docs/adr/0014-m5-durable-cctp-lifecycle.md), and [live gate](docs/runbooks/m5-testnet-lifecycle.md)
- [M1 accounting decision](docs/adr/0006-deterministic-accounting.md) and [synthetic replay fixture](tests/fixtures/m1-accounting-transfer.json)
- [M2 validation evidence](docs/evidence/m2-validation.md), [archive decision](docs/adr/0007-content-addressed-economic-inputs.md), [adapter decision](docs/adr/0008-m2-ethereum-adapter-boundaries.md), and [activation runbook](docs/runbooks/m2-integration-verification.md)
- [M3 validation evidence](docs/evidence/m3-validation.md), [signed boundary decision](docs/adr/0009-m3-signed-experiment-boundary.md), [job transaction decision](docs/adr/0010-m3-journal-and-job-transactions.md), and [signed-intent runbook](docs/runbooks/m3-signed-intent.md)
- [Demo and provenance runbook](docs/demo-runbook.md)
- [Authoritative skill](.agents/skills/proof-of-alpha/SKILL.md) and [complete v0.3 specification](.agents/skills/proof-of-alpha/references/source-specification-v0.3.md)
