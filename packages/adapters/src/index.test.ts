import { describe, expect, it } from 'vitest';
import {
  applyReceipt,
  assertPortfolio,
  createPortfolio,
} from '@poa/accounting';
import { STANDARD_CAPITAL } from '@poa/domain';
import {
  archiveJson,
  createObservation,
  MemoryObjectArchive,
} from '@poa/market-data';
import {
  AaveReservePayload,
  Erc4626Payload,
  EthUsdcConversionPayload,
  GasPayload,
  UniswapV3QuotePayload,
  type ArchivedObservationData,
} from '@poa/schemas';
import {
  aaveAccrue,
  aaveSupply,
  aaveWithdraw,
  erc20Approval,
  erc4626ConvertToShares,
  uniswapSwap,
  vaultDeposit,
  vaultRedeem,
} from './index.js';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:01:00.000Z';
const T2 = '2026-01-01T00:02:00.000Z';
const EXPIRY = '2026-01-01T01:00:00.000Z';
const addr = (digit: string) => `0x${digit.repeat(40)}`;

async function capture(
  archive: MemoryObjectArchive,
  id: string,
  payload: unknown,
  observedAt = T0,
): Promise<ArchivedObservationData> {
  const rawObject = await archiveJson(archive, payload, observedAt);
  return createObservation({
    observationId: id,
    sourceId: `${id}-source`,
    sourceVersion: '1.0.0',
    parserVersion: '1.0.0',
    adapterVersion: '1.0.0',
    requestedAt: observedAt,
    observedAt,
    expiresAt: EXPIRY,
    block: null,
    rawObject,
    resultProvenance: 'SYNTHETIC_TEST',
  });
}

const conversionPayload = EthUsdcConversionPayload.parse({
  schemaVersion: 'proof-of-alpha/eth-usdc-conversion/v1',
  usdcMinorNumerator: '3000000000',
  weiDenominator: '1000000000000000000',
  roundId: 'synthetic-round-1',
  answerUpdatedAt: T0,
  heartbeatSeconds: '3600',
});
const gasPayload = (operation: string, amount: string) =>
  GasPayload.parse({
    schemaVersion: 'proof-of-alpha/gas-input/v1',
    operation,
    amountInMinor: amount,
    gasUnits: operation === 'APPROVE' ? '50000' : '140000',
    effectiveGasPriceWei: '20000000000',
  });
const reservePayload = (assetId: 'usdc' | 'usdt', index: string) =>
  AaveReservePayload.parse({
    schemaVersion: 'proof-of-alpha/aave-v3-reserve/v1',
    chainId: '1',
    pool: addr('1'),
    underlying: assetId === 'usdc' ? addr('2') : addr('3'),
    aToken: assetId === 'usdc' ? addr('4') : addr('5'),
    assetId,
    decimals: 6,
    active: true,
    frozen: false,
    paused: false,
    supplyCapMinor: '1000000000000000',
    totalSuppliedMinor: '500000000000000',
    availableLiquidityMinor: '500000000000000',
    liquidityIndexRay: index,
  });
const context = (
  scenarioId: string,
  version: string,
  time: string,
  cashViewId = 'eth-usdc-view',
) => ({
  experimentId: 'm2-fixture',
  scenarioId,
  expectedPortfolioVersion: version,
  observedAt: time,
  evaluationTime: time,
  resultProvenance: 'SYNTHETIC_TEST' as const,
  cashViewId,
  cashBalanceFamilyId: cashViewId.replace('-view', '-family'),
});
const portfolio = (
  scenarioId: string,
  amount: string,
  assetId = 'usdc',
  viewId = 'eth-usdc-view',
) =>
  createPortfolio({
    experimentId: 'm2-fixture',
    scenarioId,
    portfolioId: `${scenarioId}-portfolio`,
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: amount,
    maxDestinationAttempts: '3',
    balanceViews: [
      {
        viewId,
        networkId: 'ethereum-mainnet',
        assetId,
        balanceFamilyId: viewId.replace('-view', '-family'),
        decimals: 6,
        canonicalDecimals: 6,
      },
    ],
    initialCash: [{ viewId, amountUsdcMinor: amount }],
  });

describe('Aave V3 deterministic captured-fixture path', () => {
  for (const [i, amount] of STANDARD_CAPITAL.entries()) {
    it(`runs cash -> supply -> accrual -> cash independently for ${amount}`, async () => {
      const scenario = `capital-${i + 1}-aave`;
      const archive = new MemoryObjectArchive();
      const conversion = await capture(
        archive,
        `${scenario}-conversion`,
        conversionPayload,
      );
      const opening = await capture(
        archive,
        `${scenario}-opening`,
        reservePayload('usdc', '1000000000000000000000000000'),
      );
      const approvalGas = await capture(
        archive,
        `${scenario}-approval-gas`,
        gasPayload('APPROVE', amount),
      );
      const supplyGas = await capture(
        archive,
        `${scenario}-supply-gas`,
        gasPayload('SUPPLY', amount),
      );
      const supplied = await aaveSupply(archive, context(scenario, '0', T0), {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: `${scenario}-position`,
        allowanceId: `${scenario}-allowance`,
        currentAllowanceMinor: '0',
        reserve: opening,
        approvalGas,
        supplyGas,
        conversion,
      });
      let state = portfolio(scenario, amount);
      for (const receipt of supplied.receipts)
        state = applyReceipt(state, receipt);
      const closingIndex = '1010000000000000000000000000';
      const closing = await capture(
        archive,
        `${scenario}-closing`,
        reservePayload('usdc', closingIndex),
        T1,
      );
      const accrued = await aaveAccrue(
        archive,
        context(scenario, state.version, T1),
        {
          positionId: `${scenario}-position`,
          openingLiquidityIndexRay: '1000000000000000000000000000',
          reserve: closing,
        },
      );
      state = applyReceipt(state, accrued.receipts[0]!);
      const book = state.positions[0]!.bookValueUsdcMinor;
      expect(book).toBe(((BigInt(amount) * 101n) / 100n).toString());
      const withdrawGas = await capture(
        archive,
        `${scenario}-withdraw-gas`,
        gasPayload('WITHDRAW', book),
        T2,
      );
      const withdrawn = await aaveWithdraw(
        archive,
        context(scenario, state.version, T2),
        {
          positionId: `${scenario}-position`,
          sharesMinor: amount,
          bookValueMinor: book,
          reserve: closing,
          gas: withdrawGas,
          conversion,
        },
      );
      state = applyReceipt(state, withdrawn.receipts[0]!);
      expect(state.positions).toHaveLength(0);
      expect(state.cash[0]!.amountUsdcMinor).toBe(book);
      expect(state.recognizedCosts).toHaveLength(3);
      expect(assertPortfolio(state)).toEqual(state);
    });
  }

  it('fails before receipt creation on pause, cap, liquidity and stale data', async () => {
    const archive = new MemoryObjectArchive();
    const amount = STANDARD_CAPITAL[0];
    const conversion = await capture(
      archive,
      'edge-conversion',
      conversionPayload,
    );
    const approvalGas = await capture(
      archive,
      'edge-approval-gas',
      gasPayload('APPROVE', amount),
    );
    const supplyGas = await capture(
      archive,
      'edge-supply-gas',
      gasPayload('SUPPLY', amount),
    );
    const pausedPayload = { ...reservePayload('usdc', '1'), paused: true };
    const paused = await capture(archive, 'edge-paused', pausedPayload);
    await expect(
      aaveSupply(archive, context('edge-aave', '0', T0), {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: 'edge-position',
        allowanceId: 'edge-allowance',
        currentAllowanceMinor: '0',
        reserve: paused,
        approvalGas,
        supplyGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(
      aaveSupply(archive, context('edge-aave', '0', EXPIRY), {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: 'edge-position',
        allowanceId: 'edge-allowance',
        currentAllowanceMinor: '0',
        reserve: paused,
        approvalGas,
        supplyGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'DATA_STALE' });

    const capped = await capture(archive, 'edge-capped', {
      ...reservePayload('usdc', '1'),
      supplyCapMinor: (500000000000000n + BigInt(amount) - 1n).toString(),
    });
    await expect(
      aaveSupply(archive, context('edge-cap', '0', T0), {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: 'edge-cap-position',
        allowanceId: 'edge-cap-allowance',
        currentAllowanceMinor: '0',
        reserve: capped,
        approvalGas,
        supplyGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });

    const illiquid = await capture(archive, 'edge-illiquid', {
      ...reservePayload('usdc', '1'),
      availableLiquidityMinor: (BigInt(amount) - 1n).toString(),
    });
    const withdrawGas = await capture(
      archive,
      'edge-withdraw-gas',
      gasPayload('WITHDRAW', amount),
    );
    await expect(
      aaveWithdraw(archive, context('edge-liquidity', '0', T0), {
        positionId: 'edge-liquidity-position',
        sharesMinor: amount,
        bookValueMinor: amount,
        reserve: illiquid,
        gas: withdrawGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'LIQUIDITY_UNAVAILABLE' });

    const staleConversion = await capture(
      archive,
      'edge-stale-conversion',
      EthUsdcConversionPayload.parse({
        ...conversionPayload,
        answerUpdatedAt: '2025-12-31T00:00:00.000Z',
        heartbeatSeconds: '1',
      }),
    );
    await expect(
      aaveSupply(archive, context('edge-feed', '0', T0), {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: 'edge-feed-position',
        allowanceId: 'edge-feed-allowance',
        currentAllowanceMinor: '0',
        reserve: capped,
        approvalGas,
        supplyGas,
        conversion: staleConversion,
      }),
    ).rejects.toMatchObject({ code: 'DATA_STALE' });
  });
});

describe('ERC-4626 captured previews and limits', () => {
  it('implements floor/ceil conversion boundaries', () => {
    expect(erc4626ConvertToShares('10', '6', '5', 'FLOOR')).toBe('8');
    expect(erc4626ConvertToShares('10', '6', '5', 'CEIL')).toBe('9');
    expect(erc4626ConvertToShares('10', '0', '0', 'FLOOR')).toBe('10');
  });

  for (const [i, amount] of STANDARD_CAPITAL.entries()) {
    it(`uses exact preview/capacity and round trips ${amount}`, async () => {
      const scenario = `capital-${i + 1}-vault`;
      const archive = new MemoryObjectArchive();
      const conversion = await capture(
        archive,
        `${scenario}-conversion`,
        conversionPayload,
      );
      const payload = Erc4626Payload.parse({
        schemaVersion: 'proof-of-alpha/erc4626-state/v1',
        chainId: '1',
        family: 'MORPHO_METAMORPHO_V1',
        vault: addr('6'),
        asset: addr('2'),
        assetDecimals: 6,
        shareDecimals: 18,
        totalAssetsMinor: '500000000000000',
        totalSupplyShares: '500000000000000000000000000',
        maxDepositAssetsMinor: '1000000000000000',
        maxMintShares: '1000000000000000000000000000',
        maxWithdrawAssetsMinor: '1000000000000000',
        maxRedeemShares: '1000000000000000000000000000',
        availableExitAssetsMinor: '1000000000000000',
        depositFeeBps: 0,
        redeemFeeBps: 0,
        testAmountAssetsMinor: amount,
        previewDepositShares: amount,
        previewMintAssetsMinor: amount,
        previewWithdrawShares: amount,
        previewRedeemAssetsMinor: amount,
      });
      const vault = await capture(archive, `${scenario}-vault`, payload);
      const depositGas = await capture(
        archive,
        `${scenario}-deposit-gas`,
        gasPayload('VAULT_DEPOSIT', amount),
      );
      const redeemGas = await capture(
        archive,
        `${scenario}-redeem-gas`,
        gasPayload('VAULT_REDEEM', amount),
        T1,
      );
      let state = portfolio(scenario, amount);
      const deposited = await vaultDeposit(
        archive,
        context(scenario, '0', T0),
        {
          amountMinor: amount,
          instrumentId: 'eth-vault-usdc',
          positionId: `${scenario}-position`,
          vault,
          gas: depositGas,
          conversion,
        },
      );
      state = applyReceipt(state, deposited.receipts[0]!);
      const redeemed = await vaultRedeem(
        archive,
        context(scenario, state.version, T1),
        {
          sharesMinor: amount,
          bookValueMinor: amount,
          positionId: `${scenario}-position`,
          vault,
          gas: redeemGas,
          conversion,
        },
      );
      state = applyReceipt(state, redeemed.receipts[0]!);
      expect(state.cash[0]!.amountUsdcMinor).toBe(amount);
      expect(state.recognizedCosts).toHaveLength(2);
    });
  }

  it('rejects captured entry capacity and exit liquidity failures', async () => {
    const archive = new MemoryObjectArchive();
    const amount = STANDARD_CAPITAL[0];
    const conversion = await capture(
      archive,
      'vault-edge-conversion',
      conversionPayload,
    );
    const gas = await capture(
      archive,
      'vault-edge-gas',
      gasPayload('VAULT_DEPOSIT', amount),
    );
    const base = {
      schemaVersion: 'proof-of-alpha/erc4626-state/v1' as const,
      chainId: '1' as const,
      family: 'MORPHO_METAMORPHO_V1' as const,
      vault: addr('6'),
      asset: addr('2'),
      assetDecimals: 6 as const,
      shareDecimals: 18,
      totalAssetsMinor: '500000000000000',
      totalSupplyShares: '500000000000000000000000000',
      maxDepositAssetsMinor: (BigInt(amount) - 1n).toString(),
      maxMintShares: amount,
      maxWithdrawAssetsMinor: amount,
      maxRedeemShares: amount,
      availableExitAssetsMinor: (BigInt(amount) - 1n).toString(),
      depositFeeBps: 0,
      redeemFeeBps: 0,
      testAmountAssetsMinor: amount,
      previewDepositShares: amount,
      previewMintAssetsMinor: amount,
      previewWithdrawShares: amount,
      previewRedeemAssetsMinor: amount,
    };
    const vault = await capture(
      archive,
      'vault-edge-state',
      Erc4626Payload.parse(base),
    );
    await expect(
      vaultDeposit(archive, context('vault-edge', '0', T0), {
        amountMinor: amount,
        instrumentId: 'eth-vault-usdc',
        positionId: 'vault-edge-position',
        vault,
        gas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const redeemGas = await capture(
      archive,
      'vault-edge-redeem-gas',
      gasPayload('VAULT_REDEEM', amount),
    );
    await expect(
      vaultRedeem(archive, context('vault-edge', '0', T0), {
        sharesMinor: amount,
        bookValueMinor: amount,
        positionId: 'vault-edge-position',
        vault,
        gas: redeemGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'LIQUIDITY_UNAVAILABLE' });
  });
});

describe('Uniswap V3 direct exact-input and USDT supply', () => {
  for (const [i, amount] of STANDARD_CAPITAL.entries()) {
    for (const direction of [
      ['usdc', 'usdt'],
      ['usdt', 'usdc'],
    ] as const) {
      it(`quotes ${direction.join('->')} separately for ${amount}`, async () => {
        const scenario = `capital-${i + 1}-${direction[0]}-${direction[1]}`;
        const archive = new MemoryObjectArchive();
        const output = (BigInt(amount) - BigInt(amount) / 1000n).toString();
        const quotePayload = UniswapV3QuotePayload.parse({
          schemaVersion: 'proof-of-alpha/uniswap-v3-exact-input-quote/v1',
          chainId: '1',
          router: addr('7'),
          quoter: addr('8'),
          pool: addr('9'),
          poolId: 'usdc-usdt-500',
          tokenIn: direction[0] === 'usdc' ? addr('2') : addr('3'),
          tokenOut: direction[1] === 'usdc' ? addr('2') : addr('3'),
          assetIn: direction[0],
          assetOut: direction[1],
          feeTier: '500',
          amountInMinor: amount,
          amountOutMinor: output,
          sqrtPriceX96After: '1',
          initializedTicksCrossed: '1',
          quoteGasEstimate: '100000',
        });
        const quote = await capture(archive, `${scenario}-quote`, quotePayload);
        const gas = await capture(
          archive,
          `${scenario}-gas`,
          gasPayload('SWAP', amount),
        );
        const conversion = await capture(
          archive,
          `${scenario}-conversion`,
          conversionPayload,
        );
        const sourceView = `eth-${direction[0]}-view`;
        let state = createPortfolio({
          experimentId: 'm2-fixture',
          scenarioId: scenario,
          portfolioId: `${scenario}-portfolio`,
          resultProvenance: 'SYNTHETIC_TEST',
          initialValueUsdcMinor: amount,
          maxDestinationAttempts: '3',
          balanceViews: [direction[0], direction[1]].sort().map((asset) => ({
            viewId: `eth-${asset}-view`,
            networkId: 'ethereum-mainnet',
            assetId: asset,
            balanceFamilyId: `eth-${asset}-family`,
            decimals: 6,
            canonicalDecimals: 6,
          })),
          initialCash: [{ viewId: sourceView, amountUsdcMinor: amount }],
        });
        const swapped = await uniswapSwap(
          archive,
          context(scenario, '0', T0, sourceView),
          {
            amountInMinor: amount,
            assetIn: direction[0],
            assetOut: direction[1],
            minimumOutMinor: output,
            sourceCashViewId: sourceView,
            destinationCashViewId: `eth-${direction[1]}-view`,
            quotes: [quote],
            gas,
            conversion,
          },
        );
        state = applyReceipt(state, swapped.receipts[0]!);
        expect(
          state.recognizedCosts.filter(
            (cost) => cost.category === 'SWAP_FEE_IMPACT',
          ),
        ).toHaveLength(1);
        expect(
          state.cash.find((cash) => cash.assetId === direction[1])!
            .amountUsdcMinor,
        ).toBe(output);
      });
    }
  }

  it('charges approval once and rejects slippage', async () => {
    const archive = new MemoryObjectArchive();
    const amount = STANDARD_CAPITAL[0];
    const gas = await capture(
      archive,
      'approval-gas',
      gasPayload('APPROVE', amount),
    );
    const conversion = await capture(
      archive,
      'approval-conversion',
      conversionPayload,
    );
    const approval = await erc20Approval(
      archive,
      context('approval-test', '0', T0),
      {
        adapterId: 'uniswap-v3-ethereum',
        operationId: 'approval-test-operation',
        allowanceId: 'approval-test-allowance',
        assetId: 'usdc',
        spenderId: 'uniswap-v3-router',
        amountMinor: amount,
        currentAllowanceMinor: '0',
        gas,
        conversion,
      },
    );
    let state = portfolio('approval-test', amount);
    state = applyReceipt(state, approval.receipts[0]!);
    expect(state.recognizedCosts).toHaveLength(1);
    expect(
      applyReceipt(state, approval.receipts[0]!).recognizedCosts,
    ).toHaveLength(1);

    const quote = await capture(
      archive,
      'slippage-quote',
      UniswapV3QuotePayload.parse({
        schemaVersion: 'proof-of-alpha/uniswap-v3-exact-input-quote/v1',
        chainId: '1',
        router: addr('7'),
        quoter: addr('8'),
        pool: addr('9'),
        poolId: 'usdc-usdt-500',
        tokenIn: addr('2'),
        tokenOut: addr('3'),
        assetIn: 'usdc',
        assetOut: 'usdt',
        feeTier: '500',
        amountInMinor: amount,
        amountOutMinor: '990000000',
        sqrtPriceX96After: '1',
        initializedTicksCrossed: '1',
        quoteGasEstimate: '100000',
      }),
    );
    const swapGas = await capture(
      archive,
      'slippage-swap-gas',
      gasPayload('SWAP', amount),
    );
    await expect(
      uniswapSwap(archive, context('slippage-test', '0', T0), {
        amountInMinor: amount,
        assetIn: 'usdc',
        assetOut: 'usdt',
        minimumOutMinor: '999000000',
        sourceCashViewId: 'eth-usdc-view',
        destinationCashViewId: 'eth-usdt-view',
        quotes: [quote],
        gas: swapGas,
        conversion,
      }),
    ).rejects.toMatchObject({ code: 'SLIPPAGE_EXCEEDED' });
  });

  it('continues a captured USDC swap into Aave USDT supply', async () => {
    const archive = new MemoryObjectArchive();
    const amount = STANDARD_CAPITAL[0];
    const output = '999000000';
    const scenario = 'capital-1-usdt-supply';
    const conversion = await capture(
      archive,
      'usdt-path-conversion',
      conversionPayload,
    );
    const quote = await capture(
      archive,
      'usdt-path-quote',
      UniswapV3QuotePayload.parse({
        schemaVersion: 'proof-of-alpha/uniswap-v3-exact-input-quote/v1',
        chainId: '1',
        router: addr('7'),
        quoter: addr('8'),
        pool: addr('9'),
        poolId: 'usdc-usdt-500',
        tokenIn: addr('2'),
        tokenOut: addr('3'),
        assetIn: 'usdc',
        assetOut: 'usdt',
        feeTier: '500',
        amountInMinor: amount,
        amountOutMinor: output,
        sqrtPriceX96After: '1',
        initializedTicksCrossed: '1',
        quoteGasEstimate: '100000',
      }),
    );
    const swapGas = await capture(
      archive,
      'usdt-path-swap-gas',
      gasPayload('SWAP', amount),
    );
    let state = createPortfolio({
      experimentId: 'm2-fixture',
      scenarioId: scenario,
      portfolioId: `${scenario}-portfolio`,
      resultProvenance: 'SYNTHETIC_TEST',
      initialValueUsdcMinor: amount,
      maxDestinationAttempts: '3',
      balanceViews: ['usdc', 'usdt'].map((asset) => ({
        viewId: `eth-${asset}-view`,
        networkId: 'ethereum-mainnet',
        assetId: asset,
        balanceFamilyId: `eth-${asset}-family`,
        decimals: 6,
        canonicalDecimals: 6,
      })),
      initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: amount }],
    });
    const swapped = await uniswapSwap(archive, context(scenario, '0', T0), {
      amountInMinor: amount,
      assetIn: 'usdc',
      assetOut: 'usdt',
      minimumOutMinor: output,
      sourceCashViewId: 'eth-usdc-view',
      destinationCashViewId: 'eth-usdt-view',
      quotes: [quote],
      gas: swapGas,
      conversion,
    });
    state = applyReceipt(state, swapped.receipts[0]!);
    const reserve = await capture(
      archive,
      'usdt-path-reserve',
      reservePayload('usdt', '1000000000000000000000000000'),
    );
    const approvalGas = await capture(
      archive,
      'usdt-path-approval-gas',
      gasPayload('APPROVE', output),
    );
    const supplyGas = await capture(
      archive,
      'usdt-path-supply-gas',
      gasPayload('SUPPLY', output),
    );
    const supplied = await aaveSupply(
      archive,
      context(scenario, state.version, T1, 'eth-usdt-view'),
      {
        amountMinor: output,
        instrumentId: 'eth-aave-usdt',
        positionId: 'usdt-aave-position',
        allowanceId: 'usdt-aave-allowance',
        currentAllowanceMinor: '0',
        reserve,
        approvalGas,
        supplyGas,
        conversion,
      },
    );
    for (const receipt of supplied.receipts)
      state = applyReceipt(state, receipt);
    expect(
      state.cash.find((cash) => cash.assetId === 'usdt')!.amountUsdcMinor,
    ).toBe('0');
    expect(state.positions[0]!.instrumentId).toBe('eth-aave-usdt');
    expect(assertPortfolio(state)).toEqual(state);
  });
});
