# M2 validation evidence

Date: 2026-09-09. Scope: local deterministic Ethereum economic slice only.

## Verified locally

- `pnpm plan M2`: printed M2.1–M2.3 deliverables, observable exits, validation commands and the external gate.
- Frozen install: standalone pnpm 9.10.0 completed `pnpm install --offline --frozen-lockfile` for all 12 workspace projects. The repository remains pinned to pnpm 10.34.5; its configured local shim was unavailable, so this is the same documented fallback used for M1.
- `pnpm check`: passed formatting, root and all package typechecks, manifest validation, generated schema drift check, milestone-plan validation, 86 tests in seven files, package builds and the Next production build.
- Manifest bundle: valid hash `0x41f74daf2ac2aadf5885ed722030ca4e5100bc5c5e4ce130eb4c54ea7cc493f6`; 4 networks, 11 instruments, 23 dependencies and 3 disabled profiles.
- Schema catalog: 75 definitions generated and checked.
- `pnpm test:replay`: a second Node process restored content-addressed raw objects, reparsed pinned observations, regenerated Aave receipts and matched portfolio hash `0x5308faa40e13f4f522da417bf3fd3b330497fa2123cc58b257333a8d67b54b1b`.
- `forge build`: compiled `test/fork/M2Fork.t.sol` successfully with Solidity 0.8.30. Foundry could not write its optional global signature cache because the home cache was read-only; compilation succeeded.
- `pnpm test:fork`: returned the documented `SKIPPED_TO_VERIFY` result because `POA_RUN_ETHEREUM_FORK=1` and the required verified RPC/block/target/code-hash variables were not configured.

## Source evidence

Read-only official repository checks pinned these HEAD commits on 2026-09-09:

| Source                                                 | Commit                                     | Raw file hash                                                        |
| ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------- |
| `aave-dao/aave-address-book`, `src/AaveV3Ethereum.sol` | `09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9` | `0x253ed5028ff169c6f82d325e59613267baf3c71f3a7396223e27bc7bcfb8eb78` |
| `Uniswap/v3-periphery`, `deploys.md`                   | `0682387198a24c7cd63566a2c58398533860a5d1` | `0x953eae3d4f569f5b65582a3d9e38266744b6d8c2ba2fbd36f80303cd7abca5b8` |
| `morpho-org/metamorpho`, `src/MetaMorpho.sol`          | `ded84e59668155b34d3c24906c4f7461c12828af` | `0x9e3f778a1e53c6c0dcaaedeb043883205ae79c4b0ad18fc1ec7cadea73b640e7` |

The Aave source identifies Ethereum Pool, USDC/USDT, aUSDC/aUSDT and token scales. The Uniswap source identifies original V3 periphery 1.0.0 router/quoter addresses. The MetaMorpho source establishes the selected family’s ERC-4626 methods and rounding implementation. These are partial `OFFICIAL_SOURCE` artifacts, not deployment activation evidence.

## Unverified external evidence

No Ethereum RPC URL, final block/hash, historical call, runtime bytecode capture, exact active MetaMorpho USDC instance, direct USDC/USDT pool/fee selection, amount-specific live quote, transaction receipt, gas measurement, ETH/USDC feed round, liquidity/cap/paused-state capture, S3 endpoint, retention policy or restore was available. No mainnet fork or transaction ran. The Aave, ERC-4626, Uniswap, gas-conversion, RPC and archive dependencies and all profiles remain disabled and `TO_VERIFY`.

The exact activation procedure and required evidence are in [the M2 integration runbook](../runbooks/m2-integration-verification.md).
