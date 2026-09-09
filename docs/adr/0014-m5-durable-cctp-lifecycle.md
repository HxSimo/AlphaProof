# ADR-0014 — Durable CCTP evidence and recovery

- Status: `ACCEPTED`
- Date: 2026-09-09
- Applies to: CCTP route and transfer version 1.0.0
- Supersedes: none

## Context

CCTP spans a source transaction, source finality, Circle attestation and a separate destination transaction. Process loss, an unavailable attestation, a reverted receipt, repeated delivery and reorg evidence must not duplicate capital or erase costs.

## Decision

A transfer has one frozen route, reservation, message identity, retry bound and provenance. Append-only events advance a contiguous sequence. A live burn or destination credit requires a successful finalized chain receipt; attestation readiness requires archived attestation bytes. Synthetic events are forbidden from carrying transaction or attestation evidence. The durable worker polls through retry jobs and never treats elapsed time as settlement.

Each event and its M1 accounting receipt commit atomically with the scenario portfolio. Reservation debits available cash once. A confirmed burn replaces the reservation with one unavailable net receivable. A failed destination attempt retains that receivable and records its actual gas or relayer payable once. Only a finalized destination receipt can remove the receivable and credit destination cash. Exact duplicate events are no-ops; changed duplicates conflict. Closure stores the unresolved state hash, so a later settlement cannot change the deadline result.

Sepolia and Arc use separate chain IDs, CCTP domains and gas accounting. Arc native and ERC-20 USDC views normalize into one balance family with retained 18-decimal dust. Relayer funding is infrastructure: any charged economic amount is a payable and never a bankroll credit.

## Consequences

The testnet profile remains categorically ineligible for real capital. Current official addresses and route semantics are source reviewed, while activation still requires both live directions, bytecode, current fee responses, finalized burn/mint receipts, a rejected duplicate mint and replayable content-addressed evidence.
