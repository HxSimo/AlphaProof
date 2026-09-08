# API, signed intents, and SDK

## API surface

```http
POST /v1/agents
POST /v1/agents/{agentId}/versions
GET  /v1/profiles
POST /v1/experiments
POST /v1/experiments/{experimentId}/start
GET  /v1/experiments/{experimentId}/policy
GET  /v1/experiments/{experimentId}/instruments
GET  /v1/experiments/{experimentId}/portfolios
POST /v1/experiments/{experimentId}/actions
GET  /v1/experiments/{experimentId}/actions/{actionId}
GET  /v1/experiments/{experimentId}/transfers
GET  /v1/experiments/{experimentId}/transfers/{transferId}
GET  /v1/experiments/{experimentId}/valuations
GET  /v1/experiments/{experimentId}/references
GET  /v1/experiments/{experimentId}/metrics
GET  /v1/experiments/{experimentId}/eligibility
GET  /v1/experiments/{experimentId}/proofs
GET  /v1/experiments/{experimentId}/export
```

Keep mutations narrow and reads explicit. Starting an experiment is distinct from drafting/configuring it. After start, policy-changing endpoints must fail or create a new experiment rather than mutate the locked policy.

## Action intent contract

The canonical signed content includes:

- experiment, scenario, agent, and declared agent-version hash;
- frozen policy hash and transfer-policy hash;
- network profile;
- nonce and validity deadline;
- expected portfolio version;
- target allocation entries containing network and instrument identifiers;
- any signed cost, transfer, or slippage bounds defined by the schema.

Weights are canonical basis points and sum to 10,000. Instrument IDs resolve only through the frozen allowlist. If a target implies moving cash between chains, the planner may derive a transfer only within the signed policy and bounds.

Use EIP-712 structured signing. The domain contains standard fields such as name, version, registry chain ID, and verifying contract. Registry chain identity does not imply the market network, so network profile and instrument networks remain in the message. Define canonical array hashing and serialization in a published schema shared by API and SDK.

## Replay protection and validation order

EIP-712 alone does not stop replay. Perform, at minimum:

1. Parse under strict size and schema limits.
2. Resolve experiment and require the expected lifecycle state.
3. Verify agent version/key authorization and revocation state.
4. Verify domain, typed-data hash, signature, experiment, policy, profile, and scenario binding.
5. Validate nonce scope and idempotency key.
6. Validate `validUntil` against durable receipt and planned-start policy.
7. Compare `expectedPortfolioVersion`.
8. Enforce one in-progress action per scenario.
9. Resolve instruments and validate allocation sum, network/environment, assets, concentration, reserves, transfer exposure, and cost bounds.
10. Atomically write accepted intent, journal event, receipt timestamp, and work item.

Do not insert anonymous malformed traffic into an agent's economic record. Retain authenticated policy rejections when they are relevant to compliance, with quotas preventing record pollution.

## Idempotency semantics

- An exact repeat of an accepted request returns the original `actionId` and status.
- Reusing a nonce for different content returns `NONCE_USED` or an equivalent stable code.
- Stale portfolio version returns `STALE_PORTFOLIO` without creating economic effects.
- A concurrent scenario returns `SCENARIO_BUSY`.
- Acceptance promises durable receipt, not successful execution.
- Technical retries of a persisted operation reuse its financial identity and are not new agent decisions.

Useful stable errors include `SCENARIO_BUSY`, `STALE_PORTFOLIO`, `NONCE_USED`, `EXPIRED`, `INVALID_SIGNATURE`, `POLICY_VIOLATION`, `UNSUPPORTED_INSTRUMENT`, `INSUFFICIENT_AVAILABLE_BALANCE`, `DATA_UNAVAILABLE`, and `QUOTE_UNAVAILABLE`.

## Receipt response

Return `actionId`, `receivedAt`, receipt sequence or block reference, policy hash, portfolio version, status, and stable error/reason codes. Later endpoints expose the derived plan, step receipts, transfer states, archived input hashes, and final portfolio version.

## SDK responsibilities

The TypeScript SDK should:

- fetch policy, instruments, portfolios, and transfer state;
- expose integer-safe amount helpers and canonical allocation builders;
- validate local allocation shape and network scope;
- construct and sign the exact EIP-712 message;
- submit with an idempotency key and handle repeat responses;
- poll or subscribe to action and transfer status;
- verify returned policy/content hashes and optionally Merkle inclusion.

The SDK must never require sending a private key to Proof of Alpha. Support an injected signer interface. Ship one small self-hosted example agent that makes an understandable capital-dependent decision without hiding protocol integration behind an LLM.
