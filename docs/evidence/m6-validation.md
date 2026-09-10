# M6 validation record

- Date: 2026-09-10
- Scope: evaluation status separation, append-only audit/commitment storage, Arc Testnet registry, reproducible export/proof replay, API and read-only dashboard
- Provenance: software tests use `SYNTHETIC_TEST`; registry transactions use `CROSS_CHAIN_TESTNET`; neither is eligible for real capital

## Verified external evidence

The Arc Testnet registry at `0xc391ad7e4826a2c1ecc56e845098b8c1b580eebd` has code hash `0x673c72cbffbf8f0ea9b0e8bbbf806e2a881455e6abb5193f813cf1ded13d8b62`. Deployment transaction `0xc21d3035148ac4bcc91632cb7f6cee8a82fdb91c3ca8cab326600e7f4b0964b6` and both publication transactions are finalized and retained in [the v2 evidence](m6-registry-publication.json).

The current head ends at sequence 16 with two batches. The second transaction is `0xea2936138e4d8ced9e6408ec0585d9201c07a6156bff1d44db1e4cf18d2475f4`; it binds batch hash `0x1b5e6fc1d3a3ffa9c833ebcd916e147c38d25208d405b75d7313bc16f8ea517b`, root `0xb2e9eb40475883cf844b1eb11999719e613b71d6592b5dd30f07cc831aa7d8b7` and predecessor `0xe44d3ccbf191f68a291c6b6e6647f9df7f3871cbc73a6e062f32df45e9a13f5c`. The original report, export, root and receipt remain retained in the v1 evidence files.

`pnpm test:evidence:m6` independently verified the finalized block and receipt, publisher, registry code, head, archive restore and export chain. The retained evidence object hash is `0xa3e51656379f9d1e6b7f06a362e7e3ab7e05eade1532600b7f4c2ecc4ebe4b54`; the current export hash is `0xd9c7c621451a2fca22ae37249be9d4ffdf938b6de0d201e0f4e638fda9d99fe7`.

## Automated validation

- `pnpm check`: formatting, TypeScript, configuration, 116 generated schemas, plan, 120 unit/UI tests and production builds pass.
- `pnpm db:migrate` and `pnpm test:db`: five migrations plus foundation, M3, M4, M5 and M6 database suites pass. M6 covers concurrent idempotency, correction history, ordered batches, proofs, duplicate publication, restart, canonical API/dashboard and append-only triggers.
- `forge test --root contracts -vv`: six tests pass, including registry sequence/predecessor, duplicate/gap/overlap and publisher-role cases.
- `pnpm test:replay`: M2, M4, M5 and retained M6 cross-process replay pass.
- `pnpm test:e2e:export-proof`: a fresh process recomputes the selected corrected evaluation and verifies every object, leaf, proof, receipt and batch link.
- `pnpm smoke`: Docker API, worker, PostgreSQL and web smoke pass.

Production S3-compatible retention remains `TO_VERIFY`; all external profiles remain disabled. Periodic publication proves integrity after the anchor and is not independent proof of prospective server receipt.
