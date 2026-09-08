# Evaluation, risk, and statistics

## Three independent result dimensions

Always expose:

1. Operational compliance: valid behavior under the mandate, violations, incidents, and service/data failures.
2. Observed economics: net return, excess returns, costs, liquidity, drawdown, concentration, availability, and outcomes by tested capital.
3. Statistical evidence: whether the predeclared analysis supports a conclusion.

Do not collapse them into a single opaque score. A scenario can be compliant and economically positive but statistically inconclusive.

## Canonical returns

No external contribution or withdrawal occurs during an MVP experiment. For initial global capital `C0` and global value `Vt` under one declared valuation basis:

```text
PnL(t) = Vt - C0
Return(t) = Vt / C0 - 1
ExcessReturnVsCash(t) = ReturnAgent(t) - ReturnCash(t)
ExcessReturnVsConservativeYield(t)
  = ReturnAgent(t) - ReturnConservativeYield(t)
ConservativeYieldOpportunityCost(t)
  = -ExcessReturnVsConservativeYield(t)
```

Compare like with like: same start, distribution, period, unit, and mark/liquidation convention. Report return differences as percentage points for the same period. Do not compare one trade's ROI with an annualized lending rate.

## Required descriptive outputs

Per scenario, report at least:

- initial and current global value, mark and liquidation views;
- return and PnL net of market costs;
- excess return versus both references;
- gas by chain, protocol/swap/transfer/relayer fees, retries, and failed-attempt costs;
- maximum drawdown and descriptive volatility at the declared cadence;
- cash available per chain, invested capital, in-transit amount/age, and immediately recoverable amount;
- concentration by asset, instrument, protocol, and known shared dependency;
- data freshness/quality, blocked positions, violations, and incidents;
- declared operating-cost view, kept separate from canonical market result.

VaR/CVaR may be `UNAVAILABLE` with a reason. Never default missing risk metrics to zero.

## Capital-size reporting

Attach results only to observed sizes. `minimumObservedViableCapital` is the smallest tested size satisfying a named policy during this experiment, not a universal minimum. `observedEligibleCapitalSet` contains only tested sizes that passed all applicable gates.

Do not interpolate 50,000 from passing 10,000 and 100,000, estimate an optimal 35,000 from three points, or claim capacity beyond 100,000. A failed liquidity guard means unsupported or unassessable at that size, not automatically unprofitable.

## Provenance gate and overall status

Apply provenance before economic/statistical criteria:

```text
if testnet, replay, synthetic, or mixed:
  NOT_ELIGIBLE_FOR_REAL_CAPITAL
else if critical data invalid or unsupported scope:
  UNASSESSABLE
else if violation or declared economic/risk criterion fails:
  CRITERIA_NOT_MET
else if statistical evidence is not established:
  INSUFFICIENT_EVIDENCE
else:
  ELIGIBLE_UNDER_POLICY
```

Keep compliance, economic, statistical, and overall statuses visible with stable reason codes. `ELIGIBLE_UNDER_POLICY` is a report outcome, not automatic funding permission.

## Statistical states

- `NOT_ASSESSED`: no validated inferential method is enabled.
- `INSUFFICIENT_EVIDENCE`: a method exists but the history/minimum conditions do not support a conclusion.
- `CRITERION_NOT_MET`: scheduled analysis ran and did not meet its criterion.
- `CRITERION_MET`: the predeclared criterion was satisfied within its assumptions.

The hackathon may legitimately finish with `NOT_ASSESSED` or `INSUFFICIENT_EVIDENCE`. Never add a naive confidence interval to create a green badge.

## Statistical design requirements before activation

Define in advance:

- estimand and economic null/minimum effect;
- sampling frequency and deadline;
- temporal dependence assumptions;
- minimum observation and data-quality conditions;
- risk/return combination being tested;
- multiple testing across versions, identities, profiles, capital sizes, and stopping looks;
- treatment of missing/stale data and incidents;
- exact implementation and version.

Actions are not the sample size. Hourly returns are autocorrelated, and the three capital scenarios share market events. Candidate future techniques include HAC/Newey-West, block bootstrap, or valid confidence sequences under their assumptions. These do not manufacture unobserved crisis regimes.

Record all known launched, stopped, failed, and completed experiments. Hidden variants remain a limitation. A planned deadline prevents optional stopping; interim descriptive metrics do not create new unplanned conclusions.

## Structural risk

Metrics cannot infer smart-contract exploit probability from a short incident-free period. Maintain fact sheets covering contracts, governance, admin controls, underlying assets, collateral, liquidity, CCTP/relayer dependencies, and common protocol exposure. State “no stress observed” instead of “robust under stress.”
