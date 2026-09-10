# Contract boundary

M5 implements `FiniteYieldVault`, a test-only synchronous ERC-4626-compatible USDC vault, plus `TestUSDC` for local Foundry tests. The immutable schedule owner can fund and freeze one finite yield budget before its start. Unvested tokens do not enter `totalAssets`; deposits/redeems round down and mint/withdraw obligations round up. Foundry covers all three capital sizes, schedule immutability, linear vesting, round trips and boundary rounding.

M5 deployed and verified the test vault on Sepolia and Arc Testnet. Exact addresses, bytecode, schedule-funding and deposit/withdraw receipts are retained in `docs/evidence/m5-live-index.json`; they remain testnet-only and cannot support an economic-forward or real-capital claim.

M6 implements `ProofOfAlphaRegistry` with an owner-controlled publisher role,
per-experiment append-only batch heads, contiguous sequence ranges and explicit
predecessor hashes. The on-chain batch hash uses Solidity ABI encoding and a
fixed domain; the TypeScript commitments package computes the same value.
Publication is periodic and post-receipt, so it proves integrity from the Arc
anchor and is not evidence that the server received an intent before execution.
The retained Arc Testnet registry is
`0xc391ad7e4826a2c1ecc56e845098b8c1b580eebd`; deployment and two finalized,
predecessor-linked batch receipts are in
`docs/evidence/m6-registry-publication.json`. The second batch preserves and
supersedes the first synthetic report without rewriting its root.

No script should broadcast with a mainnet key. Deployments need exact versioned manifest entries and retained receipts. Local/testnet contract evidence never supplies economic forward history.
