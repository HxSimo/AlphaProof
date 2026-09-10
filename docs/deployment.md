# Local deployment and recovery

This is the tested hackathon deployment: pinned Node 22.21.1, pnpm 10.34.5, PostgreSQL 17.9 and Docker Compose on localhost. No public hosting deployment or production storage SLA is claimed. Automatic funding and all external product profiles remain disabled.

## Start

```sh
pnpm install --frozen-lockfile
# Only create .env if absent; preserve existing credentials.
test -f .env || cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
docker compose up --build -d
pnpm smoke
```

Web: http://localhost:3000. API: http://localhost:3001. PostgreSQL: localhost:54329. Compose ports are bound to loopback. The default page honestly shows no selected experiment. API readiness waits for migrations; web waits for API readiness. API, worker and web restart unless stopped. API/worker have a 30-second shutdown grace period. The image runs as the unprivileged `node` user and deliberately retains the pinned TypeScript tools and source for offline replay. Private `.env` files and Git history are excluded from the build context. The build includes the commitments workspace before frozen dependency installation.

For the retained presenting-machine session:

```sh
pnpm demo:configure
docker compose --env-file .env --env-file .local/m7-demo.env up -d
node --env-file=.env --env-file=.local/m7-demo.env --import tsx tests/smoke.ts
```

`demo:configure` only writes nonsecret experiment/schema selectors. All services use the selected PostgreSQL schema through `PGOPTIONS`; it never replaces the default schema or copies a key. A fresh clone lacks that retained schema: first create a distinct session with `POA_DEMO_OUTPUT=.local/new-session.json pnpm demo:prepare`, then use the same output variable with `demo:configure`. Its Merkle anchor remains unavailable until a real publication is verified. Offline replay of the committed published session needs no database or RPC.

Set `POA_OPERATOR_TOKEN` outside Git to enable control mutations. Keep the operator token with the operator/API; keep testnet publisher keys only in the publication process and agent signing keys only with the self-hosted agent. Compose does not pass publisher/deployer/agent keys to services. TLS, secret rotation, public rate-limit identity, backups and a restricted database role require deployment-specific review before public exposure. Do not expose the local database credentials to the internet.

## Back up and restore

Stop action intake before a consistent operational handover. A database backup plus raw input archives and exact source revision are required; JSON exports independently reproduce selected results but do not restore every job and acknowledgment.

```sh
mkdir -p .local/backups
docker compose exec -T postgres pg_dump -U poa -d poa -Fc > .local/backups/poa.dump
```

Keep a separate copy of `.local-evidence`, the chosen immutable export, its `.run.json`, transaction recovery records and `config/`. Record their content hashes. Verify restore into a **new** database; never restore over the active evidence database:

```sh
docker compose exec -T postgres createdb -U poa poa_restore_check
docker compose exec -T postgres pg_restore -U poa -d poa_restore_check --exit-on-error < .local/backups/poa.dump
```

Use a distinct restore-check database name for each run. Inspect migration checksums, replay a selected export and reconcile unfinished jobs before bringing a restored worker online. `docker compose down` preserves the volume; do not use `down -v` on retained evidence. A live PostgreSQL restart is safe for accepted jobs: atomic receipt transactions and lease recovery are covered by database and end-to-end tests.

The production `archive-storage` dependency requires an S3-compatible endpoint, retention for at least 90 days after closure, immutable writes and independent restore evidence. Local backup checks do not promote that gate. An external deployment requires its own health/TLS/access/backup evidence and remains outside the verified localhost result.

The retained quiescent demo was physically restarted across PostgreSQL, API and worker; [recovery evidence](evidence/m7-service-recovery.json) records identical export hashes and the preserved publication. Reproduce this check on the presenting-machine schema using `node --env-file=.env --import tsx tests/end-to-end/service-recovery.ts`. It refuses active jobs, uses localhost only and retains a create-only report; set a new `POA_RECOVERY_REPORT` path for later checks. The backup/restore commands above are operational instructions, not proof of S3 retention or a production restore SLA.
