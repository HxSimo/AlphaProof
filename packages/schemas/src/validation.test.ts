import { describe, expect, it } from 'vitest';
import {
  ActionIntent,
  CommitmentBatch,
  Allocation,
  Amount,
  EvaluationReceipt,
  ExperimentPolicy,
  Int,
  TransferReceipt,
  UInt,
  ValuationCheckpoint,
  YieldSchedule,
} from './index.js';

const hash = '0x' + 'ab'.repeat(32);
const time = '2026-09-08T10:00:00.000Z';
const allocation = [
  {
    networkId: 'ethereum-mainnet',
    instrumentId: 'eth-cash-usdc',
    weightBps: 10000,
  },
];
describe('canonical boundaries', () => {
  it('supports the full uint256 range without floating point', () => {
    expect(UInt.parse(((1n << 256n) - 1n).toString())).toBe(
      ((1n << 256n) - 1n).toString(),
    );
    expect(UInt.safeParse((1n << 256n).toString()).success).toBe(false);
  });
  it('supports the full canonical int256 range for modeled PnL', () => {
    const minimum = -(1n << 255n);
    const maximum = (1n << 255n) - 1n;
    expect(Int.parse(minimum.toString())).toBe(minimum.toString());
    expect(Int.parse(maximum.toString())).toBe(maximum.toString());
    expect(Int.safeParse((minimum - 1n).toString()).success).toBe(false);
    expect(Int.safeParse((maximum + 1n).toString()).success).toBe(false);
    for (const invalid of ['-0', '+1', '01', '-01', '1.0'])
      expect(Int.safeParse(invalid).success).toBe(false);
  });
  it.each([1000, 1n, '-1', '01', '1e3', '1.0', '+1', '', ' 1'])(
    'rejects noncanonical amount %#',
    (v) => expect(UInt.safeParse(v).success).toBe(false),
  );
  it('requires explicit amounts/scales/asset identities', () => {
    const a = {
      networkId: 'arc-testnet',
      assetId: 'usdc',
      assetAddress: '0x' + '12'.repeat(20),
      decimals: 6,
      minor: '1000000',
    };
    expect(Amount.safeParse(a).success).toBe(true);
    expect(Amount.safeParse({ ...a, decimals: 37 }).success).toBe(false);
    expect(Amount.safeParse({ ...a, minor: 1000000 }).success).toBe(false);
  });
  it('rejects allocation sum, duplicate, order and unknown-field ambiguities', () => {
    expect(Allocation.safeParse(allocation).success).toBe(true);
    expect(
      Allocation.safeParse([{ ...allocation[0], weightBps: 9999 }]).success,
    ).toBe(false);
    expect(
      Allocation.safeParse([
        { ...allocation[0], weightBps: 5000 },
        { ...allocation[0], weightBps: 5000 },
      ]).success,
    ).toBe(false);
    expect(
      Allocation.safeParse([{ ...allocation[0], extra: true }]).success,
    ).toBe(false);
    expect(
      Allocation.safeParse([
        { networkId: 'z', instrumentId: 'x', weightBps: 5000 },
        { networkId: 'a', instrumentId: 'x', weightBps: 5000 },
      ]).success,
    ).toBe(false);
  });
  it('requires all signed policy/scenario/version/cost bindings', () => {
    const intent = {
      schemaVersion: 'proof-of-alpha/action-intent/v1',
      experimentId: 'exp-one',
      capitalScenarioId: 'capital-1k',
      agentId: 'agent-one',
      declaredVersionHash: hash,
      policyHash: hash,
      transferPolicyHash: hash,
      networkProfile: 'ETHEREUM_MAINNET_FORWARD',
      nonce: '0',
      expectedPortfolioVersion: '0',
      validUntil: '1800000000',
      targetAllocation: allocation,
      maxCostUsdcMinor: '1000000',
      maxTransferUsdcMinor: '0',
      maxSlippageBps: 10,
    };
    expect(ActionIntent.safeParse(intent).success).toBe(true);
    for (const field of Object.keys(intent)) {
      const invalid: Record<string, unknown> = { ...intent };
      delete invalid[field];
      expect(ActionIntent.safeParse(invalid).success, field).toBe(false);
    }
  });
  it('refuses a policy locked after its start', () => {
    const p = {
      schemaVersion: 'proof-of-alpha/experiment-policy/v1',
      experimentId: 'exp-one',
      agentId: 'agent-one',
      declaredVersionHash: hash,
      profileId: 'ethereum-forward',
      profileVersion: '0.1.0',
      profileHash: hash,
      manifestBundleHash: hash,
      configurationHash: hash,
      adapterSetHash: hash,
      parserSetHash: hash,
      transferPolicyHash: hash,
      startsAt: time,
      endsAt: '2026-10-08T10:00:00.000Z',
      lockedAt: time,
      networkProfile: 'ETHEREUM_MAINNET_FORWARD',
      resultProvenance: 'FORWARD_SHADOW',
      engineVersions: {
        accounting: '0.1.0',
        planner: '0.1.0',
        execution: '0.1.0',
        valuation: '0.1.0',
        evaluation: '0.1.0',
      },
      engineSourceHash: hash,
      adapterVersions: [
        { adapterId: 'aave', version: '0.1.0', sourceHash: hash },
      ],
      signingDomain: {
        name: 'Proof of Alpha',
        version: '1',
        chainId: '5042002',
        verifyingContract: '0x' + '12'.repeat(20),
      },
      automaticFundingEnabled: false,
    };
    expect(ExperimentPolicy.safeParse(p).success).toBe(true);
    expect(
      ExperimentPolicy.safeParse({ ...p, lockedAt: '2026-09-09T10:00:00.000Z' })
        .success,
    ).toBe(false);
    expect(ExperimentPolicy.safeParse({ ...p, endsAt: time }).success).toBe(
      false,
    );
  });
});
describe('evidence boundaries', () => {
  it('binds finite test yield to a prospective funded live deployment', () => {
    const schedule = {
      schemaVersion: 'proof-of-alpha/yield-schedule/v1',
      scheduleId: 'arc-schedule-one',
      networkId: 'arc-testnet',
      vaultAddress: null,
      assetAddress: '0x' + '12'.repeat(20),
      assetDecimals: 6,
      budgetAssetMinor: '100000',
      startsAt: '2026-09-09T12:01:00.000Z',
      endsAt: '2026-09-10T12:01:00.000Z',
      frozenAt: '2026-09-09T10:00:00.000Z',
      experimentStartsAt: '2026-09-09T12:00:00.000Z',
      fundingTransactionHash: null,
      deploymentTransactionHash: null,
      sourceHashes: [hash],
      evidenceMode: 'SYNTHETIC',
    };
    expect(YieldSchedule.safeParse(schedule).success).toBe(true);
    expect(
      YieldSchedule.safeParse({
        ...schedule,
        evidenceMode: 'LIVE_TESTNET',
      }).success,
    ).toBe(false);
    expect(
      YieldSchedule.safeParse({
        ...schedule,
        frozenAt: schedule.experimentStartsAt,
      }).success,
    ).toBe(false);
    expect(
      YieldSchedule.safeParse({
        ...schedule,
        fundingTransactionHash: hash,
      }).success,
    ).toBe(false);
  });
  it('rejects malformed sequence strings without throwing out of safeParse', () => {
    const batch = {
      schemaVersion: 'proof-of-alpha/commitment-batch/v1',
      experimentId: 'exp-one',
      batchId: 'batch-one',
      firstSequence: '1',
      lastSequence: '2',
      root: hash,
      previousBatchHash: null,
      leavesObjectHash: hash,
      mode: 'PERIODIC_AFTER_RECEIPT',
      registryNetworkId: 'arc-testnet',
      status: 'PENDING',
      transactionHash: null,
      block: null,
    };
    expect(CommitmentBatch.safeParse(batch).success).toBe(true);
    for (const firstSequence of ['1.1', '1e3', '-1', '', '9'])
      expect(
        CommitmentBatch.safeParse({ ...batch, firstSequence }).success,
      ).toBe(false);
    expect(
      CommitmentBatch.safeParse({ ...batch, status: 'CONFIRMED' }).success,
    ).toBe(false);
  });
  const report = {
    schemaVersion: 'proof-of-alpha/evaluation-receipt/v1',
    experimentId: 'exp-one',
    scenarioId: 'capital-1k',
    policyHash: hash,
    checkpointHash: hash,
    resultProvenance: 'FORWARD_SHADOW',
    networkProfile: 'ETHEREUM_MAINNET_FORWARD',
    operationalStatus: 'COMPLIANT',
    economicStatus: 'CRITERIA_MET',
    statisticalStatus: 'CRITERION_MET',
    statisticalMethodVersion: '1.0.0',
    overallStatus: 'ELIGIBLE_UNDER_POLICY',
    reasonCodes: [],
    supersedesHash: null,
    automaticFundingEnabled: false,
  };
  it.each([
    'HISTORICAL_REPLAY',
    'SYNTHETIC_TEST',
    'CROSS_CHAIN_TESTNET',
    'MIXED_DIAGNOSTIC',
    'LIVE_SEPARATE',
  ])('cannot promote %s into eligibility', (provenance) => {
    expect(
      EvaluationReceipt.safeParse({ ...report, resultProvenance: provenance })
        .success,
    ).toBe(false);
    expect(
      EvaluationReceipt.safeParse({
        ...report,
        resultProvenance: provenance,
        overallStatus: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
      }).success,
    ).toBe(true);
  });
  it('requires a statistical method and all dimensions for eligibility', () => {
    expect(EvaluationReceipt.safeParse(report).success).toBe(true); // schema case, not an evaluated result
    for (const change of [
      { statisticalMethodVersion: null },
      { statisticalStatus: 'NOT_ASSESSED' },
      { operationalStatus: 'VIOLATION' },
      { economicStatus: 'UNASSESSABLE' },
      { networkProfile: 'CROSS_CHAIN_TESTNET' },
      { automaticFundingEnabled: true },
    ])
      expect(
        EvaluationReceipt.safeParse({ ...report, ...change }).success,
      ).toBe(false);
  });
  it('never labels absent or stale valuation inputs fresh', () => {
    const v = {
      schemaVersion: 'proof-of-alpha/valuation-checkpoint/v1',
      experimentId: 'exp-one',
      scenarioId: 'capital-1k',
      portfolioId: 'portfolio-one',
      portfolioVersion: '0',
      policyHash: hash,
      resultProvenance: 'SYNTHETIC_TEST',
      valuationVersion: '0.1.0',
      at: time,
      markValueUsdcMinor: null,
      liquidationValueUsdcMinor: null,
      availableUsdcMinor: '0',
      inTransitUsdcMinor: '0',
      blockedValueUsdcMinor: null,
      dataQuality: 'UNAVAILABLE',
      inputs: [],
      reasonCodes: ['DATA_UNAVAILABLE'],
    };
    expect(ValuationCheckpoint.safeParse(v).success).toBe(true);
    expect(
      ValuationCheckpoint.safeParse({
        ...v,
        dataQuality: 'FRESH',
        markValueUsdcMinor: '0',
        liquidationValueUsdcMinor: '0',
      }).success,
    ).toBe(false);
  });
  it('refuses real attestations for a shadow burn and credit before settlement', () => {
    const r = {
      schemaVersion: 'proof-of-alpha/transfer-receipt/v1',
      experimentId: 'exp-one',
      scenarioId: 'capital-1k',
      transferId: 'transfer-one',
      state: 'IN_TRANSIT',
      resultProvenance: 'SYNTHETIC_TEST',
      executionMode: 'SIMULATED',
      messageHash: null,
      sourceTransactionHash: null,
      destinationTransactionHash: null,
      attestationObjectHash: null,
      delayModelVersion: '0.1.0',
      netReceivableUsdcMinor: '100',
      destinationCreditUsdcMinor: '0',
      costs: [],
      sourceBlock: null,
      destinationBlock: null,
      observedAt: time,
      sequence: '1',
    };
    expect(TransferReceipt.safeParse(r).success).toBe(true);
    for (const change of [
      { attestationObjectHash: hash },
      { sourceTransactionHash: hash },
      { destinationCreditUsdcMinor: '100' },
      { state: 'SETTLED' },
      { delayModelVersion: null },
    ])
      expect(TransferReceipt.safeParse({ ...r, ...change }).success).toBe(
        false,
      );
  });
});
