# Proof of Alpha

Prospective evaluation for self-hosted stablecoin treasury agents. The intended MVP receives signed allocation intents, evaluates future consequences with virtual capital and observed market data, and publishes reproducible results. It never automatically allocates real funds.

**Current delivery: M2 local Ethereum economic slice.** The M0 applications and M1 accounting kernel remain intact. `@poa/market-data` archives content-addressed inputs; `@poa/adapters` turns exact captured Aave V3, MetaMorpho V1 ERC-4626 and direct Uniswap V3 inputs into M1 receipts; `@poa/experiments` replays selected receipts in another process. All external adapters and profiles remain disabled because no archive-RPC/fixed-block/code/gas/storage activation evidence is available. Signed-intent submission and commitments are scheduled in M3–M7. No performance results, live liquidity, fork pass or deployed contract is claimed.

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
pnpm plan M3
pnpm test:db
pnpm smoke
git diff --check
```

`check` runs formatting, type checks, manifest/seal validation, generated-schema drift, unit/boundary tests and builds. `test:replay` restores raw objects in another process. `test:fork` skips with an explicit `TO_VERIFY` result unless the credential gate described in the [M2 verification runbook](docs/runbooks/m2-integration-verification.md) is enabled. `test:db` requires PostgreSQL and `DATABASE_URL`; it creates/removes only its own uniquely named schema. `smoke` requires the running web/API/PostgreSQL stack. CI runs the uncredentialed checks using the same pinned dependencies and Docker images.

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
- [M1 accounting decision](docs/adr/0006-deterministic-accounting.md) and [synthetic replay fixture](tests/fixtures/m1-accounting-transfer.json)
- [M2 validation evidence](docs/evidence/m2-validation.md), [archive decision](docs/adr/0007-content-addressed-economic-inputs.md), [adapter decision](docs/adr/0008-m2-ethereum-adapter-boundaries.md), and [activation runbook](docs/runbooks/m2-integration-verification.md)
- [Demo and provenance runbook](docs/demo-runbook.md)
- [Authoritative skill](.agents/skills/proof-of-alpha/SKILL.md) and [complete v0.3 specification](.agents/skills/proof-of-alpha/references/source-specification-v0.3.md)
