# Delivery plan and project management

## Working method

Maintain a project-state document with: current milestone, implemented capabilities, failing tests, verified integrations, `TO_VERIFY` dependencies, active risks, decisions/ADRs, and next demoable slice. Do not mark a component complete because interfaces exist; require an observable behavior and test.

Prefer vertical slices through domain, persistence, API/worker, and report output. The critical path is the transformation of one signed future intent into a reproducible economic receipt, not the number of integrations or UI screens.

## Milestones

### M0 — Environment and decision freeze

Deliver repository/toolchain and CI, active profile/network manifests, instrument fact sheets, canonical schemas, scope cuts, and the demo data/provenance plan.

Exit when every required adapter has either a verified target or a disabled `TO_VERIFY` gate, and no mainnet/testnet combination is ambiguous.

### M1 — Deterministic accounting kernel

Deliver global portfolios, cash/reservation/receivable states, integer units and rounding, operation receipts, the CCTP lifecycle, mark/liquidation contracts, and pure invariants/property tests.

Exit when fixtures preserve value and fees under success, partial failure, retry, and restart sequences.

### M2 — First local economic slice

Deliver one verified Ethereum path, ideally cash → lending/vault → cash, plus amount-specific quote/snapshot archival. Add the single USDC/USDT swap path after direct deposits work.

Exit when a fixed-block fork or captured fixture matches contract mechanics and can be replayed from archived inputs.

### M3 — Experiment, API, and external agent

Deliver agent/version registry, immutable experiment start and policy hash, EIP-712 and injected-signer SDK, atomic receipt/nonces/idempotency/concurrency, planner/worker, and a small external example agent.

Exit when a real SDK-signed request survives duplicate submission and worker restart without duplicated effects.

### M4 — Multi-capital and references

Deliver three independent scenario streams and two reference portfolios per scenario, using shared observations but distinct amount-dependent quotes/costs. Add checkpoints and descriptive metrics.

Exit when global capital is never duplicated and each size produces independently replayable receipts and comparisons.

### M5 — Arc and CCTP technical lifecycle

Deliver Sepolia ↔ Arc Testnet transfers both ways, destination-funding convention, Arc test-vault deposit/withdrawal, transfer worker, incidents, and a shadow model with explicit calibration/provenance.

Exit only after actual test-token transactions and idempotent settlement tests. Do not call this economic mainnet validation.

### M6 — Evaluation, commitments, export, and UI

Deliver separate status dimensions, provenance eligibility gate, Merkle registry, proof verification, versioned report/export, and a dashboard that narrates the critical path.

Exit when another process can replay a selected receipt from the export and verify its committed leaf.

### M7 — Demo hardening

Prepare deterministic failure fixtures, a labeled longer replay, a fresh forward session, monitoring, rate limits, runbook, and a timed demo. Capture evidence rather than relying on live network luck.

## Scope priority

Protect in this order:

1. Correct prospective receipt and no capital duplication.
2. Signed external-agent flow and locked policy.
3. Costs, partial failure, replay, and provenance.
4. Three capital sizes and two references.
5. Arc/CCTP lifecycle and Arc DeFi use.
6. Commitments, export, and proof verification.
7. Additional vaults, richer statistics, onboarding, and visual polish.

If time is short, reduce equivalent instruments and UI depth before weakening accounting or evidence labels. One lending integration, one vault family, one swap route, one Arc test vault, and one transfer adapter can be a credible MVP if all are honest and end to end.

## Decision discipline

Create an ADR when changing mandate, network profile, initial distribution, execution timing, cost convention, transfer mode, valuation basis, statistical method, or trust claim. Record context, options, decision, consequences, status, and superseded ADR. Profile changes apply only to future experiments.

For each external integration, maintain a verification checklist with source links, date checked, exact environment/address, on-chain code/hash where relevant, data limitations, and test evidence.

## Definition of done for any task

- Behavior is tied to a locked/proposed requirement.
- Canonical schemas and versioning are updated.
- Happy path, boundary, failure, retry/idempotency, and provenance tests exist where relevant.
- Raw external inputs needed for replay are archived or fixture-backed.
- No new assumption is presented as verified.
- User-visible language matches the actual trust and evidence level.
- Project state, decision record, and demo impact are updated.
