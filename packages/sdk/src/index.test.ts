import { describe, expect, it } from 'vitest';
import { contentHash, privateKeyToAccount, type Hex } from '@poa/domain';
import {
  actionTypedDataHash,
  buildAllocation,
  canonicalSignedBytes,
  recoverActionSigner,
  signAction,
  verifySignedBytes,
} from './index.js';

const hash = contentHash('fixture');
const account = privateKeyToAccount(`0x${'44'.repeat(32)}` as Hex);
const policy = {
  schemaVersion: 'proof-of-alpha/experiment-policy/v1' as const,
  experimentId: 'sdk-experiment',
  agentId: 'sdk-agent',
  declaredVersionHash: hash,
  profileId: 'synthetic-m3-local',
  profileVersion: '0.1.0',
  profileHash: hash,
  manifestBundleHash: hash,
  configurationHash: hash,
  adapterSetHash: hash,
  parserSetHash: hash,
  transferPolicyHash: contentHash('transfer'),
  startsAt: '2026-09-09T00:00:00.000Z',
  endsAt: '2026-09-10T00:00:00.000Z',
  lockedAt: '2026-09-09T00:00:00.000Z',
  networkProfile: 'ETHEREUM_MAINNET_FORWARD' as const,
  resultProvenance: 'SYNTHETIC_TEST' as const,
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
const intent = {
  schemaVersion: 'proof-of-alpha/action-intent/v1' as const,
  experimentId: policy.experimentId,
  capitalScenarioId: 'capital-1k',
  agentId: policy.agentId,
  declaredVersionHash: policy.declaredVersionHash,
  policyHash: contentHash(policy),
  transferPolicyHash: policy.transferPolicyHash,
  networkProfile: policy.networkProfile,
  nonce: '1',
  expectedPortfolioVersion: '0',
  validUntil: '1800000000',
  targetAllocation: buildAllocation([
    {
      networkId: 'ethereum-mainnet',
      instrumentId: 'eth-cash-usdc',
      weightBps: 6000,
    },
    {
      networkId: 'ethereum-mainnet',
      instrumentId: 'eth-aave-usdc',
      weightBps: 4000,
    },
  ]),
  maxCostUsdcMinor: '1000000',
  maxTransferUsdcMinor: '0',
  maxSlippageBps: 10,
};

describe('external signed-intent SDK', () => {
  it('sorts allocations and signs exact deterministic EIP-712 content', async () => {
    expect(intent.targetAllocation[0]!.instrumentId).toBe('eth-aave-usdc');
    const envelope = await signAction(intent, policy, 'sdk-idempotency-0001', {
      getAddress: async () => account.address,
      signTypedData: (data) => account.signTypedData(data),
    });
    expect(
      await recoverActionSigner(intent, policy, envelope.request.signature),
    ).toBe(account.address.toLowerCase());
    expect(verifySignedBytes(envelope, policy).typedDataHash).toBe(
      actionTypedDataHash(intent, policy),
    );
    expect(envelope.signedBytes).toBe(canonicalSignedBytes(intent, policy));
  });
  it('binds domain, allocation order and exact signed bytes', async () => {
    const envelope = await signAction(intent, policy, 'sdk-idempotency-0002', {
      getAddress: async () => account.address,
      signTypedData: (data) => account.signTypedData(data),
    });
    const differentDomain = {
      ...policy,
      signingDomain: { ...policy.signingDomain, chainId: '31338' },
    };
    expect(
      await recoverActionSigner(
        intent,
        differentDomain,
        envelope.request.signature,
      ),
    ).not.toBe(account.address.toLowerCase());
    expect(() =>
      verifySignedBytes(
        { ...envelope, signedBytes: `${envelope.signedBytes.slice(0, -2)}00` },
        policy,
      ),
    ).toThrow();
    expect(() =>
      buildAllocation([
        {
          networkId: 'ethereum-mainnet',
          instrumentId: 'eth-cash-usdc',
          weightBps: 9999,
        },
      ]),
    ).toThrow();
  });
});
