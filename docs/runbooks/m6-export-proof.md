# M6 Arc registry, export and proof runbook

M6 publishes a testnet integrity demonstration and a synthetic replay fixture. It never activates real-capital eligibility or automatic funding.

## Retained deployment and publications

- Arc Testnet chain ID: `5042002`.
- Registry: `0xc391ad7e4826a2c1ecc56e845098b8c1b580eebd`.
- Runtime code hash: `0x673c72cbffbf8f0ea9b0e8bbbf806e2a881455e6abb5193f813cf1ded13d8b62`.
- Deployment transaction: `0xc21d3035148ac4bcc91632cb7f6cee8a82fdb91c3ca8cab326600e7f4b0964b6`, block `61348428`.
- First publication, sequences 1–15: `0x67d9f997398ad3cfc21050a7ac7bb02c0f2ff5c67c0f8bf64b931298af68f470`, block `61348430`, root `0x3330adaf835a2eeb2b713fcdb55d27aea3485d1ee8e7b362565ae1ac1be23e75`.
- Append-only correction, sequence 16: `0xea2936138e4d8ced9e6408ec0585d9201c07a6156bff1d44db1e4cf18d2475f4`, block `61351339`, root `0xb2e9eb40475883cf844b1eb11999719e613b71d6592b5dd30f07cc831aa7d8b7`.

The current evidence is [m6-registry-publication.json](../evidence/m6-registry-publication.json). The original publication and export remain in `m6-registry-publication-v1.json` and `m6-demo-export-v1.json`. The current replay bundle is [m6-demo-export.json](../evidence/m6-demo-export.json). Its export hash is `0xd9c7c621451a2fca22ae37249be9d4ffdf938b6de0d201e0f4e638fda9d99fe7`.

## Independent verification

Set only the Arc RPC URL; the verifier is read-only and does not need a private key.

```bash
ARC_TESTNET_RPC_URL=<archive-capable-rpc> \
POA_RUN_LIVE_M6_VERIFY=1 \
pnpm test:evidence:m6
pnpm test:e2e:export-proof
pnpm test:replay
```

The live verifier checks chain ID, finalized canonical block, successful transaction, publisher, registry address and code hash, final head `(lastSequence=16, batchCount=2)`, local content-addressed restore, every export object, batch predecessor, proof and selected result. The end-to-end command starts a fresh Node process, parses the exported schema/version set, recomputes the selected evaluation receipt and verifies the selected leaf and two-batch chain.

## Reproduction of a new deployment

Use dedicated disposable Arc Testnet owner and publisher accounts. They must differ, and neither is an agent decision key. Build and test before setting the live gate.

```bash
forge build --root contracts
forge test --root contracts
ARC_TESTNET_RPC_URL=<archive-capable-rpc> \
POA_REGISTRY_OWNER_PRIVATE_KEY=<owner-key> \
POA_REGISTRY_PUBLISHER_PRIVATE_KEY=<publisher-key> \
POA_RUN_LIVE_M6=1 \
pnpm publish:registry:m6
```

If the process stops after broadcasting, resume with both `POA_M6_RESUME_DEPLOYMENT_HASH` and `POA_M6_RESUME_PUBLICATION_HASH`. Do not start another deployment merely because the receipt wait was interrupted. A correction uses `POA_RUN_LIVE_M6_CORRECTION=1 pnpm publish:correction:m6`; if its receipt wait is interrupted, set `POA_M6_CORRECTION_TX_HASH` to the already broadcast transaction.

Review the evidence and only then run `pnpm config:promote:m6`, `pnpm config:seal`, and `pnpm config:validate`. Promotion stays testnet-scoped. A different registry address requires a new versioned manifest and review.

## Dashboard

Apply migrations and start API/web with `POA_DEMO_EXPERIMENT_ID` set to a canonical database experiment that already has three M4 checkpoints, three eligibility reports, a confirmed commitment receipt and proof. The browser fetches `/v1/experiments/:id/dashboard`; it performs no accounting and substitutes no cached result when the API or experiment is absent.

The page labels three capital sizes as correlated views (`n = 1`), shows both references, cash, positions, transit, blocked value, costs, mark/liquidation, drawdown, four separate statuses, evidence, incidents, limitations and the selected proof. Its timing statement is limited to post-publication integrity.

## Remaining external gate

`archive-storage` remains `TO_VERIFY`. To activate it, provision the configured S3-compatible store outside Git, demonstrate create-only writes and hash-checked restore in a fresh process, retain evidence of at least 90 days after closure, add evidence hashes to a new manifest and rerun the full validation. Filesystem fixtures and committed evidence do not prove that production retention policy.
