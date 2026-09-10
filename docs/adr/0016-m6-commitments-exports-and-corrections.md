# ADR-0016 — Ordered commitments, reproducible exports and corrections

- Status: accepted
- Date: 2026-09-10
- Applies to: M6 eligibility reports, audit events, Merkle batches, Arc publication and replay exports

## Context

An inclusion proof alone cannot show that every experiment event was committed, and an Arc transaction cannot establish that the service received an intent before execution when publication occurs later. Reports also need corrections without erasing the result that was originally shown or anchored.

## Decision

Every canonical report object is appended to an experiment-scoped audit chain with a decimal sequence and the prior event hash. Leaves use canonical JSON and the `PROOF_OF_ALPHA_AUDIT_LEAF_V1` domain. Internal nodes hash the fixed `PROOF_OF_ALPHA_MERKLE_NODE_V1` domain, left child and right child; an odd final node duplicates itself. Batches cover contiguous, non-overlapping sequence ranges and bind the prior batch hash, content-addressed leaf-set hash and `PROOF_OF_ALPHA_COMMITMENT_BATCH_V1` domain.

`ProofOfAlphaRegistry` stores one append-only head per experiment hash. A separate owner grants and revokes publisher accounts. Publication requires the exact next sequence, predecessor and caller-supplied batch hash. The TypeScript verifier reconstructs every audit event, leaf, batch, proof and registry receipt; it rejects missing objects, gaps, overlaps, version drift, provenance splicing, wrong predecessors, unbound receipts and reorged publications.

Exports include the schema catalog, frozen policy/configuration/profile/adapter/parser objects, signed bytes, raw input descriptor and payload, receipts, checkpoint, evaluations, audit chain, leaves, all proofs and publication receipts. A fresh process must recompute the selected canonical evaluation receipt and its full proof chain.

Corrections append a new report and event with `supersedesHash`; old rows, exports, roots and receipts remain immutable. M6 demonstrates this by retaining the first 1–15 batch and publishing a sequence-16 correction whose predecessor is the first batch hash.

## Consequences

The Arc Testnet deployment and two finalized publications establish integrity from their anchor blocks. They do not independently prove server receipt existed before execution, and the committed fixture remains `SYNTHETIC_TEST`, so it cannot become real-capital eligible. Local content-addressed evidence is retained in Git; production S3-compatible retention and restore remain `TO_VERIFY`, leaving every external profile disabled.
