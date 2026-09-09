import { z } from 'zod';
import {
  Address,
  BlockRef,
  Bps,
  Hash,
  Id,
  PositiveUInt,
  Provenance,
  SourceRef,
  Timestamp,
  UInt,
  Version,
} from './primitives.js';
import { AccountingReceipt, ShadowPortfolio } from './accounting.js';

export const RawObjectDescriptor = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/raw-object/v1'),
  objectHash: Hash,
  objectKey: z.string().regex(/^raw\/keccak256\/0x[0-9a-f]{64}$/),
  mediaType: z.literal('application/json'),
  contentLengthBytes: PositiveUInt,
  capturedAt: Timestamp,
});

export const ArchivedObservation = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/archived-observation/v1'),
    observationId: Id,
    sourceId: Id,
    sourceVersion: Version,
    parserVersion: Version,
    adapterVersion: Version,
    requestedAt: Timestamp,
    observedAt: Timestamp,
    expiresAt: Timestamp,
    block: BlockRef.nullable(),
    rawObject: RawObjectDescriptor,
    resultProvenance: Provenance,
  })
  .superRefine((value, ctx) => {
    if (value.requestedAt > value.observedAt)
      ctx.addIssue({
        code: 'custom',
        message: 'Request cannot follow observation',
      });
    if (value.observedAt >= value.expiresAt)
      ctx.addIssue({
        code: 'custom',
        message: 'Observation must expire later',
      });
    if (
      value.resultProvenance === 'FORWARD_SHADOW' &&
      (!value.block || value.block.finality !== 'FINALIZED')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Forward observations require a finalized block',
      });
  });

export const GasPayload = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/gas-input/v1'),
  operation: z.enum([
    'APPROVE',
    'SUPPLY',
    'WITHDRAW',
    'SWAP',
    'VAULT_DEPOSIT',
    'VAULT_REDEEM',
  ]),
  amountInMinor: PositiveUInt,
  gasUnits: UInt,
  effectiveGasPriceWei: UInt,
});

export const EthUsdcConversionPayload = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/eth-usdc-conversion/v1'),
  usdcMinorNumerator: PositiveUInt,
  weiDenominator: PositiveUInt,
  roundId: z.string().min(1),
  answerUpdatedAt: Timestamp,
  heartbeatSeconds: PositiveUInt,
});

export const AaveReservePayload = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/aave-v3-reserve/v1'),
  chainId: z.literal('1'),
  pool: Address,
  underlying: Address,
  aToken: Address,
  assetId: z.enum(['usdc', 'usdt']),
  decimals: z.literal(6),
  active: z.boolean(),
  frozen: z.boolean(),
  paused: z.boolean(),
  supplyCapMinor: UInt,
  totalSuppliedMinor: UInt,
  availableLiquidityMinor: UInt,
  liquidityIndexRay: PositiveUInt,
});

export const Erc4626Payload = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/erc4626-state/v1'),
  chainId: z.literal('1'),
  family: z.literal('MORPHO_METAMORPHO_V1'),
  vault: Address,
  asset: Address,
  assetDecimals: z.literal(6),
  shareDecimals: z.number().int().min(0).max(36),
  totalAssetsMinor: UInt,
  totalSupplyShares: UInt,
  maxDepositAssetsMinor: UInt,
  maxMintShares: UInt,
  maxWithdrawAssetsMinor: UInt,
  maxRedeemShares: UInt,
  availableExitAssetsMinor: UInt,
  depositFeeBps: Bps,
  redeemFeeBps: Bps,
  testAmountAssetsMinor: PositiveUInt,
  previewDepositShares: UInt,
  previewMintAssetsMinor: UInt,
  previewWithdrawShares: UInt,
  previewRedeemAssetsMinor: UInt,
});

export const UniswapV3QuotePayload = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/uniswap-v3-exact-input-quote/v1'),
  chainId: z.literal('1'),
  router: Address,
  quoter: Address,
  pool: Address,
  poolId: Id,
  tokenIn: Address,
  tokenOut: Address,
  assetIn: z.enum(['usdc', 'usdt']),
  assetOut: z.enum(['usdc', 'usdt']),
  feeTier: z.enum(['100', '500', '3000', '10000']),
  amountInMinor: PositiveUInt,
  amountOutMinor: UInt,
  sqrtPriceX96After: UInt,
  initializedTicksCrossed: UInt,
  quoteGasEstimate: UInt,
});

export const AdapterResult = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/adapter-result/v1'),
  adapterId: Id,
  adapterVersion: Version,
  operation: Id,
  resultProvenance: Provenance,
  sourceRefs: z.array(SourceRef).min(1),
  sourceHash: Hash,
  receipts: z.array(AccountingReceipt).min(1),
});

export const ReplayStep = z.strictObject({
  stepId: Id,
  adapterId: z.enum([
    'aave-v3-ethereum',
    'erc4626-ethereum',
    'uniswap-v3-ethereum',
  ]),
  operation: z.enum([
    'AAVE_SUPPLY',
    'AAVE_WITHDRAW',
    'VAULT_DEPOSIT',
    'VAULT_REDEEM',
    'SWAP',
  ]),
  input: z.record(z.string(), z.union([z.string(), z.boolean()])),
  observationIds: z.array(Id).min(1),
});

export const EconomicReplayBundle = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/economic-replay/v1'),
  bundleVersion: Version,
  createdAt: Timestamp,
  resultProvenance: Provenance,
  initialPortfolio: ShadowPortfolio,
  observations: z.array(ArchivedObservation).min(1),
  steps: z.array(ReplayStep).min(1),
  expectedFinalPortfolioHash: Hash,
});

export type RawObjectDescriptorData = z.infer<typeof RawObjectDescriptor>;
export type ArchivedObservationData = z.infer<typeof ArchivedObservation>;
export type GasPayloadData = z.infer<typeof GasPayload>;
export type EthUsdcConversionPayloadData = z.infer<
  typeof EthUsdcConversionPayload
>;
export type AaveReservePayloadData = z.infer<typeof AaveReservePayload>;
export type Erc4626PayloadData = z.infer<typeof Erc4626Payload>;
export type UniswapV3QuotePayloadData = z.infer<typeof UniswapV3QuotePayload>;
export type AdapterResultData = z.infer<typeof AdapterResult>;
export type EconomicReplayBundleData = z.infer<typeof EconomicReplayBundle>;
