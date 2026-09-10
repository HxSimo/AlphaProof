# Proof of Alpha

Prospective evaluation for self-hosted stablecoin treasury agents. The local MVP receives signed allocation intents, evaluates consequences with virtual capital and archived inputs under frozen policies, and publishes reproducible results. It never automatically allocates real funds.

**Current delivery: M7 is complete and verified.** The project receives prospective EIP-712 intents, keeps three independent capital streams and two fixed references per stream, applies deterministic accounting, persists restart-safe execution/transfer state, reports separate compliance, economic, statistical and overall eligibility statuses, exports full replay evidence and anchors ordered audit batches on Arc Testnet. Genuine M5 vault/CCTP receipts and the M6/M7 registry deployment/publications are retained. Every external profile remains disabled, testnet/synthetic/replay output remains ineligible for real capital, and automatic funding remains off.

M7 adds the complete local signer-to-proof rehearsal, retained Arc Testnet anchoring, monitoring, authenticated control writes, quotas, immutable incidents and failure recovery. Economics in the selected demonstration are **synthetic**, all external product profiles remain **disabled**, statistical inference is disabled, and no real capital is allocated. The longer August replay also uses synthetic sources and adds no forward track record.

```sh
pnpm demo:replay docs/evidence/m7-session-published.json
pnpm demo:diagnostics
```

These commands independently replay retained evidence without RPC credentials. For the live local dashboard and timed full path, follow the [final demo runbook](docs/demo-runbook.md) and [deployment guide](docs/deployment.md). A clean clone can create a new independent synthetic session; the presenting machine's retained database schema is not assumed to exist elsewhere. An unanchored session clearly shows its proof as unavailable.

## Run with Docker

```sh
docker compose up --build -d
```

Open <http://localhost:3000>. API: <http://localhost:3001/v1/profiles>. PostgreSQL listens on `localhost:54329`. Compose uses local development credentials and binds exposed services to localhost. The migration must succeed before API/worker start; the web waits for API readiness. `docker compose logs worker` shows an initial inserted configuration snapshot and subsequent idempotent checks.

```sh
docker compose logs --no-color
docker compose down
```

Stopping preserves the PostgreSQL volume. Do not remove a volume containing evidence. The development image retains the TypeScript toolchain; the M7 image deliberately retains the pinned TypeScript toolchain and replay sources.

## Run on the host

Use Node from `.node-version`, Docker Compose and pinned pnpm:

```sh
npm install --global pnpm@10.34.5
pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
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
pnpm plan M7
pnpm test:db
pnpm test:e2e:signed-intent
pnpm test:e2e:scenarios
pnpm test:e2e:export-proof
pnpm test:e2e:demo
pnpm demo:forward-gate
pnpm test:evidence:m5
pnpm test:evidence:m6
forge test --root contracts
pnpm test:live:testnet
pnpm smoke
git diff --check
```

`check` runs formatting, type checks, manifest/seal validation, generated-schema drift, unit/boundary/UI tests and builds. `test:replay` reproduces M2, M4, M5, M6 and M7 results in fresh processes. `test:e2e:export-proof` independently recomputes the selected evaluation and verifies the complete commitment chain. `test:fork` skips with an explicit `TO_VERIFY` result unless the [M2 gate](docs/runbooks/m2-integration-verification.md) is enabled. `test:live:testnet` skips unless the explicit [M5 live gate](docs/runbooks/m5-testnet-lifecycle.md) is enabled and then fails closed on missing evidence. The M5/M6 evidence verifiers need the documented read-only RPCs. `test:db` requires PostgreSQL and `DATABASE_URL`; it creates/removes only uniquely named schemas. `smoke` requires the running web/API/PostgreSQL stack.

## Configuration and evidence

[`config/v1`](config/v1) is the selected version of the catalog, **not permission to start an experiment**. All three profiles are disabled. Twenty-three external dependencies and eleven instruments have per-environment evidence gates; verified M5/M6 testnet components are marked `VERIFIED_FOR_TESTNET`, while Ethereum mainnet economics, Arc mainnet and production archive retention remain `TO_VERIFY`. Unknown addresses, bytecode, fees, scales and deployment evidence are `null` or absent, never fabricated. Documentation alone does not enable an adapter.

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
- [M6 validation evidence](docs/evidence/m6-validation.md), [commitment/export decision](docs/adr/0016-m6-commitments-exports-and-corrections.md), [Arc evidence](docs/evidence/m6-registry-publication.json), [replay export](docs/evidence/m6-demo-export.json), and [verification runbook](docs/runbooks/m6-export-proof.md)
- [M7 operational/API contract](docs/api/m7.md), [operations runbook](docs/runbooks/m7-demo-operations.md), [validation and retained evidence](docs/evidence/m7-validation.md), [timed rehearsal](docs/evidence/m7-rehearsal.json), and [deployment/recovery](docs/deployment.md)
- [M6 read-only API](docs/api/m6.md)
- [M1 accounting decision](docs/adr/0006-deterministic-accounting.md) and [synthetic replay fixture](tests/fixtures/m1-accounting-transfer.json)
- [M2 validation evidence](docs/evidence/m2-validation.md), [archive decision](docs/adr/0007-content-addressed-economic-inputs.md), [adapter decision](docs/adr/0008-m2-ethereum-adapter-boundaries.md), and [activation runbook](docs/runbooks/m2-integration-verification.md)
- [M3 validation evidence](docs/evidence/m3-validation.md), [signed boundary decision](docs/adr/0009-m3-signed-experiment-boundary.md), [job transaction decision](docs/adr/0010-m3-journal-and-job-transactions.md), and [signed-intent runbook](docs/runbooks/m3-signed-intent.md)
- [Demo and provenance runbook](docs/demo-runbook.md)
- [Authoritative skill](.agents/skills/proof-of-alpha/SKILL.md) and [complete v0.3 specification](.agents/skills/proof-of-alpha/references/source-specification-v0.3.md)
