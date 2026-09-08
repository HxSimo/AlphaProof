# ADR-0001 — Runtime and persistence architecture

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: no experiment is active; proposed profiles must pass activation gates before X.
- Supersedes: none.

## Context

The repository had no code or commits. M0 needs an executable foundation that can grow into one prospective receipt pipeline.

## Constraints and evidence

- Locked requirements: authoritative project charter and v0.3 specification; M0 only is authorized.
- Current official/empirical evidence: see [source checks](../evidence/m0-source-checks.md) and [project state](../project-state.md).
- Unknowns: exact protocol addresses, deployed services, live fees/liquidity and fork/transaction evidence remain TO_VERIFY.

## Options considered

### Option A

A single pnpm TypeScript workspace with Next.js/React web, Fastify API, a modular Node worker, PostgreSQL and S3-compatible archival.

### Option B

Separate microservices and Redis/Kafka: additional failure and consistency boundaries without measured demand.

## Decision

Accept the v0.3 baseline. Pin Node 22.21.1, pnpm 10.34.5, TypeScript 5.9.3, Next 16.3.4/React 19.2.8, Fastify 5.12.3, Zod 4.5.4, viem 2.56.3 and PostgreSQL 17.9. Exact dependency graph is in pnpm-lock.yaml; Node/Postgres container digests are pinned. M0 creates only domain, schemas, config and storage packages because these have working consumers. API/worker run TypeScript through the pinned tsx loader; web produces a Next production build. This is a development/hackathon image, not an optimized production deployment.

## Consequences

The worker currently validates and archives content-addressed configuration snapshots. In M3 add a PostgreSQL job queue with leases, SKIP LOCKED claiming, retry scheduling, a unique financial operation identity and atomic receipt/effect application; delivery is at least once, economic effect is at most once. Economic journal and rebuildable projections arrive with their consumers. No generic queue or accounting placeholder is counted as implemented. S3 raw-input archival is gated for M2. Solidity/Foundry registry and test vault arrive with actual behavior/tests in M5/M6.

## Activation gate

Local build and all M0 validations pass; later SQL queue atomicity/restart tests gate M3. Configuration journal append-only triggers do not protect against a database administrator.
