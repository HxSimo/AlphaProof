# ADR-0012 — Atomic checkpoints and descriptive evaluation

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: M4 checkpoint and evaluation records
- Supersedes: none

## Context

Agent and reference performance is comparable only at the same checkpoint and valuation convention. Index-based positions must accrue during inactivity, liquidation estimates must remain separate from marks, and missing market inputs must not become zero.

## Decision

`@poa/valuation` applies one versioned `ACCRUE` receipt per open position from an archived index input, then calls the M1 non-mutating valuation projection. A checkpoint contains the agent, cash reference and conservative reference at one timestamp, including available, reserved, in-transit, payable and blocked amounts. Mark and liquidation values are nullable and remain null for unavailable inputs.

`@poa/evaluation` publishes integer descriptive PnL, return basis points, drawdown, cumulative costs and differences from both references. Conservative-reference differences are null when entry failed. Statistical status is `NOT_ASSESSED`; synthetic provenance yields `NOT_ELIGIBLE_FOR_REAL_CAPITAL` before economic results are considered.

Checkpoint and evaluation rows are append only and committed atomically with the accrued portfolio states and journal event. Exact repeats return the existing checkpoint; conflicting identities fail. Replay validates content-addressed raw bytes, amount-specific quote-set hashes, checkpoint hashes and evaluation hashes in another process.

## Consequences

Exit estimates do not debit accounting state and repeated reads cannot charge exit costs. Historical checkpoint records survive later portfolio changes. M4 supplies descriptive evidence only; inferential statistics, commitments, export packaging and dashboard presentation remain later milestones.
