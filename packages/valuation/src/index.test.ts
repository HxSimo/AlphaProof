import { describe, expect, it } from 'vitest';
import { applyReceipt, createPortfolio } from '@poa/accounting';
import { contentHash } from '@poa/domain';
import {
  checkpointPortfolio,
  createScenarioCheckpoint,
  makeReferences,
} from './index.js';

const at0 = '2026-09-09T10:00:00.000Z';
const at1 = '2026-09-09T10:05:00.000Z';
const hash = contentHash('m4-source');
function initial(amount = '1000000000') {
  return createPortfolio({
    experimentId: 'experiment-m4',
    scenarioId: 'capital-1000',
    portfolioId: 'experiment-m4-capital-1000',
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: amount,
    maxDestinationAttempts: '3',
    balanceViews: [
      {
        viewId: 'eth-usdc-view',
        networkId: 'ethereum-mainnet',
        assetId: 'usdc',
        balanceFamilyId: 'eth-usdc-family',
        decimals: 6,
        canonicalDecimals: 6,
      },
    ],
    initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: amount }],
  });
}
function invested() {
  return applyReceipt(initial(), {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: 'agent-deposit',
    experimentId: 'experiment-m4',
    scenarioId: 'capital-1000',
    expectedPortfolioVersion: '0',
    observedAt: at0,
    resultProvenance: 'SYNTHETIC_TEST',
    sourceHashes: [hash],
    kind: 'DEPOSIT',
    costs: [],
    cashViewId: 'eth-usdc-view',
    positionId: 'agent-position',
    instrumentId: 'eth-aave-usdc',
    sharesCreditMinor: '400000000',
    indexNumerator: '1',
    indexDenominator: '1',
    inputUsdcMinor: '400000000',
  });
}

describe('M4 valuation', () => {
  it('freezes exactly two equal-capital references with distinct identities', () => {
    const refs = makeReferences(initial(), at0, '2026-10-09T10:00:00.000Z');
    expect(refs).toHaveLength(2);
    expect(refs.map((x) => x.kind)).toEqual(['CASH', 'CONSERVATIVE_YIELD']);
    expect(
      new Set([
        initial().portfolioId,
        ...refs.map((x) => x.portfolio.portfolioId),
      ]).size,
    ).toBe(3);
    expect(
      refs.every(
        (x) =>
          x.portfolio.initialValueUsdcMinor === '1000000000' &&
          !x.replacementAllowed,
      ),
    ).toBe(true);
  });

  it('accrues an inactive position and keeps mark, liquidation, blocked and cost views separate', () => {
    const result = checkpointPortfolio({
      checkpointId: 'checkpoint-1',
      role: 'AGENT',
      referenceStatus: null,
      comparisonAvailable: true,
      portfolio: invested(),
      accruals: [
        {
          positionId: 'agent-position',
          nextIndexNumerator: '101',
          nextIndexDenominator: '100',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
      valuations: [
        {
          positionId: 'agent-position',
          markValueUsdcMinor: '404000000',
          recoverableUsdcMinor: '403000000',
          exitCostUsdcMinor: '100000',
          dataQuality: 'FRESH',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
    });
    expect(result.portfolio.positions[0]?.bookValueUsdcMinor).toBe('404000000');
    expect(result.portfolio.modeledPnlUsdcMinor).toBe('4000000');
    expect(result.valuation.markValueUsdcMinor).toBe('1004000000');
    expect(result.valuation.liquidationValueUsdcMinor).toBe('1002900000');
    expect(result.valuation.blockedValueUsdcMinor).toBe('1000000');
  });

  it('keeps stale and unavailable values explicit and rejects mixed capital', () => {
    const stale = checkpointPortfolio({
      checkpointId: 'checkpoint-stale',
      role: 'AGENT',
      referenceStatus: null,
      comparisonAvailable: true,
      portfolio: invested(),
      accruals: [
        {
          positionId: 'agent-position',
          nextIndexNumerator: '1',
          nextIndexDenominator: '1',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
      valuations: [
        {
          positionId: 'agent-position',
          markValueUsdcMinor: null,
          recoverableUsdcMinor: null,
          exitCostUsdcMinor: null,
          dataQuality: 'UNAVAILABLE',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
    });
    expect(stale.valuation.markValueUsdcMinor).toBeNull();
    expect(stale.valuation.reasonCodes).toContain('DATA_UNAVAILABLE');
    const staleButValued = checkpointPortfolio({
      checkpointId: 'checkpoint-stale-valued',
      role: 'AGENT',
      referenceStatus: null,
      comparisonAvailable: true,
      portfolio: invested(),
      accruals: [
        {
          positionId: 'agent-position',
          nextIndexNumerator: '1',
          nextIndexDenominator: '1',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
      valuations: [
        {
          positionId: 'agent-position',
          markValueUsdcMinor: '400000000',
          recoverableUsdcMinor: '400000000',
          exitCostUsdcMinor: '1',
          dataQuality: 'STALE',
          sourceHash: hash,
          observedAt: at1,
        },
      ],
    });
    expect(staleButValued.valuation.dataQuality).toBe('STALE');
    expect(staleButValued.valuation.reasonCodes).toContain('STALE_DATA');
    const [cash, yieldRef] = makeReferences(
      initial(),
      at0,
      '2026-10-09T10:00:00.000Z',
    );
    const cashCp = checkpointPortfolio({
      checkpointId: 'checkpoint-x',
      role: 'CASH_REFERENCE',
      referenceStatus: 'ACTIVE',
      comparisonAvailable: true,
      portfolio: cash.portfolio,
      accruals: [],
      valuations: [],
    });
    const yieldCp = checkpointPortfolio({
      checkpointId: 'checkpoint-x',
      role: 'CONSERVATIVE_YIELD_REFERENCE',
      referenceStatus: 'ACTIVE',
      comparisonAvailable: true,
      portfolio: yieldRef.portfolio,
      accruals: [],
      valuations: [],
    });
    expect(() =>
      createScenarioCheckpoint({
        checkpointId: 'checkpoint-x',
        sequence: '1',
        checkpointAt: at1,
        observationSetHash: hash,
        amountQuoteHash: hash,
        agent: stale,
        cashReference: cashCp,
        conservativeYieldReference: {
          ...yieldCp,
          portfolio: {
            ...yieldCp.portfolio,
            initialValueUsdcMinor: '10000000000',
          },
        },
      }),
    ).toThrow(/equal initial capital/);
  });
});
