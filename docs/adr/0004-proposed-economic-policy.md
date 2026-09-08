# ADR-0004 — Proposed timing, costs, reference and statistics conventions

- Status: `ACCEPTED`
- Date: 2026-09-08
- Applies to new experiments from: no experiment is active; proposed profiles must pass activation gates before X.
- Supersedes: none.

## Context

M0 must choose concrete defaults without presenting uncalibrated numerical values as validated financial rules. Source sections 29.2–29.12 distinguish proposed parameters from locked invariants.

## Constraints and evidence

- Locked requirements: authoritative project charter and v0.3 specification; M0 only is authorized.
- Current official/empirical evidence: see [source checks](../evidence/m0-source-checks.md) and [project state](../project-state.md).
- Unknowns: exact protocol addresses, deployed services, live fees/liquidity and fork/transaction evidence remain TO_VERIFY.

## Options considered

### Option A

Use the source defaults as proposed profile data, with fail-closed missing-data and cost conventions.

### Option B

Hidden runtime defaults or adaptive rules after seeing results: break prospective comparison and reproduction.

## Decision

Keep the proposed 100% Ethereum/Sepolia start, 10% cash target, 40% investment, 60% underlying protocol, 25% USDT, 40% in transit and 10 bps slippage. Cash is exempt from investment concentration; the passive reference has its own disclosed concentration. First Ethereum/Sepolia step is receipt block +2 and must be strictly after durable receipt; subsequent step at least +1. Arc first admissible block follows a proposed 2-second delay. Plan-start expiry 120 seconds, local segment bounds 10 Ethereum blocks/120 Arc seconds, transfer alert 1 hour and unresolved incident at 24 hours. Three destination attempts total (including first) is a new explicit proposed beta bound. A retry continues the same message; limits never cancel a receivable.

## Consequences

All gas, protocol, swap, CCTP and relayer costs captured once, preserving native units and USDC conversion evidence. Prefunded test relayer is chosen for testnet; funding is infrastructure and does not add shadow bankroll. Standard fees are not hardcoded zero. Gas calibration, per-source freshness, finality and directional delays remain TO_VERIFY. Floor recoverable outputs and ceil obligations with retained dust are the M1 starting rounding policy, refined against adapter mechanics in M2. Receipt/index/share accrual replaces APY accrual. Cash and one passive yield reference share initial distribution/cost conventions. No reference replacement after failure. Checkpoints 5 min, descriptive hourly, daily summaries, mainnet duration 30 days and testnet duration 1 day are proposals, not power claims. Statistical inference remains NOT_ASSESSED and eligibility is disabled.

## Activation gate

M1 property/failure tests establish arithmetic behavior; M2 calibrates exact mechanics; M3 freezes hashes/timing before X. No forward profile starts until source freshness/finality/cost rules are populated. These proposals never authorize automatic funding.
