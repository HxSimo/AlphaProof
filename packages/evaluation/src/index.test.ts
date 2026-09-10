import { expect, it } from 'vitest';
import { contentHash } from '@poa/domain';
import { createPortfolio } from '@poa/accounting';
import {
  checkpointPortfolio,
  createScenarioCheckpoint,
  makeReferences,
} from '@poa/valuation';
import { evaluateEligibility, evaluateScenario, replayM4 } from './index.js';

it('reports descriptive drawdown, fixed-reference availability and one correlated policy sample', () => {
  const at0 = '2026-09-09T10:00:00.000Z';
  const at1 = '2026-09-09T10:05:00.000Z';
  const source = contentHash('evaluation-source');
  const portfolio = createPortfolio({
    experimentId: 'experiment-eval',
    scenarioId: 'capital-1000',
    portfolioId: 'experiment-eval-capital-1000',
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: '1000000000',
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
    initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: '1000000000' }],
  });
  const [cash, conservative] = makeReferences(
    portfolio,
    at0,
    '2026-10-09T10:00:00.000Z',
  );
  const agent = checkpointPortfolio({
    checkpointId: 'checkpoint-eval',
    role: 'AGENT',
    referenceStatus: null,
    comparisonAvailable: true,
    portfolio,
    accruals: [],
    valuations: [],
  });
  const cashCp = checkpointPortfolio({
    checkpointId: 'checkpoint-eval',
    role: 'CASH_REFERENCE',
    referenceStatus: 'ACTIVE',
    comparisonAvailable: true,
    portfolio: cash.portfolio,
    accruals: [],
    valuations: [],
  });
  const yieldCp = checkpointPortfolio({
    checkpointId: 'checkpoint-eval',
    role: 'CONSERVATIVE_YIELD_REFERENCE',
    referenceStatus: 'ENTRY_FAILED',
    comparisonAvailable: false,
    portfolio: conservative.portfolio,
    accruals: [],
    valuations: [],
  });
  const checkpoint = createScenarioCheckpoint({
    checkpointId: 'checkpoint-eval',
    sequence: '1',
    checkpointAt: at1,
    observationSetHash: source,
    amountQuoteHash: source,
    agent,
    cashReference: cashCp,
    conservativeYieldReference: yieldCp,
  });
  const evaluation = evaluateScenario(checkpoint, ['1100000000']);
  expect(evaluation.agent.drawdownMarkBps).toBe('909');
  expect(evaluation.differenceVsCashMarkUsdcMinor).toBe('0');
  expect(evaluation.differenceVsConservativeYieldMarkUsdcMinor).toBeNull();
  expect(evaluation.comparisonAvailability.conservativeYield).toBe(false);
  expect(evaluation.effectiveIndependentSampleCount).toBe('1');
  expect(evaluation.statisticalStatus).toBe('NOT_ASSESSED');
  expect(evaluation.realCapitalEligibility).toBe(
    'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
  );
  const { checkpointHash: _hash, ...body } = checkpoint;
  expect(
    replayM4({
      schemaVersion: 'proof-of-alpha/m4-replay-bundle/v1',
      checkpoint: body,
      priorAgentMarksUsdcMinor: ['1100000000'],
      rawObjects: [],
      checkpointInputs: null,
      expectedCheckpointHash: checkpoint.checkpointHash,
      expectedEvaluation: evaluation,
    }).evaluation.evaluationHash,
  ).toBe(evaluation.evaluationHash);
});

it.each([
  ['HISTORICAL_REPLAY', 'ETHEREUM_MAINNET_FORWARD'],
  ['SYNTHETIC_TEST', 'ETHEREUM_MAINNET_FORWARD'],
  ['CROSS_CHAIN_TESTNET', 'CROSS_CHAIN_TESTNET'],
  ['MIXED_DIAGNOSTIC', 'MIXED_DIAGNOSTIC'],
] as const)(
  'excludes %s before otherwise-passing criteria',
  (provenance, profile) => {
    const receipt = evaluateEligibility({
      experimentId: 'eligibility-experiment',
      scenarioId: 'capital-1k',
      policyHash: contentHash('policy'),
      checkpointHash: contentHash('checkpoint'),
      resultProvenance: provenance,
      networkProfile: profile,
      operationalStatus: 'COMPLIANT',
      economicStatus: 'CRITERIA_MET',
      statisticalStatus: 'CRITERION_MET',
      statisticalMethodVersion: '1.0.0',
    });
    expect(receipt.overallStatus).toBe('NOT_ELIGIBLE_FOR_REAL_CAPITAL');
    expect(receipt.reasonCodes[0]).toBe(`PROVENANCE_${provenance}`);
    expect(receipt.automaticFundingEnabled).toBe(false);
  },
);

it('keeps compliance, economics and disabled inference separate', () => {
  const receipt = evaluateEligibility({
    experimentId: 'eligibility-experiment',
    scenarioId: 'capital-1k',
    policyHash: contentHash('policy'),
    checkpointHash: contentHash('checkpoint'),
    resultProvenance: 'FORWARD_SHADOW',
    networkProfile: 'ETHEREUM_MAINNET_FORWARD',
    operationalStatus: 'COMPLIANT',
    economicStatus: 'CRITERIA_MET',
    statisticalStatus: 'NOT_ASSESSED',
    statisticalMethodVersion: null,
  });
  expect(receipt.operationalStatus).toBe('COMPLIANT');
  expect(receipt.economicStatus).toBe('CRITERIA_MET');
  expect(receipt.statisticalStatus).toBe('NOT_ASSESSED');
  expect(receipt.overallStatus).toBe('INSUFFICIENT_EVIDENCE');
  expect(receipt.reasonCodes).toContain('INFERENCE_DISABLED');
});
