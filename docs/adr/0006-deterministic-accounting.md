# ADR-0006 — Deterministic global portfolio accounting

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: accounting engine `1.0.0`; no experiment is active.
- Supersedes: none.

## Context

M1 needs a replayable economic state that preserves one global treasury per capital scenario while operations move value among Ethereum cash, Arc cash, positions, reservations and transfers. The same reducer must survive duplicate delivery and worker restarts without inferring success from an external adapter.

## Constraints and evidence

- `LOCKED`: scenario capital is global and never duplicated; canonical balances use integer minimum units; partial successes and incurred costs remain; transfers credit once; missing valuation data remains explicit.
- `PROPOSED`: recoverable outputs round down, obligations round up, remainders are retained, and the profile permits three destination attempts total including the first.
- `TO_VERIFY`: protocol conversion formulas, targets, block behavior, gas conversion, live CCTP fees and message fields. M1 uses only labeled synthetic fixtures.
- `POST_MVP`: automated real-fund allocation and general accounting for non-stablecoin mandates.

## Decision

Use an immutable pure reducer in `@poa/accounting`. A `ShadowPortfolio` is scoped to one experiment, scenario and provenance and holds one canonical USDC cash balance per network/asset balance family. Multiple access views can resolve to that family; Arc native and ERC-20 views never create separate economic balances. The three standard capital sizes are three independent states.

Wire amounts are canonical decimal strings. Reducer arithmetic uses `bigint`; `mulDiv` and scale conversion require an explicit `FLOOR` or `CEIL` mode and return the exact discarded or added remainder. Indexed position book value is derived with floor rounding and stores its remainder. The invariant after every accepted receipt is:

```text
cash + reservations + position book value + receivables - payables
= initial capital + modeled PnL - recognized costs
```

Every receipt binds accounting version, experiment, scenario, provenance, expected state version, stable operation identity, observed time and source hashes. The portfolio records a hash of each applied receipt. An exact duplicate is a no-op; different content under the same operation identity is an `OPERATION_CONFLICT`; a new receipt against an old version is `STALE_PORTFOLIO`. Costs carry a stable identity and one of three funding paths: debit available cash, create a payable, or reconcile a withheld output gap. A payable settlement moves cash and liability together and does not recognize the cost again.

Transfer accounting moves the same units from available cash to a reservation, then to one unavailable net receivable, then to destination cash. A source failure releases the reservation minus actual costs. Delays and exhausted destination attempts retain the receivable. Three failed destination attempts block another attempt; they do not refund it. Closure hashes the pre-close deadline state, rejects later local economics and permits only transfer reconciliation.

Valuation consumes complete per-position observations without changing accounting. Mark value includes recorded receivables. Immediate liquidation excludes in-transit value and uses recoverable values minus estimated exit costs. Estimated exit costs never enter recognized costs until an execution receipt incurs them. Unavailable observations return unavailable values; stale observations remain stale.

## Alternatives considered

Maintaining independent chain portfolios was rejected because it can duplicate scenario capital and obscure internal transfers. Recomputing from mutable adapter state was rejected because restarts and historical replay would change results. Applying estimated liquidation fees to cash at every checkpoint was rejected because repeated viewing would create repeated economic charges.

## Consequences

The JSON fixture and deterministic tests cover success, rejection before attempt, failed attempt, partial success, delay, retry, attempt exhaustion, settlement, duplicate delivery, state corruption and serialize/reload at every boundary. Reducer state is suitable for M3 persistence but does not itself provide database concurrency or signed-intent authorization. M2 adapters must translate archived, verified mechanics into these receipts; they cannot bypass conservation or fabricate missing inputs.

## Activation gate

M1 does not enable an external dependency or profile. M2 must validate adapter-specific rounding, capacity, fees and observed source data with official current facts and fixed-block evidence before any real adapter can emit an accounting receipt.
