# M5 local validation evidence

- Date: 2026-09-09
- Deterministic provenance: `SYNTHETIC_TEST`
- Credentialed target provenance: `CROSS_CHAIN_TESTNET`
- External profile activation: none
- M5 completion: blocked on required live testnet evidence

The locally verified M5 path covers strict routes and lifecycle events, finalized-evidence boundaries, Arc decimal aliases, integer gas conversion, finite funded test-vault mechanics, bounded same-message retries, source failure, delayed attestation, destination failure, reorg invalidation, deadline closure, atomic accounting/job persistence and cross-process replay.

Commands and final outcomes:

```text
pnpm plan M5
  PASS; reports Authorized scope: M4 and the mandatory external gate
pnpm check
  PASS (format, types, manifests, 108 generated schemas, plan, 108 unit tests in 13 files, builds)
pnpm db:migrate
  PASS (migration 0004 applied/verified)
pnpm test:db
  PASS (M0 foundation, M3, M4 and M5 atomic transfer/restart checks)
pnpm test:e2e:signed-intent
  PASS
pnpm test:e2e:scenarios
  PASS
pnpm test:replay
  PASS; M5 fresh-process hash 0xc86f5ca463cafe8661a846d117809df7f914da140aaa2a42cb8768b0850f5c9e
forge fmt --check --root contracts
  PASS
forge build --root contracts
  PASS; lint emits naming-style notes only
forge test --root contracts -vv
  PASS (3 tests)
docker compose up --build -d
pnpm smoke
  PASS (M5 image, migration, API/database readiness and web/API hash)
pnpm test:fork
  SKIPPED_TO_VERIFY (existing M2 archive-RPC gate closed)
pnpm test:live:testnet
  SKIPPED_TO_VERIFY (explicit M5 live gate closed)
POA_RUN_LIVE_TESTNET=1 pnpm test:live:testnet
  EXPECTED FAIL before network access: LIVE_TESTNET_CONFIGURATION_MISSING: ETHEREUM_SEPOLIA_RPC_URL
git diff --check
  PASS
```

No live M5 evidence exists. The runner has not observed or recorded a vault address, deployment receipt, code hash, schedule-funding receipt, deposit/withdraw receipt, fee API result, CCTP burn, attestation, message identity, destination receipt, rejected duplicate mint or gas calibration. Every affected network, instrument, route and feed remains disabled and `TO_VERIFY`. The exact completion procedure is [M5 Sepolia ↔ Arc Testnet lifecycle](../runbooks/m5-testnet-lifecycle.md).
