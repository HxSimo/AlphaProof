---
name: proof-of-alpha
description: Design, implement, review, test, and document the Proof of Alpha protocol and its ETHGlobal MVP. Use for work on its stablecoin-treasury mandate, prospective shadow evaluation, multi-capital accounting, Ethereum/Arc integrations, signed intents, audit commitments, eligibility, or hackathon demo. Do not use for unrelated DeFi agents or generic trading advice.
---

# Proof of Alpha

Build Proof of Alpha as a prospective evaluation protocol for self-hosted financial agents. The first mandate is stablecoin treasury management on Ethereum and Arc. The agent submits signed allocation intents; the platform simulates their future consequences with real market data and virtual capital, then publishes auditable results. The MVP evaluates but never automatically funds an agent.

## Start every task correctly

1. Read [references/project-charter.md](references/project-charter.md).
2. Classify the task using the routing table below and read every listed reference before proposing or changing code.
3. Inspect the repository, existing tests, active profile manifests, decision records, and current implementation status. Do not assume the proposed v0.3 repository already exists.
4. State which requirements are `LOCKED`, `PROPOSED`, `TO_VERIFY`, or `POST_MVP`. Never silently promote a proposal or external dependency to a verified fact.
5. Prefer the smallest end-to-end slice that preserves accounting, provenance, and replayability. Do not build disconnected sponsor demos.

When a task spans the whole system, read all focused references. Consult [references/source-specification-v0.3.md](references/source-specification-v0.3.md) when a detail is disputed, a requirement is absent from the focused references, or the task changes product scope.

## Task routing

| Work | Required references |
| --- | --- |
| Product definition, scope, requirements, pitch | [project charter](references/project-charter.md), [delivery plan](references/delivery-plan.md) |
| System architecture, repository, domain model, persistence | [architecture and domain](references/architecture-and-domain.md), [trust and provenance](references/trust-provenance-and-profiles.md) |
| Accounting, planner, simulator, portfolios, valuation, transfers | [economic engine](references/economic-engine.md), [integrations](references/integrations.md), [testing](references/testing-and-acceptance.md) |
| API, external agent SDK, authentication, EIP-712 | [API and signing](references/api-and-signing.md), [trust and provenance](references/trust-provenance-and-profiles.md), [architecture and domain](references/architecture-and-domain.md) |
| Solidity registry, Merkle commitments, proofs | [trust and provenance](references/trust-provenance-and-profiles.md), [architecture and domain](references/architecture-and-domain.md), [testing](references/testing-and-acceptance.md) |
| Aave, vault, swap, Arc, CCTP, The Graph, RPC/data work | [integrations](references/integrations.md), [economic engine](references/economic-engine.md), [testing](references/testing-and-acceptance.md) |
| Metrics, risk, references, eligibility, statistics | [evaluation and statistics](references/evaluation-and-statistics.md), [economic engine](references/economic-engine.md), [trust and provenance](references/trust-provenance-and-profiles.md) |
| Tests, review, incident handling, reproduction | [testing and acceptance](references/testing-and-acceptance.md) plus the reference for the component under test |
| Hackathon plan, prioritization, demo, jury response | [delivery plan](references/delivery-plan.md), [testing](references/testing-and-acceptance.md), [project charter](references/project-charter.md) |

## Non-negotiable invariants

- Agents remain self-hosted. The service receives signed intents, not agent code, prompts, private keys, or model execution.
- An experiment freezes its policy before `X`. A material rule, address, engine, adapter, or strategy-version change opens a new experiment or a versioned correction; it never rewrites history.
- The canonical action time is durable server receipt. A client timestamp cannot backdate execution.
- Market consequences must occur after receipt under a predeclared latency/block rule. No favorable retrospective price selection.
- The 1,000, 10,000, and 100,000 USDC scenarios are independent global treasuries. Capital is not duplicated between Ethereum, Arc, or scenarios.
- Cash, invested positions, reservations, and in-transit receivables are mutually consistent states. A transfer creates one unavailable receivable and exactly one destination credit.
- All applicable economic costs are charged once: approvals, gas by chain, failed attempts, protocol fees, swap impact, transfer/relayer fees, and exit costs when the policy incurs them.
- Use integer minimum units, explicit decimal scales, deterministic rounding, and basis-point weights summing to 10,000. Never use JavaScript `number` for canonical balances.
- Preserve partial successes. If withdrawal succeeds and a later swap or deposit fails, funds stay in the resulting cash state and incurred costs remain.
- `markValue` and estimated `liquidationValue` are distinct. Missing or stale data never becomes a zero cost, zero risk, or fresh valuation.
- The only fixed comparison portfolios are USDC cash and one conservative passive yield instrument chosen before `X`, under consistent initial distribution and cost conventions.
- Compliance, observed economics, and statistical evidence are separate outputs. Testnet, synthetic, replay, and mixed data cannot produce real-capital eligibility.
- Blockchain commitments prove integrity after anchoring. Periodic post-execution anchoring does not independently prove the server receipt existed before execution.
- Append corrections and superseding results; do not delete unfavorable actions, incidents, losses, or earlier reports.
- Deterministic policies and LLM-based agents are equally valid subjects. Do not add AI, chains, tokens, or sponsor integrations without a product need.

## Implementation behavior

- Establish domain rules and executable invariants before UI polish.
- Keep adapters responsible for protocol mechanics, not eligibility decisions.
- Keep the dashboard read-only over canonical backend results; do not duplicate accounting in the browser.
- Archive every external input needed to replay a receipt, including quote payloads and version identifiers. A block number alone is insufficient for ephemeral external data.
- Treat idempotency, retries, worker restarts, reorgs, stale data, and partial execution as first-class paths.
- Resolve instrument addresses, domains, supported routes, fee behavior, liquidity, and data availability from current official sources before activation. Store the verified values in versioned manifests; do not hardcode values copied from the specification as current truth.
- Use the templates in `assets/templates/` when creating profiles, network manifests, instrument fact sheets, decision records, or project-state tracking.

## Planning and review standard

For an implementation request, produce or update a plan whose items each have an observable completion condition. Track dependencies and identify the critical demo path. Implement and verify the requested slice when authorized; do not stop at architecture prose.

For a design or review request, challenge unsupported claims concretely. Flag especially:

- capital duplication or free relayer/gas assumptions;
- mixing Ethereum mainnet evidence with Arc testnet economics;
- pretend execution capacity for virtual positions;
- double-counted fees or yield;
- hidden policy changes or cherry-picked statistical windows;
- unverified contract addresses or route availability;
- claims that a Merkle root proves runtime immutability or economic correctness.

End broad work with: decisions made, unresolved verifications, tests/evidence produced, and the next smallest credible milestone.
