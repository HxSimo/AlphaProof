import { describe, expect, it } from 'vitest';
import { createPortfolio } from '@poa/accounting';
import { loadBundle } from '@poa/config';
import { contentHash } from '@poa/domain';
import { planAllocation } from './index.js';

const loaded = loadBundle();
const base = loaded.bundle.profiles.profiles.find(
  (x) => x.profileId === 'ethereum-forward',
)!;
const profile = {
  ...base,
  profileId: 'synthetic-m3-local',
  enabled: true,
  resultProvenance: 'SYNTHETIC_TEST' as const,
  requiredDependencyIds: [],
};
const hash = contentHash('planner');
const policy = {
  schemaVersion: 'proof-of-alpha/experiment-policy/v1' as const,
  experimentId: 'planner-exp',
  agentId: 'planner-agent',
  declaredVersionHash: hash,
  profileId: profile.profileId,
  profileVersion: profile.profileVersion,
  profileHash: hash,
  manifestBundleHash: hash,
  configurationHash: hash,
  adapterSetHash: hash,
  parserSetHash: hash,
  transferPolicyHash: hash,
  startsAt: '2026-09-09T00:00:00.000Z',
  endsAt: '2026-09-10T00:00:00.000Z',
  lockedAt: '2026-09-09T00:00:00.000Z',
  networkProfile: profile.networkProfile,
  resultProvenance: profile.resultProvenance,
  engineVersions: {
    accounting: '1.0.0',
    planner: '1.0.0',
    execution: '1.0.0',
    valuation: '0.1.0',
    evaluation: '0.1.0',
  },
  engineSourceHash: hash,
  adapterVersions: [
    { adapterId: 'aave-v3-ethereum', version: '1.0.0', sourceHash: hash },
  ],
  signingDomain: {
    name: 'Proof of Alpha' as const,
    version: '1' as const,
    chainId: '31337',
    verifyingContract: '0x' + '00'.repeat(20),
  },
  automaticFundingEnabled: false as const,
};
const portfolio = createPortfolio({
  experimentId: policy.experimentId,
  scenarioId: 'capital-1k',
  portfolioId: 'planner-portfolio',
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
const intent = (changes = {}) => ({
  schemaVersion: 'proof-of-alpha/action-intent/v1' as const,
  experimentId: policy.experimentId,
  capitalScenarioId: portfolio.scenarioId,
  agentId: policy.agentId,
  declaredVersionHash: policy.declaredVersionHash,
  policyHash: contentHash(policy),
  transferPolicyHash: policy.transferPolicyHash,
  networkProfile: policy.networkProfile,
  nonce: '1',
  expectedPortfolioVersion: '0',
  validUntil: '1800000000',
  targetAllocation: [
    {
      networkId: 'ethereum-mainnet',
      instrumentId: 'eth-aave-usdc',
      weightBps: 4000,
    },
    {
      networkId: 'ethereum-mainnet',
      instrumentId: 'eth-cash-usdc',
      weightBps: 6000,
    },
  ],
  maxCostUsdcMinor: '10000000',
  maxTransferUsdcMinor: '0',
  maxSlippageBps: 10,
  ...changes,
});

describe('M3 deterministic planner', () => {
  it('derives exact dependency-ordered amounts', () => {
    const a = planAllocation(policy, portfolio, intent(), {
      actionId: 'action-one',
      receivedAt: policy.startsAt,
      profile,
      assetAddresses: {
        'ethereum-mainnet/usdc': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
    });
    const b = planAllocation(policy, portfolio, intent(), {
      actionId: 'action-one',
      receivedAt: policy.startsAt,
      profile,
      assetAddresses: {
        'ethereum-mainnet/usdc': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
    });
    expect(a).toEqual(b);
    expect(a.steps.map((x) => [x.kind, x.input.minor])).toEqual([
      ['APPROVE', '400000000'],
      ['DEPOSIT', '400000000'],
    ]);
  });
  it.each([
    {
      targetAllocation: [
        {
          networkId: 'ethereum-mainnet',
          instrumentId: 'eth-aave-usdc',
          weightBps: 5000,
        },
        {
          networkId: 'ethereum-mainnet',
          instrumentId: 'eth-cash-usdc',
          weightBps: 5000,
        },
      ],
    },
    { maxSlippageBps: 11 },
    {
      targetAllocation: [
        {
          networkId: 'ethereum-mainnet',
          instrumentId: 'eth-vault-usdc',
          weightBps: 4000,
        },
        {
          networkId: 'ethereum-mainnet',
          instrumentId: 'eth-cash-usdc',
          weightBps: 6000,
        },
      ],
    },
  ])('rejects policy boundary %#', (change) =>
    expect(() =>
      planAllocation(policy, portfolio, intent(change), {
        actionId: 'action-edge',
        receivedAt: policy.startsAt,
        profile,
        assetAddresses: {
          'ethereum-mainnet/usdc': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        },
      }),
    ).toThrow(),
  );
});
