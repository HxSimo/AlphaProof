# M5 Sepolia ↔ Arc Testnet lifecycle gate

This runbook is the only path that can satisfy the live M5 exit criteria. Unit, database, replay and local Foundry passes do not complete M5.

## Frozen implementation

- Route: CCTP V2 Standard USDC, Sepolia domain `0` and Arc Testnet domain `26`.
- Chains: Sepolia `11155111`; Arc Testnet `5042002`.
- USDC: Sepolia `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`; Arc Testnet `0x3600000000000000000000000000000000000000`; both ERC-20 views use 6 decimals.
- CCTP V2 TokenMessenger: `0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa` on both testnets.
- CCTP V2 MessageTransmitter: `0xe737e5cebeeba77efe34d4aa090756590b1ce275` on both testnets.
- Attestation API: `https://iris-api-sandbox.circle.com/v2/messages/{sourceDomain}?transactionHash=...`.
- Standard threshold: `2000`. The runner queries and archives the current fee response before either burn and stops unless the parsed Standard minimum fee is supported by this version.
- Vault: repository `FiniteYieldVault` bytecode, freshly deployed on each network. The finite test-USDC schedule is funded and frozen before the declared experiment start.

Official sources reviewed on 2026-09-09: [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [CCTP domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains), [CCTP contracts](https://developers.circle.com/cctp/references/contract-addresses), [CCTP interfaces](https://developers.circle.com/cctp/references/contract-interfaces), [CCTP fees](https://developers.circle.com/cctp/concepts/fees), [Circle Ethereum-to-Arc quickstart](https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc), and [Arc connection data](https://docs.arc.io/integrate/connect-to-arc).

## Prerequisites

Use dedicated disposable testnet accounts. Fund the deployer with Sepolia ETH and faucet USDC. Fund the relayer with Sepolia ETH and Arc native USDC. The outbound transfer must leave enough Arc USDC for the Arc yield budget, vault round trip, return burn and deployer gas. Relayer funding remains outside the evaluated bankroll.

Choose an experiment-start Unix epoch at least three hours in the future. The runner refuses a late schedule. Do not put keys or provider URLs in Git.

```bash
cp .env.example .env
forge build --root contracts
```

Set these values in the local `.env`:

```text
ETHEREUM_SEPOLIA_RPC_URL=<archive-capable Sepolia RPC>
ARC_TESTNET_RPC_URL=<archive-capable Arc Testnet RPC>
POA_TESTNET_DEPLOYER_PRIVATE_KEY=<0x-prefixed disposable key>
POA_TESTNET_RELAYER_PRIVATE_KEY=<0x-prefixed disposable key>
POA_LIVE_EVIDENCE_DIR=.local-evidence/m5-<run-id>
POA_LIVE_OUTBOUND_TRANSFER_AMOUNT_MINOR=20000000
POA_LIVE_RETURN_TRANSFER_AMOUNT_MINOR=10000000
POA_LIVE_VAULT_DEPOSIT_MINOR=1000000
POA_LIVE_YIELD_BUDGET_MINOR=100000
POA_TESTNET_EXPERIMENT_START_EPOCH=<future Unix seconds>
POA_RUN_LIVE_TESTNET=1
```

If a run stops after a finalized outbound burn, resume that exact debit with `POA_LIVE_RESUME_OUTBOUND_BURN_HASH`. The runner fetches and decodes the transaction and rejects any sender, messenger, amount, domain, recipient, token, caller, fee or finality-threshold mismatch before using it. This avoids a second source debit.

Then run:

```bash
pnpm test:live:testnet
```

The process may wait for Sepolia finality and Circle attestation. It must end with `status: PASS`. It verifies matching chain IDs; current contract bytecode and decimals; same-block Arc native/ERC-20 balance normalization; relayer prefunding with zero bankroll credit; both vault deployments, funded schedules and deposit/redeem receipts; current fee responses; both finalized burns, decoded message bindings and mints; exact destination deltas; and finalized reverts for duplicate `receiveMessage` attempts.

## Evidence review and activation

Every payload is stored by keccak256 under `POA_LIVE_EVIDENCE_DIR`. Transaction hashes are archived before receipt waits, included receipts are archived next, and PASS requires a final chain-level finalized-head sweep. Run `pnpm capture:evidence:m5` for pinned historical block/code/decimals reads, then `pnpm test:evidence:m5`; use `--write` with the verifier entry point to regenerate the reviewable index. Preserve the directory in source control or the configured retained object store and prove restore/replay from a fresh process.

Only after that review, create a new manifest version containing the real vault addresses, code hashes, evidence URIs/hashes and observation times. Change the exact Sepolia, Arc cash, two vault and two route gates from `TO_VERIFY` only when every required evidence kind is present. Reseal the configuration, run the entire M5 validation set, and update project state. Never paste a transaction hash or address into the manifest from terminal output without checking its receipt and chain.

With `POA_RUN_LIVE_TESTNET` absent or `0`, the command returns `SKIPPED_TO_VERIFY`. With the gate set but any required variable, balance, bytecode, fee, finality, attestation or reconciliation missing, it fails with a stable `LIVE_*` error. Either result leaves M5 incomplete.
