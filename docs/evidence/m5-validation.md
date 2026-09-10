# M5 validation evidence

- Date: 2026-09-09
- Deterministic provenance: `SYNTHETIC_TEST`
- Credentialed target provenance: `CROSS_CHAIN_TESTNET`
- External profile activation: none; verified component gates do not remove the M6 profile blockers
- M5 completion: complete

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
  PASS on 2026-09-10; finalized Sepolia/Arc vault round trips and both CCTP directions
pnpm capture:evidence:m5
  PASS; pinned finalized deployment blocks, headers, historical code and decimals captured
pnpm test:evidence:m5
  PASS; 97 objects, index hash 0xd425cac12d0d28839cd245fb3f08d90a1993bec39bc22b6dc12fc83369a71527
git diff --check
  PASS
```

The live run used a schedule start frozen more than three hours ahead, CCTP V2 Standard threshold 2000 and the current captured zero Standard protocol fee in each direction. It reconciled 2,000,000 minor units Sepolia→Arc and 1,000,000 minor units Arc→Sepolia. Every success and expected duplicate-receive revert is finalized. The [live evidence index](m5-live-index.json) records the exact vaults, transaction hashes, message identities and every retained object hash. These are testnet technical results and remain `NOT_ELIGIBLE_FOR_REAL_CAPITAL`.

Two expected fail-closed corrections occurred before the final pass and are retained: raw 64-character keys initially failed the strict parser, and Circle's current decoded response returned a 20-byte recipient where the first parser expected a padded word. The final parser normalizes the displayed address and independently decodes the raw signed CCTP message. A finalized outbound burn was resumed only after its exact transaction arguments were re-read and matched, preventing a second source debit.
