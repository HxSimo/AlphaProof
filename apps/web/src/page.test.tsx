import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { DashboardResponseData } from '@poa/schemas';
import { DashboardView } from '../app/dashboard-view.js';

const hash = `0x${'1'.repeat(64)}`;
const scenario = (initial: '1000000000' | '10000000000' | '100000000000') => ({
  scenarioId: `capital-${initial}`,
  initialAmountUsdcMinor: initial,
  checkpoint: {
    checkpointAt: '2026-09-10T12:00:00.000Z',
    resultProvenance: 'SYNTHETIC_TEST',
    observationSetHash: hash,
    amountQuoteHash: hash,
    agent: {
      portfolio: {
        cash: [
          {
            balanceFamilyId: `cash-${initial}`,
            networkId: 'ethereum-mainnet',
            assetId: 'usdc',
            amountUsdcMinor: initial,
          },
        ],
        positions: [
          {
            positionId: `position-${initial}`,
            networkId: 'ethereum-mainnet',
            instrumentId: 'eth-aave-usdc',
            bookValueUsdcMinor: '1000000',
            sharesMinor: '1000000',
          },
        ],
        receivables: [],
      },
    },
  },
  descriptiveEvaluation: {
    agent: {
      markValueUsdcMinor: initial,
      liquidationValueUsdcMinor: initial,
      availableUsdcMinor: initial,
      investedMarkUsdcMinor: '0',
      inTransitUsdcMinor: '0',
      blockedValueUsdcMinor: '0',
      cumulativeCostsUsdcMinor: '0',
      drawdownMarkBps: '0',
      dataQuality: 'FRESH',
    },
    cashReference: { markValueUsdcMinor: initial },
    conservativeYieldReference: { markValueUsdcMinor: initial },
    differenceVsCashMarkUsdcMinor: '0',
    differenceVsConservativeYieldMarkUsdcMinor: '0',
    comparisonAvailability: { conservativeYield: true },
  },
  eligibility: {
    operationalStatus: 'COMPLIANT',
    economicStatus: 'CRITERIA_MET',
    statisticalStatus: 'NOT_ASSESSED',
    overallStatus: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
    reasonCodes: ['PROVENANCE_SYNTHETIC_TEST'],
  },
});

it('renders canonical three-scenario, reference, status, evidence and proof fields', () => {
  const data = {
    resultProvenance: 'SYNTHETIC_TEST',
    scenarios: [
      scenario('1000000000'),
      scenario('10000000000'),
      scenario('100000000000'),
    ],
    commitment: {
      batch: {
        batchId: 'batch-one',
        firstSequence: '1',
        lastSequence: '3',
        root: hash,
      },
      registryReceipt: { transactionHash: hash },
    },
    incidents: [],
    limitations: ['Synthetic fixture; never real-capital eligible.'],
  } as unknown as DashboardResponseData;
  const html = renderToStaticMarkup(createElement(DashboardView, { data }));
  expect(html).toContain('1,000.000000 USDC');
  expect(html).toContain('10,000.000000 USDC');
  expect(html).toContain('100,000.000000 USDC');
  expect(html).toContain('Frozen conservative-yield reference');
  expect(html).toContain('Cash by network');
  expect(html).toContain('Open positions');
  expect(html).toContain('eth-aave-usdc');
  expect(html).toContain('No capital in transit');
  expect(html).toContain('NOT_ASSESSED');
  expect(html).toContain('NOT_ELIGIBLE_FOR_REAL_CAPITAL');
  expect(html).toContain('Correlated policy views · n = 1');
  expect(html).toContain('Selected proof verified');
  expect(html).toContain(hash);
  expect(html).toContain('Automatic funding disabled');
});
