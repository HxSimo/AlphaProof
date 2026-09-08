# Architecture and domain boundaries

## MVP deployment shape

Start with a pnpm TypeScript monorepo and four operational units:

- `web`: Next.js/React configuration, reports, proofs, and exports.
- `api`: authentication, registries, policy locking, reads, action receipt, validation, and journal writes.
- `worker`: market capture, planning, simulation, CCTP tracking, valuation, evaluation, and commitment publication as separate job types.
- PostgreSQL: canonical operational state, append-oriented events, projections, and a database-backed job queue.

Use S3-compatible object storage for raw external responses, reports, Merkle leaves, and exports. Do not add Redis, Kafka, a time-series database, a workflow cluster, or separately deployed microservices unless measured load or isolation requirements justify them.

## Suggested repository

```text
apps/
  web/
  api/
  worker/
packages/
  domain/
  schemas/
  sdk/
  accounting/
  experiments/
  market-data/
  execution/
  valuation/
  evaluation/
  commitments/
  adapters/
contracts/
  src/
  test/
  script/
examples/
  self-hosted-treasury-agent/
tests/
  accounting-fixtures/
  adapter-fork-cases/
  replay-cases/
  end-to-end/
docs/
  experiment-policy/
  instrument-catalog/
  execution-assumptions/
  api/
```

Keep this proportional. Merge empty packages until real boundaries exist; do not create placeholders merely to match the diagram.

## Dependency rules

- `domain` and `schemas` define canonical identifiers, enums, amounts, events, and serializations.
- `accounting` is deterministic and independent of web/UI concerns.
- `adapters` translate external protocol state and mechanics into common operations; they do not decide eligibility.
- `execution` owns target-allocation planning and step orchestration.
- `valuation` consumes portfolio state and adapter valuations without mutating accounting.
- `evaluation` consumes canonical checkpoints, references, provenance, and profile criteria.
- `commitments` canonicalizes events, hashes leaves, creates batches, and verifies proofs.
- `sdk` signs and submits intents but contains no mandatory strategy.
- `web` renders canonical API output and never reimplements portfolio arithmetic.

Avoid circular package dependencies. Keep blockchain/RPC clients at adapter and publisher boundaries, not in domain entities.

## Core objects

| Object | Purpose |
| --- | --- |
| `AgentVersion` | Declared identity, decision keys, hashes, provenance |
| `ExperimentPolicy` | Immutable versioned mandate, profile, rules, limits, and deadline |
| `CapitalScenario` | One independent global treasury at a tested initial amount |
| `ActionIntent` | Signed target allocation for one scenario and portfolio version |
| `ExecutionPlan` | Deterministically derived dependency-ordered operations |
| `ExecutionReceipt` | Per-step result, costs, input hashes, and final state |
| `TransferIntent` | Planned USDC movement with route and cost bounds |
| `TransferReceipt` | Persisted transfer lifecycle and settlement evidence |
| `ValuationCheckpoint` | Mark/liquidation values, availability, positions, and data quality |
| `EvaluationReceipt` | Metrics and separate compliance/economic/statistical statuses |
| `CommitmentBatch` | Ordered leaf range, root, previous batch, and publication state |

## Persistence model

Expected tables include agents, agent_versions, profiles, experiments, capital_scenarios, instruments, portfolios, positions, action_intents, execution_plans, execution_receipts, valuation_checkpoints, reference_portfolios, evaluations, commitment_batches, incidents, chain_balances, transfer_intents, transfer_receipts, transfer_events, and reserved_balances.

Use database transactions and uniqueness constraints for:

- action acceptance plus durable journal insertion;
- nonce scope and idempotency key uniqueness;
- one active intent per scenario;
- one application of an operation receipt;
- one destination credit per transfer message;
- monotonic portfolio versions and experiment event sequences;
- one finalized commitment range.

Events are the audit history; portfolios and metrics are rebuildable projections. Administrative database access is not cryptographic immutability, so commitments and retained client acknowledgments complement the journal.

## Market data boundary

Archive provenance, requested/observed time, chain, block number and hash, source, freshness, raw response hash, normalized representation, and parser/adapter version. Share chain snapshots across scenarios when identical; keep amount-dependent quotes distinct.

The Graph can provide indexed history and analysis, but a lagging index cannot substitute for the execution-critical state or quote required by policy. Preserve exact responsibilities per source.

## Worker model

Use persisted jobs and resumable state machines rather than blocking a process for CCTP settlement. Every job must be safe after duplicate delivery or restart. Separate task types and concurrency limits inside the worker first; split processes only for observed failure or scaling needs.

## Security boundaries

The service holds its publication key, not the agent decision key. Authenticate public APIs, validate schemas strictly, bind signatures to experiment/policy/scenario, rate-limit accepted and malformed traffic separately, and log abusive anonymous requests outside the economic track record. Keep mainnet/testnet RPCs, contracts, keys, and CCTP endpoints separated by profile.
