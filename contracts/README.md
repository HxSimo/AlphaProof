# Contract boundary

M5 implements `FiniteYieldVault`, a test-only synchronous ERC-4626-compatible USDC vault, plus `TestUSDC` for local Foundry tests. The immutable schedule owner can fund and freeze one finite yield budget before its start. Unvested tokens do not enter `totalAssets`; deposits/redeems round down and mint/withdraw obligations round up. Foundry covers all three capital sizes, schedule immutability, linear vesting, round trips and boundary rounding.

No testnet deployment is claimed. `config/v1/instruments.json` retains null vault addresses and disabled `TO_VERIFY` gates until the credentialed M5 runbook produces and verifies real deployment, bytecode, schedule-funding and deposit/withdraw receipts on Sepolia and Arc Testnet.

M6 implements the separate Arc testnet registry, explicit publisher roles, append-only roots, sequence continuity and proof verification.

No script should broadcast with a mainnet key. Deployments need exact versioned manifest entries and retained receipts. Local/testnet contract evidence never supplies economic forward history.
