# ADR-0017 — Bounded operations and durable recovery

- Status: accepted
- Date: 2026-09-10
- Applies to: M7 API, queue, operational monitoring and incident history

## Decision

Economic invariants, prospective receive time, provenance exclusion, frozen references and disabled funding remain **LOCKED**. `config/operations-v1.json` introduces **PROPOSED** operational defaults: 120 ingress requests per client per 60 seconds, ten active agents, one active experiment per agent/profile, 90-second heartbeat freshness and 120-second queue-lag alerting. These are demonstration capacity limits, not empirically calibrated financial capacity. The API returns their canonical hash with each operational snapshot.

Ingress windows use atomic PostgreSQL updates and the database clock. Direct peer IPs are hashed; forwarded headers are not trusted. Malformed and duplicate traffic consumes ingress capacity without creating an economic event. Accepted-intent quotas are read from each experiment's immutable profile snapshot. Changing runtime configuration cannot revise a started experiment. Legacy profiles may only be recovered if their exact frozen hash still matches.

Agent/version registration, lifecycle writes and incident reporting require a separate operator bearer secret of at least 32 characters in the running API. Signed action submission retains EIP-712 authentication. The SDK only sends the optional operator credential to control routes. No operator or publisher credential goes in browser code or agent signatures.

Worker interruptions append immutable incidents, atomically with retry decisions. Successful receipts retain their identity and costs. A restart may complete an already begun action after its start deadline, but may not start an expired action. Reclaimed leases cannot exceed the original attempt bound. Terminal actions accept byte-identical receipt replay only; they cannot gain new financial effects. Repeated completion does not duplicate the terminal journal event. Exact duplicate signed submissions recover the original acknowledgment even after stop or expiry.

An operator stop locks the experiment and scenario states, rejects pending financial work, records the exact portfolio hashes, and appends a stop incident. It never force-rolls back a transfer or edits balances. Incident resolutions append a new same-experiment record; the original error stays visible and committed.

## Limitations

Operational health is separate from economic/statistical eligibility. Heartbeats and rate windows are operational tables, not append-only financial journals. API ingress identity is the immediate peer: a reverse proxy shares one quota until an explicitly trusted proxy configuration is reviewed. There is no automatic ban, restart funding, failover pricing or inference from a timer to blockchain settlement. Production authentication rotation, hosting and S3 retention are operator deployment work; local controls are not a claim of public production deployment.
