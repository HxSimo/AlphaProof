# Integrations and verification gates

## General adapter rule

The MVP uses an explicit allowlist. Before enabling an instrument, create a versioned fact sheet and manifest entry covering exact environment, chain ID, addresses, assets/decimals, yield source, fees, limits, exit mechanics, liquidity, governance/admin powers, dependencies, data sources, freshness, and adapter version.

Do not copy an address from a blog, stale deployment, sample repository, or this skill without current verification from official sources and on-chain bytecode. Keep `TO_VERIFY` items disabled.

Conceptual adapter interface:

```ts
interface ProtocolAdapter {
  snapshot(ref: BlockRef): Promise<MarketSnapshot>;
  validate(op: PlannedOperation, state: MarketSnapshot, portfolio: ShadowPortfolio): ValidationResult;
  quote(op: PlannedOperation, context: ExecutionContext): Promise<ExecutionQuote>;
  apply(receipt: OperationReceipt, portfolio: ShadowPortfolio): ShadowPortfolio;
  accrue(position: Position, from: MarketSnapshot, to: MarketSnapshot): Position;
  value(position: Position, context: ValuationContext): PositionValuation;
}
```

Every normalized result retains source, raw-object hash, block/hash when applicable, observed time, freshness, adapter ID, and adapter version.

## Ethereum lending

Candidate: Aave V3 supply for USDC and possibly USDT. Verify current official address registry, reserve token/decimals, liquidity, supply caps, pause/freeze state, index math, deposit/withdraw behavior, gas, and historical block access. The conservative economic reference is proposed as passive Aave V3 USDC on Ethereum, but only after exact environment verification.

The adapter must accrue through the protocol's actual index/share mechanics and model available withdrawal liquidity. A displayed APY is explanatory data, not canonical accrual.

## ERC-4626 vaults

Candidates in v0.3 include two selected Ethereum USDC vaults; named Morpho/Gauntlet vaults are review candidates, not endorsements. Verify exact vault version, asset, fees, synchronous exit, limits, liquidity, share conversion, dependencies, and historical reads.

Test `convertTo*`, `preview*`, `maxDeposit`, `maxMint`, `maxWithdraw`, `maxRedeem`, deposits, redemptions, and rounding against a fixed-block fork. Because owner-dependent limits for a real wallet do not directly describe a virtual holder, specify the shadow-capacity calculation and its conservative bound.

## Ethereum swaps

Proposed initial model: Uniswap V3 exact-in over a predefined set of direct USDC/USDT pools. Verify pool/router/quoter addresses, fee tiers, token order/decimals, archive-state availability, quote behavior at exact size, gas, and failure semantics.

Select the route deterministically using received amount net of estimated gas under the locked rule. Do not add a multi-aggregator optimizer unless scope is explicitly changed. A quote at 1,000 USDC is not reusable for 100,000 USDC.

## Arc DeFi

Arc is a genuine treasury destination in the product vision, not merely a registry. The v0.3 guaranteed demo target is Arc Testnet with test USDC and a demonstration ERC-4626 vault supporting deposit and withdrawal. Any test yield must come from a finite predeclared test-token budget and schedule. It proves accounting and lifecycle integration, not real yield.

Do not assume an Arc mainnet yield market exists or is safe. `CROSS_CHAIN_MAINNET_FORWARD` stays disabled until usable markets, liquidity, contracts, withdrawals, both transfer directions, gas rules, and data are currently verified.

Arc native USDC and ERC-20 balance views need controlled precision normalization and must not be double-counted. Verify current chain ID, RPC, explorer, confirmations/finality, token interfaces, and gas units in the active manifest.

## CCTP transfers

MVP policy: USDC only, Ethereum/Arc both directions, one CCTP adapter, Standard Transfer proposed, with Bridge Kit or equivalent SDK only as a call/tracking convenience. The Proof of Alpha adapter owns accounting, fee capture, provenance, and lifecycle.

Verify separately for every environment and direction:

- source/destination chain IDs and CCTP domains;
- TokenMessenger/MessageTransmitter or current contract set;
- burn/mint or current message flow and finality requirements;
- attestation endpoint and status semantics;
- protocol fees, source gas, destination gas, relayer/forwarding costs;
- destination gas-funding strategy;
- message-id derivation, duplicate receipt behavior, and retries;
- actual test transfer and return transfer.

Mainnet Ethereum USDC must never be paired with Arc Testnet. A purely virtual transfer has no real attestation. The shadow delay model is versioned by direction, calibrated from observations or explicitly labeled as an assumption.

## The Graph and data sources

Use The Graph where indexed history, events, agent features, or cross-protocol analysis materially help. Store the indexing block and freshness. For execution-critical contract state or an exact quote, use the source required by policy, commonly an RPC/archive read or quoter, and archive the response.

Do not integrate The Graph merely for sponsor visibility. A useful narrow contribution could be a common selected-instrument schema or a composable ERC-4626 flow module if it serves the product and can be maintained.

## Other optional technologies

- Privy: creator onboarding and wallet access only if it simplifies a real flow.
- 1inch: alternate single swap provider only after an explicit scope decision; not an implicit fallback.
- World: future operator-uniqueness signal; does not prevent hidden variants.
- Hedera/x402: future paid evaluation service; outside critical MVP.
- Safe/programmable account: post-MVP real-capital restrictions.

Before adding any option, identify the user-visible need, failure mode, data/provenance effect, acceptance test, and what existing scope will be cut.
