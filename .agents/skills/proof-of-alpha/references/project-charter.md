# Project charter

## Product definition

Proof of Alpha is a mandate-based protocol that prospectively evaluates financial agents. Its first mandate is a USDC-denominated stablecoin treasury across Ethereum and Arc. A creator declares an agent version and locks an experiment policy at `X`. The self-hosted agent later calls the public API whenever it wants to change an allocation. The platform records the signed intent, applies a deterministic versioned execution model to future market states, maintains shadow portfolios, compares them with two fixed references, and publishes reproducible reports and cryptographic commitments.

The protocol evaluates a sequence of decisions under an explicit policy. It does not prove that the declared code actually ran, certify general intelligence, guarantee future returns, or automatically allocate real funds.

## Primary users and value

- Agent creator: diagnose where performance comes from and how it changes with costs, capital, liquidity, and constraints.
- Verifier, investor, or treasury manager: inspect a prospective track record with declared limitations and reproducible calculations.
- Future capital provider: use the evaluation as one input to a separately defined funding and wallet policy.

## Locked v0.3 decisions

- First mandate: stablecoin treasury management, not unconstrained profit maximization.
- Networks: Ethereum and Arc are DeFi environments; Arc is also the commitment registry in the demo.
- Unit of account and transfer asset: USDC. USDT, if used, remains on Ethereum and must be converted back to USDC before a transfer.
- Agents are self-hosted and submit signed intents. Proof of Alpha does not host or execute their strategies.
- Experiments are prospective. Rules and relevant versions are frozen before the start.
- Three independent capital scenarios: 1,000, 10,000, and 100,000 USDC.
- Two references only: stationary USDC cash and a fixed passive conservative-yield position.
- Required swaps and Ethereum/Arc transfers include economic costs and failures.
- One transfer mechanism in the MVP: CCTP, USDC only, both directions.
- Testnet integration evidence, replay diagnostics, synthetic fixtures, and economic forward evidence remain separate.
- The MVP reports eligibility dimensions but never automatically funds an agent.
- A deterministic strategy may be evaluated; an LLM is not required.

## Proposed values that require validation

- Initial capital distribution: 100% Ethereum for mainnet forward testing; 100% Sepolia for cross-chain testnet.
- Ethereum catalog candidates: USDC cash, Aave V3 USDC/USDT supply, two selected USDC vaults, and Uniswap V3 direct USDC/USDT pools.
- Arc Testnet: test USDC cash and a demonstration ERC-4626 vault with deposit and withdrawal.
- Risk proposals: 10% post-reallocation cash target, 40% per investment instrument, 60% per underlying protocol, 25% USDT, 40% in transit, 10 bps swap slippage, no leverage.
- Five-minute valuation checkpoints, hourly descriptive observations, daily summaries, and a 30-day economic experiment.
- One action in progress per scenario; 60 accepted intents per day and scenario; 10 active beta agents.
- Periodic Merkle root every five minutes and report commitment at closure.

Treat every proposed value as profile data, not a universal constant.

## Network profiles and evidence boundary

| Profile | Purpose | Permitted claim |
| --- | --- | --- |
| `ETHEREUM_MAINNET_FORWARD` | Shadow capital on real Ethereum markets | Prospective economic history limited to Ethereum |
| `CROSS_CHAIN_TESTNET` | Sepolia ↔ Arc Testnet CCTP and test investments | Technical lifecycle evidence only |
| `CROSS_CHAIN_MAINNET_FORWARD` | Future validated Ethereum ↔ Arc mainnet treasury | Disabled until markets, route, liquidity, contracts, and data are verified |

Any mainnet/testnet mixture is `MIXED_DIAGNOSTIC` and excluded from eligibility. A later Arc mainnet activation creates a new experiment; it does not upgrade old testnet results.

## MVP success criteria

- An external demo agent signs and submits a real intent through the API.
- Policy locking, three scenarios, two references, and durable action chronology work end to end.
- The selected lending, vault, swap, Arc test vault, and CCTP flows have validated adapters or clearly labeled test implementations.
- Test-token USDC is transferred in both directions; capital in transit is unavailable and credited exactly once.
- Withdrawals, deposits, swaps, approvals, gas, transfer fees, retries, and partial failures affect results correctly.
- Reports separate compliance, economic performance, data quality, and statistical evidence.
- An export can replay a receipt from archived inputs and versioned code.
- The dashboard verifies inclusion in an on-chain commitment.
- No replay, fixture, or testnet result is misrepresented as forward mainnet alpha.

## Explicit non-goals for the MVP

- Hosting agent inference or private strategy code.
- Borrowing, leverage, derivatives, concentrated liquidity, or market making.
- Universal vault/protocol discovery, a universal safety score, or hundreds of adapters.
- Bridge/aggregator optimization or agent-selected CCTP modes.
- Automatic real-capital allocation, programmable live-wallet restrictions, promotions, or demotions.
- Proving runtime immutability, human non-intervention, or strategy secrecy.
- Inventing robust statistical significance from a hackathon-length sample.
- Claiming capacity between or beyond tested sizes.

## Product language

Prefer “prospective evaluation,” “excess return versus cash/conservative yield,” “observed at tested capital,” “self-reported runtime,” and “eligible under a named policy.” Avoid “provably best agent,” “risk-free,” “guaranteed alpha,” “optimal capital,” or “certified AI.”

Short pitch: Proof of Alpha lets a financial agent build a prospective history with virtual capital and real market data, measures its net decisions at several capital sizes, and makes the result auditable before anyone considers entrusting it with funds.
