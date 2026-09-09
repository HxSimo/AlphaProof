# M4 validation evidence

- Date: 2026-09-09
- Provenance: `SYNTHETIC_TEST`
- External profile activation: none

The verified local M4 path covers three separately signed 1,000, 10,000 and 100,000 USDC streams, two fixed references each, amount-specific archived inputs and costs, passive index accrual, aligned checkpoints, mark/liquidation values, failure availability, descriptive differences, drawdown, append-only storage, redelivery and cross-process replay.

Commands and final outcomes:

```text
pnpm check
  PASS (format, types, manifests, 99 generated schemas, plan, unit tests, builds)
pnpm test:db
  PASS (M0 foundation, M3 transactions, M4 reference freeze/failure/idempotency)
pnpm test:e2e:signed-intent
  PASS
pnpm test:e2e:scenarios
  PASS
pnpm test:replay
  PASS (M2 portfolio and M4 checkpoint/evaluation cross-process replay)
docker compose up --build -d
pnpm smoke
  PASS
git diff --check
  PASS
```

M4 does not claim a mainnet block, contract call, quote, fee, yield rate, liquidity result, transaction or production object-store retention. The M2 fork gate remains `SKIPPED_TO_VERIFY`. Every manifest dependency remains disabled and `TO_VERIFY`; synthetic and replay outputs remain `NOT_ELIGIBLE_FOR_REAL_CAPITAL`.
