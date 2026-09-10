# M3 signed-intent runbook

M3 is executable with synthetic archived inputs while every external profile remains disabled. The local mode is excluded from eligibility and uses no RPC, deployed registry or service-held agent key.

```sh
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
POA_ENABLE_SYNTHETIC_M3=1 pnpm --filter @poa/api start
POA_ENABLE_SYNTHETIC_M3=1 pnpm --filter @poa/worker start
```

In a separate self-hosted process, set a disposable local test key and run:

```sh
POA_BOOTSTRAP_EXPERIMENT=1 \
POA_AGENT_PRIVATE_KEY=0x<local-test-private-key> \
pnpm --filter @poa/example-agent start
```

The private key is read only by the example process. The API stores canonical signed bytes and the signature. Never put a production decision key in the API or worker environment.

Validation:

```sh
pnpm check
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:db
DATABASE_URL=postgres://poa:poa-local-only@localhost:54329/poa pnpm test:e2e:signed-intent
pnpm test:replay
```

The end-to-end test starts an actual HTTP server and separate example-agent process, checks payload limits and secret absence, crashes after one durable receipt, restarts the worker, and replays its archived M2 bundle in another process. Test schemas are uniquely named and removed; the test never resets another schema.

M6 completed `registry-arc-testnet`. A non-synthetic policy now derives its EIP-712 domain from Arc Testnet chain `5042002` and registry `0xc391ad7e4826a2c1ecc56e845098b8c1b580eebd`; its deployment, code, roles and finality evidence are retained in `docs/evidence/m6-registry-publication.json`. Existing synthetic experiments keep chain `31337` and the zero address. Every external profile remains disabled by other gates, so the deployed registry alone does not authorize a non-synthetic start. Any future activation requires a new frozen experiment; never edit an existing policy.
