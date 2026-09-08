# M0 validation evidence

Date: 2026-09-08. Local software/configuration validation only. No market RPC, fixed-block fork, live testnet transaction, economic forward evaluation or deployed commitment is claimed.

| Command / check                                              | Observed result                                                                                                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned pnpm install; Docker `pnpm install --frozen-lockfile` | Passed; 8 workspace projects, 148 installed dependency packages; lockfile unchanged                                                                                                          |
| `pnpm check`                                                 | Passed: format, TypeScript, manifest/seal, schema drift, plan validation, tests and all application builds                                                                                   |
| `pnpm test`                                                  | **52 tests passed in 4 files**, no failed/skipped tests in the focused suite                                                                                                                 |
| Canonicalization golden vector                               | Independent Foundry `cast keccak` agrees with the exact vector recorded below                                                                                                                |
| `pnpm config:validate`                                       | Three profiles, four networks, eleven instruments and twenty-three external dependencies; all profiles/integrations disabled                                                                 |
| `pnpm schemas:check`                                         | 47 structural schema definitions match runtime source generation                                                                                                                             |
| `pnpm plan:check`                                            | M0–M7 dependency order, deliverables, observable exits and validation commands checked                                                                                                       |
| `pnpm db:migrate`                                            | Passed against PostgreSQL 17.9                                                                                                                                                               |
| `pnpm test:db`                                               | Eight checks passed: concurrent migrations; duplicate worker delivery; reconnect/restart; stored hash; UPDATE/DELETE/TRUNCATE rejection; applied migration drift; failing migration rollback |
| `docker compose config --quiet`                              | Passed                                                                                                                                                                                       |
| `docker compose build`                                       | Passed from pinned Node image with frozen dependency install and successful web/API/worker builds                                                                                            |
| `docker compose up -d`                                       | PostgreSQL and API healthy, migration exited successfully, web and worker running                                                                                                            |
| `pnpm smoke`                                                 | API readiness/catalog validated; web contains exact API bundle hash, provenance and disabled-experiment limitation                                                                           |
| Actual worker restart                                        | Restarted container and an additional one-shot worker returned inserted=false; PostgreSQL retained exactly one configuration snapshot                                                        |
| GitHub CI                                                    | Configured in `.github/workflows/ci.yml`; remote execution not run or claimed                                                                                                                |

Exact independently verified canonicalization vector:

```text
UTF-8 input: {"a":"1","b":2}
keccak256: 0x012ab269a47043e8e1f3103d13c13fe88fa405d36baee397e63c0a6ec9fb1dc8
```

Selected manifest bundle hash:

```text
0xe56799da87c300fd434d550069a0bbb6d742d85b488360a241868e827495ab54
```

The database suite uses a uniquely named schema and removes only that schema afterward. It does not truncate a user's database. Migration failure is tested by creating a table and issuing an invalid statement, then checking that both table creation and migration recording rolled back. Snapshot insertion is tested with eight concurrent workers, followed by a new connection pool and replay of the same check.

Development failures found and fixed: malformed decimal strings reached BigInt conversion; the initial test glob traversed workspace dependency links; Next webpack needed explicit TypeScript resolution for ESM `.js` imports; clean type checks now generate Next route types first. Final review also added regression tests for contradictory network environments and a non-USDC cash reference. Final focused tests and production builds pass. Some local build/socket commands required execution outside the filesystem/network sandbox; no automatic approval rejection remains.

Limitations: these checks validate M0 configuration infrastructure. Full accounting conservation, economic receipt replay, EIP-712 verification, financial queue idempotency, on-chain adapters, CCTP settlement, eligibility evaluation and Merkle commitments remain in M1–M6. The absence of those suites is explicitly recorded rather than counted as a pass.
