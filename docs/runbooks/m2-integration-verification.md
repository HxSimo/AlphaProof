# M2 Ethereum integration verification

The local M2 implementation uses `SYNTHETIC_TEST` fixtures. It has not executed a mainnet fork and must not be presented as current liquidity, fees, yield or route evidence.

## Pinned official source identities

| Family           | Pinned source                                                         | Facts established by source review                                                                                                                                                                                                                                               | Still required                                                                                                                       |
| ---------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Aave V3 Ethereum | `aave-dao/aave-address-book@09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9` | Pool `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`; USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, aUSDC `0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c`; USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7`, aUSDT `0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a`; both 6 decimals | Chain match, proxy/implementation bytecode, live reserve configuration, indices, capacity, liquidity and fork behavior               |
| Uniswap V3       | `Uniswap/v3-periphery@0682387198a24c7cd63566a2c58398533860a5d1`       | Original mainnet `SwapRouter` `0xE592427A0AEce92De3Edee1F18E0157C05861564`; `Quoter` `0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6`; periphery `1.0.0`                                                                                                                             | Direct pool addresses, usable fee tiers, code, liquidity, six exact-size quotes per block, execution gas and slippage failures       |
| ERC-4626         | `morpho-org/metamorpho@ded84e59668155b34d3c24906c4f7461c12828af`      | MetaMorpho V1 family uses ERC-4626 previews and max methods and computes deposit shares with floor rounding                                                                                                                                                                      | Exact active USDC vault, curator/governance/queues, asset/code, caps, fees, conversion behavior, virtual capacity and exit liquidity |

## Fork command and explicit credential gate

Choose a finalized Ethereum block for which the provider serves archive state. Resolve each value from the pinned official source plus calls at that same block. Do not copy synthetic fixture values.

```bash
export POA_RUN_ETHEREUM_FORK=1
export ETHEREUM_MAINNET_RPC_URL='<archive RPC URL>'
export POA_M2_FORK_BLOCK='<decimal block number>'
export POA_M2_FORK_BLOCK_HASH='<0x block hash>'
export POA_USDC='<verified token address>'
export POA_USDT='<verified token address>'
export POA_AAVE_POOL='<verified pool proxy>'
export POA_AAVE_USDC_ATOKEN='<verified aUSDC proxy>'
export POA_ERC4626_VAULT='<selected active MetaMorpho V1 USDC vault>'
export POA_UNISWAP_V3_ROUTER='<verified original V3 SwapRouter>'
export POA_UNISWAP_USDC_USDT_FEE='<verified direct pool fee in hundredths of a bip>'
export POA_USDC_CODE_HASH='<keccak256 runtime bytecode>'
export POA_USDT_CODE_HASH='<keccak256 runtime bytecode>'
export POA_AAVE_POOL_CODE_HASH='<keccak256 proxy runtime bytecode>'
export POA_AAVE_USDC_ATOKEN_CODE_HASH='<keccak256 proxy runtime bytecode>'
export POA_ERC4626_VAULT_CODE_HASH='<keccak256 runtime bytecode>'
export POA_UNISWAP_V3_ROUTER_CODE_HASH='<keccak256 runtime bytecode>'
pnpm test:fork
```

With `POA_RUN_ETHEREUM_FORK` absent, `pnpm test:fork` prints `SKIPPED_TO_VERIFY` and exits successfully. If the gate is set, it first verifies chain ID, pinned block hash and every expected runtime bytecode hash through historical RPC reads, then invokes Forge. The Solidity test creates a new fork for each of 1,000, 10,000 and 100,000 USDC and independently checks Aave supply/withdraw, every ERC-4626 preview/max method plus round trip, and both Uniswap directions.

Before accepting a fork pass, archive the block/header and every `eth_call`, `eth_getCode`, exact quote, receipt/gas result and conversion-feed round as raw objects, and bind their hashes to observations. Add fixed-block tests for pause/freeze, cap, unavailable exit, insufficient liquidity and slippage. The gate verifies identities and mechanics but does not itself persist RPC request/response bytes; archival remains an activation blocker.

## Feed and storage activation

Select exact ETH/USD and USDC/USD feeds or a direct ETH/USDC source. Record proxy and implementation addresses, decimals, round ID, answer, answer timestamp, heartbeat and depeg rule at the fork block. The gas conversion is `ceil(gasUnits × effectiveGasPriceWei × usdcMinorNumerator / weiDenominator)`.

Provision S3-compatible storage with create-only writes. Verify hash and byte length after write/read, restore the same replay bundle into an empty process, and record a retention policy of at least 90 days after experiment closure. Then run:

```bash
pnpm test:replay
pnpm config:validate
pnpm schemas:check
```

Create a new manifest version with evidence URIs and raw content hashes. Do not change `enabled` until every required evidence kind is present and every blocker is empty.
