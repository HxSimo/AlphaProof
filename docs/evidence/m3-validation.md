# M3 validation evidence

Date: 2026-09-09. Scope: prospective experiment, API, SDK and PostgreSQL worker using synthetic archived inputs only.

## Verified locally

- `pnpm plan M3` printed M3.1–M3.3, observable exits and the local signing-domain gate.
- Frozen offline install linked all 15 workspace projects from the existing package store.
- `pnpm check` passed formatting, type checks, manifest/seal validation, generated-schema drift, unit/boundary tests and production builds.
- `pnpm test:db` passed the M0 migration checks and the M3 PostgreSQL suite: blocked external start, frozen snapshot hashes, immutable policy, additive correction, signature/key/revocation, expiry, profile/scenario/policy binding, stale version, nonce, exact idempotency, quota, scenario concurrency, atomic journal/job and append-only records.
- `pnpm test:e2e:signed-intent` started an HTTP API and a separate self-hosted example-agent process. The decision key stayed in that process; PostgreSQL retained canonical typed bytes and durable receipt time. Exact resubmission returned the same action. The worker crashed after one committed receipt, resumed the same financial identity, applied the remaining receipt once, and preserved an intentional later-step failure as partial success.
- The end-to-end test sent the stored M3 raw-input bundle to another Node process. It restored content-addressed bytes, reran the M2 Aave adapter and matched the archived receipt hash.
- `pnpm test:replay` retained the M2 cross-process replay hash `0x5308faa40e13f4f522da417bf3fd3b330497fa2123cc58b257333a8d67b54b1b`.
- `docker compose build` completed the pinned 15-workspace install and production build. `docker compose up -d` ran migration 0002, API, worker, web and PostgreSQL; `pnpm smoke` passed API readiness, disabled-profile catalog and rendered provenance/limitations.

## Evidence boundary

The only startable M3 profile is the opt-in local fixture `synthetic-m3-local`. It has `SYNTHETIC_TEST` provenance and uses EIP-712 chain ID 31337 with the zero address. This states that no verifying contract exists; it does not fabricate one. Every manifest profile, external adapter, RPC, archive service and Arc registry remains disabled and `TO_VERIFY`. M3 created no live quote, block, liquidity result, transaction, deployment or eligibility result.

The synthetic Aave observations retain exact raw bytes, content hashes, amount, source/parser/adapter versions, validity interval and provenance. Their dummy contract fields are test data and appear only inside the synthetic bundle. They cannot be promoted into a forward experiment.
