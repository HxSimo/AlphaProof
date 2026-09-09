# ADR-0011 — Independent capital scenarios and frozen references

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: M4 experiments created after this implementation
- Supersedes: none

## Context

The three required capital sizes are correlated views of one decision policy, but each is a separate global treasury. Each scenario also needs exactly two like-for-like comparisons without duplicating balances or choosing a better reference after results are visible.

## Decision

Experiment start creates the 1,000, 10,000 and 100,000 USDC agent portfolios and exactly two reference portfolios for each. Cash and conservative-yield references copy the agent's initial distribution, period and mark/liquidation convention, while receiving distinct portfolio and receipt identities. The conservative instrument is frozen as `eth-aave-usdc`; this is a configuration choice and does not activate the unverified external adapter.

The cash reference never enters a position. The conservative reference makes one amount-specific entry and then only accrues by archived protocol mechanics. A failed entry records all receipts and costs already incurred, retains uninvested cash, sets comparison availability false and is terminal. A database trigger prevents instrument or reference-kind replacement.

## Consequences

Every capital amount has its own signed action, quote inputs, costs, receipts, balances and reference entry. Shared amount-independent observations may be reused as common snapshots, while amount-dependent gas and exit inputs must differ. Reporting labels all three scenarios `CORRELATED_POLICY_VIEWS` with an effective independent sample count of one.

External Aave deployment, archive RPC, fixed-block mechanics and production object retention remain `TO_VERIFY`. Synthetic reference entries are always excluded from real-capital eligibility.
