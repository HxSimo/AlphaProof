# Exact continuation prompt for M1

```text
Use $proof-of-alpha at .agents/skills/proof-of-alpha/SKILL.md as the authoritative workflow and project context. Continue from the verified M0 foundation. Inspect Git status and preserve all existing changes, then read docs/project-state.md, the accepted ADRs, docs/milestones.json and all skill references required for accounting work. Run pnpm plan M1.

Your objective is M1 only: implement the deterministic accounting kernel, including one global treasury per independent capital scenario; integer amounts and explicit rounding with retained remainders; cash, reservations, positions, allowances, fees/payables and in-transit receivables; stable operation identities and idempotent receipt application; the CCTP economic lifecycle; and distinct mark/liquidation contracts.

Prove conservation and exactly-once economic effects under success, rejection before attempt, failed attempts, partial success, duplicate delivery, transfer delays/retries, settlement and serialize/reload at every boundary. Test Arc native/ERC-20 aliasing, the three independent capital sizes, insufficient cash, stale/missing valuation data and closure with capital in transit. Use deterministic synthetic fixtures and property tests; do not activate external adapters or invent live evidence.

Complete M1's observable exit criteria. Update canonical schemas and replay fixtures, run all relevant validation and fix failures, maintain docs/project-state.md, record material decisions as ADRs, and make a focused verified M1 commit. Do not begin M2. Finish with the exact continuation prompt for M2.
```
