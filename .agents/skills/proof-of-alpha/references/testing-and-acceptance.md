# Testing, acceptance, and demonstration

## Test pyramid

1. Pure deterministic unit tests for amounts, rounding, hashes, planners, accounting, state machines, and status gates.
2. Adapter fixtures using captured raw responses and known expected normalized outputs.
3. Fixed-block fork tests for supported contract operations and failure/limit behavior.
4. Replay tests that rebuild portfolios and receipts from archived inputs.
5. Database integration tests for atomicity, uniqueness, idempotency, restart, and concurrent workers.
6. End-to-end tests from SDK-signed intent through report/export/proof verification.
7. Separate live testnet lifecycle checks for Sepolia ↔ Arc Testnet and the Arc test vault.

Replay and synthetic tests validate software; label them so they never enter forward evidence.

## Accounting invariants

- No operation creates assets except explicitly modeled yield or an external test-token distribution outside shadow bankroll.
- Fees are recognized exactly once and in the correct scenario.
- Withdraw, swap, transfer, and deposit use actual prior-step amounts.
- Total global value never counts source cash and the same in-transit/destination amount together.
- A transfer message produces at most one destination credit.
- Retry after worker restart cannot repeat a debit, receipt application, or Merkle sequence.
- Arc native and ERC-20 USDC views are not added together.
- Integer conversions preserve declared rounding and cannot create dust gains.
- Reference portfolios begin with exactly the same capital and distribution as the agent scenario.
- The dashboard/API result matches the canonical backend projection.

Use property-based tests for conservation and arbitrary step sequences where practical.

## Required behavior cases

- Yield accrues correctly between checkpoints and while the agent is inactive.
- Approval is charged only when needed; rejection before attempt costs no gas; a failed attempted transaction may cost gas.
- Exact-amount quote includes impact/fee once; slippage tolerance is enforced as a guard.
- Successful withdrawal followed by failed swap leaves cash and costs intact; dependent deposit does not run.
- Failed source transfer releases reservation minus costs.
- Burn/virtual debit followed by delayed attestation retains one unavailable receivable.
- Destination receipt retry reuses the same message and charges only defined retry cost.
- Closure with capital in transit retains the end-date state and does not grant later yield retroactively.
- Stale or absent data suspends/expires/unassesses according to policy; it never selects a favorable fallback price.
- Impossible withdrawal exposes blocked liquidity and does not claim full liquidation value.
- Unavailable conservative reference suspends that comparison without post-hoc replacement.
- Testnet, replay, synthetic, and mixed profiles fail the real-capital eligibility gate.
- Disabled/missing statistical method cannot yield `ELIGIBLE_UNDER_POLICY`.
- A correction preserves the old report and creates a superseding result.

## Signature, API, and concurrency tests

Test invalid domain, wrong policy/profile/scenario, revoked key, altered allocation, expired request, used nonce with different content, exact idempotent repeat, stale portfolio version, concurrent action, quota boundary, and payload abuse. Crash or restart between every durable boundary around acceptance and receipt application.

## Commitment tests

- Canonical serialization produces stable hashes across supported runtimes.
- Inclusion proofs pass for valid leaves and fail after any field modification.
- Sequence gaps, overlaps, wrong previous root, or duplicate finalization are detected.
- Periodic mode is labeled accurately and never presented as pre-execution proof.
- Export includes the schemas, raw-input hashes/data, versions, events, receipts, checkpoints, and proofs required for replay.

## Integration acceptance gates

Before the cross-chain demo:

- verify exact testnet manifests and environment separation;
- execute and record CCTP in both directions;
- demonstrate destination gas funding without free bankroll;
- deposit and withdraw test USDC from the Arc test vault;
- prove idempotent message tracking and retry behavior;
- document finite test-yield provenance;
- test Arc unit/decimal normalization.

Before a global mainnet-forward profile:

- verify current Arc mainnet availability and exact contracts;
- validate usable market liquidity and exits;
- validate CCTP both directions and all costs;
- verify required current/historical data sources;
- repeat adapter and fork tests in the exact environment;
- create and approve a new profile/manifest before a new `X`.

## Hackathon demonstration

The demo should make the trust boundary and economic consequence visible:

1. Show the mandate, declared version, network/evidence profile, two references, and three capital sizes before locking.
2. Commit and start the configuration.
3. Have the external agent read portfolios and submit a signed intent.
4. Display the deterministic plan and the future execution rule.
5. Show a flow containing a withdrawal, swap, transfer, capital-in-transit state, settlement, and Arc deposit.
6. Display net portfolio and reference results at the same checkpoint, including fees and liquidity.
7. Show different decisions/results for other sizes without pretending they are independent samples.
8. Explain compliance, economic, statistical, and overall statuses, including `INSUFFICIENT_EVIDENCE` if applicable.
9. Verify Merkle inclusion and download/replay the export.

Use actual test-token transfers for integration proof and separate Ethereum mainnet forward shadow evidence for economics. A labeled replay may compress time for presentation, but must not extend the prospective track record.
