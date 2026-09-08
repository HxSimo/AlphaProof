# Contract boundary

M0 selects Solidity/Foundry and pins compiler settings. There is no deployed registry or test vault and no Solidity test pass is claimed. Foundry 1.3.5 is available in the development environment; compiler retrieval and execution are verified when the first contract is introduced.

M5 implements the finite-yield ERC-4626 test vault and its Foundry cases. M6 implements the Arc testnet registry, explicit publisher roles, append-only roots, sequence continuity and proof verification. Add actual `src/`, `test/` and `script/` files at those milestones, then require `forge fmt --check`, `forge build` and `forge test` in CI. M2 fork tests may introduce Foundry earlier where it directly helps validate adapter mechanics.

No script should broadcast with a mainnet key. Deployments need exact versioned manifest entries and retained receipts. Local/testnet contract evidence never supplies economic forward history.
