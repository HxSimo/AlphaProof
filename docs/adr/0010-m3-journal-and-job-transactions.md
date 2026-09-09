# ADR-0010 — M3 journal and job transactions

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: PostgreSQL migration 0002 and action worker version 1.0.0.
- Supersedes: none.

## Context

Duplicate HTTP requests, concurrent decisions, process loss and later-step failure must not duplicate financial effects or erase successful work.

## Decision

Acceptance takes a transaction-scoped advisory lock for the experiment/scenario, checks exact idempotency content before nonce reuse, locks the portfolio row, then atomically inserts the signed request, chained journal event, active-action marker and one job with a stable financial identity. Unique constraints backstop idempotency keys and scenario-scoped nonces. The daily quota counts durable acceptances; malformed anonymous requests do not enter the economic journal.

Workers claim jobs with `FOR UPDATE SKIP LOCKED` and expiring leases. A plan and its content-addressed synthetic observation bundle are create-only. Each M1 accounting receipt is inserted with the resulting portfolio version in one transaction and has a unique action/operation identity. A restart reuses the same plan and receipts; already applied operations return their existing state. A permanent later-step error closes the action as partially succeeded when prior receipts exist, retaining those receipts and costs. An ordinary process interruption releases the job for retry.

Execution success exists only after a validated M1 receipt is persisted. The M3 fixture contains no transaction hash and claims no chain execution.
