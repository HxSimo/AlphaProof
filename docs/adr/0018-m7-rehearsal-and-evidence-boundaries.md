# ADR-0018 — Rehearsable sessions and retained evidence

- Status: accepted
- Date: 2026-09-10
- Applies to: M7 synthetic timing, failure diagnostics, full-path exports and presentation

## Decision

The full-path demonstration uses three independent external SDK signatures and a real PostgreSQL durable receive transaction, followed by synthetic economic inputs. The synthetic profile is now version `0.7.0`: one declared Ethereum block offset maps to one synthetic second, and a later action starts after both its receive offset and the preceding receipt offset. This compressed clock is declared before signing. It is not a chain observation or a completed multi-day economic experiment. Earlier profiles, exports and commitments are preserved.

The exact plan is exported and reconstructed from its frozen profile and signed allocation. Initial balances must match the durable pre-action hash; replayed receipts must match the durable final hash and the checkpoint's agent input. Both references are reconstructed from the same initial portfolio and period, then their actual entry consequences must match the evaluated reference inputs. Missing raw inputs, engine-source inventory drift, duplicate scenarios and uncommitted parallel objects fail closed. Source files, package/lockfile versions and the schema catalog travel with the export.

Economic criteria are `UNASSESSABLE` in this shortened session. Operational compliance and `NOT_ASSESSED` statistics remain separate. All synthetic, replay, mixed and testnet data is excluded from real-capital eligibility before criteria. Automatic funding stays disabled.

The two deterministic supplementary diagnostics have separate identities: (1) stress/failure accounting with withdrawal followed by failed swap, delayed transfer, unresolved closure and post-closure settlement; (2) 30 daily August 2026 checkpoints with explicitly authored synthetic indices, losses and both references. The latter is labeled historical replay **with synthetic source provenance**. It represents no observed historical APY and contributes zero forward samples. Three capital sizes remain correlated views with effective sample count one.

An unpublished session export and its later published revision are separate immutable objects. Publication reuses the verified M6 Arc Testnet registry with a publisher distinct from the agent. Only a verified successful receipt, calldata, canonical finalized block, bytecode and registry head create a confirmed publication. A retained transaction is recovered instead of silently republished. The registry remains an integrity anchor after execution, not independent proof of prospective server receipt. Official chain parameters: [Arc connection reference](https://docs.arc.io/arc/references/connect-to-arc), checked 2026-09-10.

## Consequences

The dashboard v2 can show canonical results before publication and clearly display an unavailable anchor; v1 remains exported for old consumers. Incident messages, unavailable reference comparisons and operations status come from canonical API objects. No browser accounting is introduced. Retained exports can be replayed without credentials; live re-verification has an explicit separate gate. A fallback retains original source dates and provenance. A fresh Ethereum forward session remains **TO_VERIFY** until every existing Ethereum gate is satisfied; neither the rehearsal nor a testnet publication activates it.

A final optional `forge fmt --check` exposed pre-existing formatting differences in the exact M6 registry source/test revision. The Foundry formatter excludes those two named frozen files; the exception is explicit in `contracts/foundry.toml`. Their bytes remain unchanged, all registry tests still run, and new Solidity/M5 vault formatting stays checked. Reformatting that preserved revision would alter the source evidence solely for style. This is a formatting exception, not a skipped compilation, invariant or live receipt test.
