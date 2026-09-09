import { mulDiv } from '@poa/accounting';
import { contentHash, PoaError } from '@poa/domain';
import {
  observationSourceHash,
  readArchivedJson,
  requireFresh,
  toSourceRef,
  type ObjectArchive,
} from '@poa/market-data';
import {
  AaveReservePayload,
  AdapterResult,
  Erc4626Payload,
  EthUsdcConversionPayload,
  GasPayload,
  UniswapV3QuotePayload,
  type AccountingCostData,
  type AccountingReceiptData,
  type AdapterResultData,
  type ArchivedObservationData,
  type AaveReservePayloadData,
  type Erc4626PayloadData,
  type EthUsdcConversionPayloadData,
  type GasPayloadData,
  type UniswapV3QuotePayloadData,
} from '@poa/schemas';

export const ADAPTER_VERSION = '1.0.0';

interface Captured<T> {
  observation: ArchivedObservationData;
  payload: T;
}

export interface ReceiptContext {
  experimentId: string;
  scenarioId: string;
  expectedPortfolioVersion: string;
  observedAt: string;
  evaluationTime: string;
  resultProvenance: AccountingReceiptData['resultProvenance'];
  cashViewId: string;
  cashBalanceFamilyId: string;
}

async function load<T>(
  archive: ObjectArchive,
  observation: ArchivedObservationData,
  schema: { parse(value: unknown): T },
  evaluationTime: string,
): Promise<Captured<T>> {
  requireFresh(observation, evaluationTime);
  const payload = schema.parse(
    await readArchivedJson(archive, observation.rawObject),
  );
  return { observation, payload };
}

function requireAligned(context: ReceiptContext, values: Captured<unknown>[]) {
  for (const value of values) {
    if (value.observation.adapterVersion !== ADAPTER_VERSION)
      throw new PoaError(
        'DEPENDENCY_UNVERIFIED',
        'Observation adapter version mismatch',
      );
    if (value.observation.resultProvenance !== context.resultProvenance)
      throw new PoaError(
        'ENVIRONMENT_MISMATCH',
        'Observation provenance mismatch',
      );
  }
}

function ceilMulDiv(a: string, b: string, d: string) {
  return mulDiv(a, b, d, 'CEIL').valueMinor;
}

function gasCost(
  id: string,
  gas: Captured<GasPayloadData>,
  conversion: Captured<EthUsdcConversionPayloadData>,
  category: AccountingCostData['category'],
  networkId = 'ethereum-mainnet',
): AccountingCostData {
  const wei =
    BigInt(gas.payload.gasUnits) * BigInt(gas.payload.effectiveGasPriceWei);
  const amount = ceilMulDiv(
    wei.toString(),
    conversion.payload.usdcMinorNumerator,
    conversion.payload.weiDenominator,
  );
  if (amount === '0')
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Attempted operation has zero modeled gas cost',
    );
  return {
    costId: id,
    category,
    funding: 'PAYABLE',
    amountUsdcMinor: amount,
    networkId,
    cashBalanceFamilyId: null,
    sourceHash: contentHash({
      gas: gas.observation.rawObject.objectHash,
      conversion: conversion.observation.rawObject.objectHash,
    }),
  };
}

function checkConversionFresh(
  conversion: Captured<EthUsdcConversionPayloadData>,
  evaluationTime: string,
) {
  const updated = Date.parse(conversion.payload.answerUpdatedAt);
  const evaluated = Date.parse(evaluationTime);
  const deadline =
    updated + Number(BigInt(conversion.payload.heartbeatSeconds) * 1000n);
  if (
    !Number.isFinite(updated) ||
    !Number.isFinite(evaluated) ||
    evaluated >= deadline
  )
    throw new PoaError(
      'DATA_STALE',
      'ETH/USDC conversion round exceeded its heartbeat',
    );
}

function sources(context: ReceiptContext, values: Captured<unknown>[]) {
  requireAligned(context, values);
  const refs = values.map((value) =>
    toSourceRef(value.observation, context.evaluationTime),
  );
  const derived = observationSourceHash(refs);
  const hashes = [...refs.map((ref) => ref.rawObjectHash), derived];
  return { refs, derived, hashes };
}

function result(
  adapterId: string,
  operation: string,
  context: ReceiptContext,
  refs: ReturnType<typeof toSourceRef>[],
  sourceHash: `0x${string}`,
  receipts: AccountingReceiptData[],
): AdapterResultData {
  return AdapterResult.parse({
    schemaVersion: 'proof-of-alpha/adapter-result/v1',
    adapterId,
    adapterVersion: ADAPTER_VERSION,
    operation,
    resultProvenance: context.resultProvenance,
    sourceRefs: refs,
    sourceHash,
    receipts,
  });
}

export async function erc20Approval(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    adapterId:
      | 'aave-v3-ethereum'
      | 'erc4626-ethereum'
      | 'demo-vault-ethereum-sepolia'
      | 'demo-vault-arc-testnet'
      | 'uniswap-v3-ethereum';
    operationId: string;
    allowanceId: string;
    assetId: 'usdc' | 'usdt';
    spenderId: string;
    amountMinor: string;
    currentAllowanceMinor: string;
    gas: ArchivedObservationData;
    conversion: ArchivedObservationData;
  },
) {
  const gas = await load(
    archive,
    input.gas,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    input.conversion,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  const source = sources(context, [gas, conversion]);
  if (
    gas.payload.operation !== 'APPROVE' ||
    gas.payload.amountInMinor !== input.amountMinor
  )
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Approval gas capture is not for the requested amount',
    );
  if (BigInt(input.currentAllowanceMinor) >= BigInt(input.amountMinor)) {
    const receipt: AccountingReceiptData = {
      schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
      accountingVersion: '1.0.0',
      operationId: input.operationId,
      experimentId: context.experimentId,
      scenarioId: context.scenarioId,
      expectedPortfolioVersion: context.expectedPortfolioVersion,
      observedAt: context.observedAt,
      resultProvenance: context.resultProvenance,
      sourceHashes: source.hashes,
      kind: 'NO_EFFECT',
      status: 'SKIPPED',
      reasonCode: 'ALLOWANCE_SUFFICIENT',
      costs: [],
    };
    return result(
      input.adapterId,
      'erc20-approval',
      context,
      source.refs,
      source.derived,
      [receipt],
    );
  }
  const cost = gasCost(
    `${input.operationId}-gas`,
    gas,
    conversion,
    'APPROVAL_GAS',
  );
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: input.operationId,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, cost.sourceHash],
    kind: 'APPROVE',
    allowanceId: input.allowanceId,
    networkId: 'ethereum-mainnet',
    assetId: input.assetId,
    spenderId: input.spenderId,
    amountMinor: input.amountMinor,
    costs: [cost],
  };
  return result(
    input.adapterId,
    'erc20-approval',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export async function aaveSupply(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    amountMinor: string;
    instrumentId: string;
    positionId: string;
    allowanceId: string;
    currentAllowanceMinor: string;
    reserve: ArchivedObservationData;
    approvalGas: ArchivedObservationData;
    supplyGas: ArchivedObservationData;
    conversion: ArchivedObservationData;
    operationPrefix?: string;
  },
) {
  const reserve = await load(
    archive,
    input.reserve,
    AaveReservePayload,
    context.evaluationTime,
  );
  const approvalGas = await load(
    archive,
    input.approvalGas,
    GasPayload,
    context.evaluationTime,
  );
  const supplyGas = await load(
    archive,
    input.supplyGas,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    input.conversion,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  const all = [reserve, approvalGas, supplyGas, conversion];
  const source = sources(context, all);
  const amount = BigInt(input.amountMinor);
  if (
    approvalGas.payload.amountInMinor !== input.amountMinor ||
    supplyGas.payload.amountInMinor !== input.amountMinor
  )
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Gas capture is not for the requested amount',
    );
  if (
    !reserve.payload.active ||
    reserve.payload.frozen ||
    reserve.payload.paused
  )
    throw new PoaError(
      'LIMIT_EXCEEDED',
      'Aave reserve is inactive, frozen, or paused',
    );
  if (
    BigInt(reserve.payload.supplyCapMinor) > 0n &&
    BigInt(reserve.payload.totalSuppliedMinor) + amount >
      BigInt(reserve.payload.supplyCapMinor)
  )
    throw new PoaError('LIMIT_EXCEEDED', 'Aave supply cap would be exceeded');
  const receipts: AccountingReceiptData[] = [];
  const approveOperationId = input.operationPrefix
    ? `${input.operationPrefix}-approve`
    : `${context.scenarioId}-aave-approve`;
  const depositOperationId = input.operationPrefix
    ? `${input.operationPrefix}-deposit`
    : `${context.scenarioId}-aave-supply`;
  let version = BigInt(context.expectedPortfolioVersion);
  if (BigInt(input.currentAllowanceMinor) < amount) {
    const cost = gasCost(
      input.operationPrefix
        ? `${input.operationPrefix}-approval-gas`
        : `${context.scenarioId}-aave-approval-gas`,
      approvalGas,
      conversion,
      'APPROVAL_GAS',
    );
    receipts.push({
      schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
      accountingVersion: '1.0.0',
      operationId: approveOperationId,
      experimentId: context.experimentId,
      scenarioId: context.scenarioId,
      expectedPortfolioVersion: version.toString(),
      observedAt: context.observedAt,
      resultProvenance: context.resultProvenance,
      sourceHashes: [...source.hashes, cost.sourceHash],
      kind: 'APPROVE',
      allowanceId: input.allowanceId,
      networkId: 'ethereum-mainnet',
      assetId: reserve.payload.assetId,
      spenderId: 'aave-v3-pool',
      amountMinor: input.amountMinor,
      costs: [cost],
    });
    version++;
  }
  const supplyCost = gasCost(
    input.operationPrefix
      ? `${input.operationPrefix}-supply-gas`
      : `${context.scenarioId}-aave-supply-gas`,
    supplyGas,
    conversion,
    'EXECUTION_GAS',
  );
  receipts.push({
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: depositOperationId,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: version.toString(),
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, supplyCost.sourceHash],
    kind: 'DEPOSIT',
    cashViewId: context.cashViewId,
    positionId: input.positionId,
    instrumentId: input.instrumentId,
    sharesCreditMinor: input.amountMinor,
    indexNumerator: '1',
    indexDenominator: '1',
    inputUsdcMinor: input.amountMinor,
    costs: [supplyCost],
  });
  return result(
    'aave-v3-ethereum',
    'aave-supply',
    context,
    source.refs,
    source.derived,
    receipts,
  );
}

export async function aaveAccrue(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    positionId: string;
    openingLiquidityIndexRay: string;
    reserve: ArchivedObservationData;
  },
) {
  const reserve = await load(
    archive,
    input.reserve,
    AaveReservePayload,
    context.evaluationTime,
  );
  const source = sources(context, [reserve]);
  if (
    BigInt(reserve.payload.liquidityIndexRay) <
    BigInt(input.openingLiquidityIndexRay)
  )
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Aave liquidity index moved backward',
    );
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `${context.scenarioId}-aave-accrue`,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: source.hashes,
    kind: 'ACCRUE',
    positionId: input.positionId,
    nextIndexNumerator: reserve.payload.liquidityIndexRay,
    nextIndexDenominator: input.openingLiquidityIndexRay,
    costs: [],
  };
  return result(
    'aave-v3-ethereum',
    'aave-accrue',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export async function aaveWithdraw(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    positionId: string;
    sharesMinor: string;
    bookValueMinor: string;
    reserve: ArchivedObservationData;
    gas: ArchivedObservationData;
    conversion: ArchivedObservationData;
  },
) {
  const reserve = await load(
    archive,
    input.reserve,
    AaveReservePayload,
    context.evaluationTime,
  );
  const gas = await load(
    archive,
    input.gas,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    input.conversion,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  const source = sources(context, [reserve, gas, conversion]);
  if (gas.payload.amountInMinor !== input.bookValueMinor)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Withdrawal gas capture is not for the requested amount',
    );
  if (
    BigInt(reserve.payload.availableLiquidityMinor) <
    BigInt(input.bookValueMinor)
  )
    throw new PoaError(
      'LIQUIDITY_UNAVAILABLE',
      'Aave reserve cannot satisfy the withdrawal',
    );
  const cost = gasCost(
    `${context.scenarioId}-aave-withdraw-gas`,
    gas,
    conversion,
    'EXECUTION_GAS',
  );
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `${context.scenarioId}-aave-withdraw`,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, cost.sourceHash],
    kind: 'WITHDRAW',
    costs: [cost],
    cashViewId: context.cashViewId,
    positionId: input.positionId,
    sharesDebitMinor: input.sharesMinor,
    cashCreditUsdcMinor: input.bookValueMinor,
  };
  return result(
    'aave-v3-ethereum',
    'aave-withdraw',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export function erc4626ConvertToShares(
  assets: string,
  totalAssets: string,
  totalShares: string,
  rounding: 'FLOOR' | 'CEIL',
) {
  if (totalAssets === '0' || totalShares === '0') return assets;
  return mulDiv(assets, totalShares, totalAssets, rounding).valueMinor;
}

export async function vaultDeposit(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    amountMinor: string;
    instrumentId: string;
    positionId: string;
    vault: ArchivedObservationData;
    gas: ArchivedObservationData;
    conversion: ArchivedObservationData;
    adapterId?:
      | 'erc4626-ethereum'
      | 'demo-vault-ethereum-sepolia'
      | 'demo-vault-arc-testnet';
    networkId?: string;
  },
) {
  const vault = await load(
    archive,
    input.vault,
    Erc4626Payload,
    context.evaluationTime,
  );
  const gas = await load(
    archive,
    input.gas,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    input.conversion,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  const source = sources(context, [vault, gas, conversion]);
  if (
    vault.payload.testAmountAssetsMinor !== input.amountMinor ||
    gas.payload.amountInMinor !== input.amountMinor
  )
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Vault capture is not for the requested amount',
    );
  if (
    BigInt(input.amountMinor) > BigInt(vault.payload.maxDepositAssetsMinor) ||
    BigInt(vault.payload.previewDepositShares) >
      BigInt(vault.payload.maxMintShares)
  )
    throw new PoaError('LIMIT_EXCEEDED', 'Vault entry limit would be exceeded');
  if (vault.payload.previewDepositShares === '0')
    throw new PoaError('LIMIT_EXCEEDED', 'Vault deposit rounds to zero shares');
  const gasCharge = gasCost(
    `${context.scenarioId}-vault-deposit-gas`,
    gas,
    conversion,
    'EXECUTION_GAS',
    input.networkId,
  );
  const fee = mulDiv(
    input.amountMinor,
    String(vault.payload.depositFeeBps),
    '10000',
    'CEIL',
  ).valueMinor;
  const costs: AccountingCostData[] = [gasCharge];
  if (fee !== '0')
    costs.push({
      costId: `${context.scenarioId}-vault-entry-fee`,
      category: 'PROTOCOL_FEE',
      funding: 'WITHHELD',
      amountUsdcMinor: fee,
      networkId: input.networkId ?? 'ethereum-mainnet',
      cashBalanceFamilyId: null,
      sourceHash: vault.observation.rawObject.objectHash,
    });
  const credited = (BigInt(input.amountMinor) - BigInt(fee)).toString();
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `${context.scenarioId}-vault-deposit`,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, ...costs.map((cost) => cost.sourceHash)],
    kind: 'DEPOSIT',
    costs,
    cashViewId: context.cashViewId,
    positionId: input.positionId,
    instrumentId: input.instrumentId,
    sharesCreditMinor: vault.payload.previewDepositShares,
    indexNumerator: credited,
    indexDenominator: vault.payload.previewDepositShares,
    inputUsdcMinor: input.amountMinor,
  };
  return result(
    input.adapterId ?? 'erc4626-ethereum',
    'vault-deposit',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export async function vaultRedeem(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    sharesMinor: string;
    bookValueMinor: string;
    positionId: string;
    vault: ArchivedObservationData;
    gas: ArchivedObservationData;
    conversion: ArchivedObservationData;
    adapterId?:
      | 'erc4626-ethereum'
      | 'demo-vault-ethereum-sepolia'
      | 'demo-vault-arc-testnet';
    networkId?: string;
  },
) {
  const vault = await load(
    archive,
    input.vault,
    Erc4626Payload,
    context.evaluationTime,
  );
  const gas = await load(
    archive,
    input.gas,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    input.conversion,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  const source = sources(context, [vault, gas, conversion]);
  if (gas.payload.amountInMinor !== input.bookValueMinor)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Vault redeem gas capture is not for the requested amount',
    );
  if (
    BigInt(input.sharesMinor) > BigInt(vault.payload.maxRedeemShares) ||
    BigInt(vault.payload.previewRedeemAssetsMinor) >
      BigInt(vault.payload.maxWithdrawAssetsMinor)
  )
    throw new PoaError('LIMIT_EXCEEDED', 'Vault exit limit would be exceeded');
  if (
    BigInt(vault.payload.previewRedeemAssetsMinor) >
    BigInt(vault.payload.availableExitAssetsMinor)
  )
    throw new PoaError(
      'LIQUIDITY_UNAVAILABLE',
      'Vault cannot satisfy the redeem',
    );
  const gross = BigInt(vault.payload.previewRedeemAssetsMinor);
  const fee = BigInt(
    mulDiv(
      gross.toString(),
      String(vault.payload.redeemFeeBps),
      '10000',
      'CEIL',
    ).valueMinor,
  );
  if (gross < fee)
    throw new PoaError('ACCOUNTING_INVARIANT', 'Vault exit fee exceeds output');
  const cashCredit = gross - fee;
  if (cashCredit > BigInt(input.bookValueMinor))
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Vault redeem creates unaccrued value',
    );
  const gasCharge = gasCost(
    `${context.scenarioId}-vault-redeem-gas`,
    gas,
    conversion,
    'EXECUTION_GAS',
    input.networkId,
  );
  const economicGap = BigInt(input.bookValueMinor) - cashCredit;
  const costs: AccountingCostData[] = [gasCharge];
  if (economicGap > 0n)
    costs.push({
      costId: `${context.scenarioId}-vault-exit-gap`,
      category: 'PROTOCOL_FEE',
      funding: 'WITHHELD',
      amountUsdcMinor: economicGap.toString(),
      networkId: input.networkId ?? 'ethereum-mainnet',
      cashBalanceFamilyId: null,
      sourceHash: vault.observation.rawObject.objectHash,
    });
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `${context.scenarioId}-vault-redeem`,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, ...costs.map((cost) => cost.sourceHash)],
    kind: 'WITHDRAW',
    costs,
    cashViewId: context.cashViewId,
    positionId: input.positionId,
    sharesDebitMinor: input.sharesMinor,
    cashCreditUsdcMinor: cashCredit.toString(),
  };
  return result(
    input.adapterId ?? 'erc4626-ethereum',
    'vault-redeem',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export async function selectUniswapQuote(
  archive: ObjectArchive,
  context: ReceiptContext,
  observations: ArchivedObservationData[],
  gasObservation: ArchivedObservationData,
  conversionObservation: ArchivedObservationData,
  input: {
    amountInMinor: string;
    assetIn: 'usdc' | 'usdt';
    assetOut: 'usdc' | 'usdt';
    minimumOutMinor: string;
  },
) {
  const quotes = await Promise.all(
    observations.map((item) =>
      load(archive, item, UniswapV3QuotePayload, context.evaluationTime),
    ),
  );
  const gas = await load(
    archive,
    gasObservation,
    GasPayload,
    context.evaluationTime,
  );
  const conversion = await load(
    archive,
    conversionObservation,
    EthUsdcConversionPayload,
    context.evaluationTime,
  );
  checkConversionFresh(conversion, context.evaluationTime);
  if (gas.payload.amountInMinor !== input.amountInMinor)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      'Swap gas capture is not for the requested amount',
    );
  const candidates = quotes.filter(
    (quote) =>
      quote.payload.amountInMinor === input.amountInMinor &&
      quote.payload.assetIn === input.assetIn &&
      quote.payload.assetOut === input.assetOut,
  );
  if (!candidates.length)
    throw new PoaError('QUOTE_UNAVAILABLE', 'No exact-amount direct quote');
  const gasCharge = gasCost(
    `${context.scenarioId}-swap-gas`,
    gas,
    conversion,
    'EXECUTION_GAS',
  );
  candidates.sort((a, b) => {
    const av =
      BigInt(a.payload.amountOutMinor) - BigInt(gasCharge.amountUsdcMinor);
    const bv =
      BigInt(b.payload.amountOutMinor) - BigInt(gasCharge.amountUsdcMinor);
    return av === bv
      ? a.payload.poolId.localeCompare(b.payload.poolId)
      : av > bv
        ? -1
        : 1;
  });
  const selected = candidates[0]!;
  if (BigInt(selected.payload.amountOutMinor) < BigInt(input.minimumOutMinor))
    throw new PoaError(
      'SLIPPAGE_EXCEEDED',
      'Exact-input quote is below minimum output',
    );
  return { selected, gas, conversion, gasCharge };
}

export async function uniswapSwap(
  archive: ObjectArchive,
  context: ReceiptContext,
  input: {
    amountInMinor: string;
    assetIn: 'usdc' | 'usdt';
    assetOut: 'usdc' | 'usdt';
    minimumOutMinor: string;
    sourceCashViewId: string;
    destinationCashViewId: string;
    quotes: ArchivedObservationData[];
    gas: ArchivedObservationData;
    conversion: ArchivedObservationData;
  },
) {
  const chosen = await selectUniswapQuote(
    archive,
    context,
    input.quotes,
    input.gas,
    input.conversion,
    input,
  );
  const source = sources(context, [
    chosen.selected,
    chosen.gas,
    chosen.conversion,
  ]);
  const impact = (
    BigInt(input.amountInMinor) - BigInt(chosen.selected.payload.amountOutMinor)
  ).toString();
  if (BigInt(impact) < 0n)
    throw new PoaError(
      'ACCOUNTING_INVARIANT',
      'Unit-of-account swap output exceeds input',
    );
  const costs: AccountingCostData[] = [chosen.gasCharge];
  if (impact !== '0')
    costs.push({
      costId: `${context.scenarioId}-swap-fee-impact`,
      category: 'SWAP_FEE_IMPACT',
      funding: 'WITHHELD',
      amountUsdcMinor: impact,
      networkId: 'ethereum-mainnet',
      cashBalanceFamilyId: null,
      sourceHash: chosen.selected.observation.rawObject.objectHash,
    });
  const receipt: AccountingReceiptData = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `${context.scenarioId}-uniswap-swap`,
    experimentId: context.experimentId,
    scenarioId: context.scenarioId,
    expectedPortfolioVersion: context.expectedPortfolioVersion,
    observedAt: context.observedAt,
    resultProvenance: context.resultProvenance,
    sourceHashes: [...source.hashes, ...costs.map((cost) => cost.sourceHash)],
    kind: 'SWAP',
    costs,
    sourceCashViewId: input.sourceCashViewId,
    destinationCashViewId: input.destinationCashViewId,
    sourceDebitUsdcMinor: input.amountInMinor,
    destinationCreditUsdcMinor: chosen.selected.payload.amountOutMinor,
  };
  return result(
    'uniswap-v3-ethereum',
    'uniswap-swap',
    context,
    source.refs,
    source.derived,
    [receipt],
  );
}

export type {
  AaveReservePayloadData,
  Erc4626PayloadData,
  EthUsdcConversionPayloadData,
  GasPayloadData,
  UniswapV3QuotePayloadData,
};
