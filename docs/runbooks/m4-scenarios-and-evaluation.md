# M4 multi-capital and evaluation runbook

M4 runs only with the opt-in `synthetic-m3-local` experiment fixture. All manifest profiles and external dependencies remain disabled.

```sh
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:e2e:scenarios
```

The scenario test creates one experiment, signs one prospective decision independently for each standard capital amount, runs the existing worker, enters each frozen conservative reference using a distinct amount-specific capture, and creates three checkpoints at the same timestamp. It checks financial identity isolation, independent costs, passive accrual, mark/liquidation separation, reference differences, append-only persistence, idempotent checkpoint redelivery and replay.

The API exposes canonical persisted results at:

```text
GET /v1/experiments/:experimentId/references
GET /v1/experiments/:experimentId/valuations
GET /v1/experiments/:experimentId/evaluations
```

Synthetic observations contain no block or transaction claim. Before using the conservative reference in a forward profile, complete the `aave-v3-ethereum`, `eth-usdc-conversion`, `rpc-ethereum-mainnet` and `archive-storage` gates in the M2 verification runbook, start a new experiment, and retain the same observation provenance for agent and reference portfolios.

Validation:

```sh
pnpm check
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:db
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:e2e:signed-intent
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:e2e:scenarios
pnpm test:replay
```
