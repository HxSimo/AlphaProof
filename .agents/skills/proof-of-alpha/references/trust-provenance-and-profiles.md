# Trust, provenance, and network profiles

## Frozen at experiment start

The canonical configuration hash covers agent identity and declared version, mandate, network profile, instrument allowlist, initial global capital and chain distribution, both reference policies, planner/execution/valuation rules, transfer policy, risk limits, statistical policy, deadline, adapter and engine versions, and commitment mode. Variable fees and market states are not frozen; their capture method is.

A change to any material rule, address, route, engine, or adapter after `X` requires a new experiment or an explicit correction event and superseding result. Do not mutate the active policy.

## Guaranteed and not guaranteed

| Dimension | MVP statement |
| --- | --- |
| Agent identity | The action signature matches an authorized decision key |
| Runtime | `SELF_REPORTED`; the service cannot prove the declared code ran |
| Receipt | Durable server receipt time and sequence |
| Prospective execution | Economic execution point selected after receipt by the locked rule |
| Integrity | Content can be checked against a published commitment after anchoring |
| Public prior existence | Only strengthened by the optional pre-execution anchoring mode |
| Calculation | Reproducible from archived inputs, schemas, and engine versions |
| Economic realism | Bounded to supported adapters and disclosed assumptions |
| Future returns | Never guaranteed |

The creator may declare code, prompt, model, parameter, memory, and data hashes. These hashes do not attest what ran on the creator's machine. Human intervention and hidden strategy changes remain limitations.

## Result provenance

Keep provenance as a mandatory field on experiments, receipts, checkpoints, reports, and UI views.

| Provenance | Use | Eligibility |
| --- | --- | --- |
| `FORWARD_SHADOW` on validated mainnet data | Observe new signed decisions prospectively | May be assessed under the active policy |
| `HISTORICAL_REPLAY` | Validate engine and demonstrate longer flows | Excluded |
| `SYNTHETIC_TEST` | Exercise failures, stress, and interfaces | Excluded |
| `LIVE_SEPARATE` | Optional real transaction compared with simulation | Separate history |
| `CROSS_CHAIN_TESTNET` | Prove integration lifecycle | Excluded |
| `MIXED_DIAGNOSTIC` | Combine incompatible environments for diagnostics | Excluded as a whole |

Never splice provenance classes into one series. If an Ethereum decision was influenced by artificial Arc test yield, its result cannot be carved out later as clean Ethereum evidence.

## Network profile validation

Every asset and operation is scoped by environment, chain ID, asset contract, and for CCTP, domain. CCTP domain IDs are not EVM chain IDs. Reject incompatible mainnet/testnet combinations before planning. Retain a block reference per chain; Ethereum and Arc block numbers are never compared directly.

`CROSS_CHAIN_MAINNET_FORWARD` stays disabled until current official evidence verifies both directions of the route, usable Arc markets, exact contracts, liquidity, withdrawal behavior, fees, gas funding, and required data.

## Commitment modes

### Periodic anchoring — MVP default

Receive and durably store the intent, execute later under the policy, then include the event in a periodic Merkle batch. The proof establishes inclusion in the batch and detects later modification. It does not independently prove that the server timestamp preceded execution.

### Pre-execution anchoring — optional

Publish and confirm the intent commitment before choosing the future economic execution point under a deterministic cross-chain rule. Count publication latency in the experiment. Deadline failure causes expiry, never a favorable alternate price.

The chosen mode is locked before `X`.

## Merkle and registry requirements

- Leaf: object type, schema version, experiment ID, monotonic sequence, and canonical content hash.
- Batch: root, sequence range, previous-batch reference, publication status, and chain transaction.
- Verify inclusion and batch continuity; inclusion alone does not prove no batch or decision was omitted.
- Keep full data exportable. A hash without available source data is not reproducibility.
- Do not overwrite earlier commitments. Revocation and correction are new events.
- A simple MVP contract may combine agent, experiment, commitment, and evaluation registries, provided roles and publication powers remain explicit.

## Corrections and incidents

The application journal is append-only in normal operation. Derived projections are rebuildable. A calculation bug creates a correction event, new engine/result version, link to the superseded result, and suspension or invalidation of affected eligibility. Preserve the old report.

Record outages, stale data, reorgs, unavailable references, blocked withdrawals, delayed attestations, receipt retries, and early stops. Missing data cannot be silently dropped, and an unfavorable interval cannot be removed.

Use `STOPPED_EARLY` when the creator ends an experiment before the locked deadline. A positive early return is not a completed evaluation.
