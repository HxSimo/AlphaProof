import { describe, expect, it } from 'vitest';
import {
  applyReceipt,
  createPortfolio,
  globalBookValue,
} from '@poa/accounting';
import { contentHash, PoaError } from '@poa/domain';
import type {
  AccountingReceiptData,
  TransferLifecycleEventData,
} from '@poa/schemas';
import {
  accountingReceiptForTransferEvent,
  applyTransferEvent,
  createTransfer,
  gasCostUsdcMinor,
  normalizeArcBalance,
  relayerCost,
  replayTransfer,
  validateRoute,
} from './index.js';

const h = (c: string) => `0x${c.repeat(64)}` as `0x${string}`;
const route = {
  schemaVersion: 'proof-of-alpha/cctp-route/v1' as const,
  routeId: 'cctp-sepolia-to-arc-testnet',
  sourceNetworkId: 'ethereum-sepolia',
  destinationNetworkId: 'arc-testnet',
  sourceChainId: '11155111',
  destinationChainId: '5042002',
  sourceDomain: 0,
  destinationDomain: 26,
  sourceUsdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  destinationUsdc: '0x3600000000000000000000000000000000000000',
  sourceTokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
  destinationMessageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
  tokenDecimals: 6 as const,
  sourceNativeGasDecimals: 18,
  destinationNativeGasDecimals: 18,
  transferMode: 'STANDARD' as const,
  minFinalityThreshold: 2000 as const,
  maxDestinationAttempts: 2,
  delayedAfterSeconds: 3600,
  attestationBaseUrl: 'https://iris-api-sandbox.circle.com',
  enabled: false,
};
const initialTransfer = () =>
  createTransfer({
    transferId: 'transfer-one',
    experimentId: 'experiment-one',
    scenarioId: 'scenario-one',
    routeId: route.routeId,
    reservationId: 'reservation-one',
    sourceCashViewId: 'sepolia-usdc',
    destinationCashViewId: 'arc-usdc-erc20',
    amountUsdcMinor: '100000000',
    netReceivableUsdcMinor: '99999000',
    evidenceMode: 'SYNTHETIC',
    resultProvenance: 'SYNTHETIC_TEST',
    createdAt: '2026-09-09T10:00:00.000Z',
    maxDestinationAttempts: '2',
  });
const event = (
  sequence: number,
  kind: TransferLifecycleEventData['kind'],
  at: number,
  extra: Partial<TransferLifecycleEventData> = {},
): TransferLifecycleEventData => ({
  schemaVersion: 'proof-of-alpha/transfer-event/v1',
  transferVersion: '1.0.0',
  eventId: `event-${sequence}-${kind.toLowerCase().replaceAll('_', '-')}`,
  transferId: 'transfer-one',
  sequence: String(sequence),
  kind,
  messageIdentity: null,
  sourceHash: h(String((sequence % 9) + 1)),
  occurredAt: `2026-09-09T10:${String(at).padStart(2, '0')}:00.000Z`,
  chainReceipt: null,
  attestationHash: null,
  reasonCode: null,
  ...extra,
});

describe('M5 transfer mechanics', () => {
  it('validates route domains separately from chain IDs and Arc aliases once', () => {
    expect(validateRoute(route).destinationDomain).toBe(26);
    expect(() => validateRoute({ ...route, sourceDomain: 11155111 })).toThrow(
      PoaError,
    );
    expect(normalizeArcBalance('1234567000000000000', '1234567')).toEqual({
      balanceFamilyId: 'arc-testnet-usdc',
      canonicalUsdcMinor: '1234567',
      nativeDustMinor18: '0',
    });
    expect(
      normalizeArcBalance('1234567000000000042', '1234567').nativeDustMinor18,
    ).toBe('42');
    expect(() => normalizeArcBalance('1234567000000000000', '1234568')).toThrow(
      /disagree/,
    );
  });

  it('ceil-charges per-chain gas and represents prefunding as a payable', () => {
    expect(
      gasCostUsdcMinor({
        gasUsed: '21000',
        effectiveGasPriceNativeMinor: '1000000000',
        nativeDecimals: 18,
        usdcMinorNumerator: '2500000000',
        nativeUnitDenominator: '1',
      }),
    ).toBe('52500');
    expect(
      gasCostUsdcMinor({
        gasUsed: '1',
        effectiveGasPriceNativeMinor: '1',
        nativeDecimals: 18,
        usdcMinorNumerator: '1000000',
        nativeUnitDenominator: '1',
      }),
    ).toBe('1');
    expect(
      relayerCost({
        costId: 'relayer-one',
        networkId: 'arc-testnet',
        amountUsdcMinor: '9',
        sourceHash: h('a'),
      }).funding,
    ).toBe('PAYABLE');
  });

  it('replays burn, delayed attestation, retry and one settlement deterministically', () => {
    const events = [
      event(0, 'RESERVED', 0),
      event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
      event(2, 'ATTESTATION_DELAYED', 2, {
        messageIdentity: 'message-one',
        reasonCode: 'ATTESTATION_PENDING',
      }),
      event(3, 'ATTESTATION_OBSERVED', 3, { messageIdentity: 'message-one' }),
      event(4, 'DESTINATION_FAILED', 4, {
        messageIdentity: 'message-one',
        reasonCode: 'RPC_FAILURE',
      }),
      event(5, 'ATTESTATION_OBSERVED', 5, { messageIdentity: 'message-one' }),
      event(6, 'DESTINATION_CONFIRMED', 6, { messageIdentity: 'message-one' }),
    ];
    const a = replayTransfer(initialTransfer(), events);
    const b = replayTransfer(
      JSON.parse(JSON.stringify(initialTransfer())),
      JSON.parse(JSON.stringify(events)),
    );
    expect(a.transfer.state).toBe('SETTLED');
    expect(a.transfer.destinationAttempts).toBe('1');
    expect(a.hashes).toEqual(b.hashes);
    expect(() =>
      applyTransferEvent(
        a.transfer,
        event(7, 'DESTINATION_CONFIRMED', 7, {
          messageIdentity: 'message-one',
        }),
      ),
    ).toThrow(/Settlement requires/);
  });

  it('requires receipts and attestations in live mode and keeps synthetic evidence distinct', () => {
    const live = {
      ...initialTransfer(),
      evidenceMode: 'LIVE_TESTNET' as const,
      resultProvenance: 'CROSS_CHAIN_TESTNET' as const,
    };
    const reserved = applyTransferEvent(live, event(0, 'RESERVED', 0));
    expect(() =>
      applyTransferEvent(
        reserved,
        event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
      ),
    ).toThrow(/finalized chain receipt/);
    expect(() =>
      applyTransferEvent(
        initialTransfer(),
        event(0, 'RESERVED', 0, { attestationHash: h('f') }),
      ),
    ).toThrow(/Synthetic/);
    const provisionalReceipt = {
      networkId: 'ethereum-sepolia',
      chainId: '11155111',
      transactionHash: h('a'),
      blockNumber: '1',
      blockHash: h('b'),
      transactionIndex: '0',
      status: 'SUCCESS' as const,
      finality: 'PROVISIONAL' as const,
      gasUsed: '1',
      effectiveGasPriceNativeMinor: '1',
      rawObjectHash: h('c'),
      observedAt: '2026-09-09T10:01:00.000Z',
    };
    expect(() =>
      applyTransferEvent(
        reserved,
        event(1, 'BURN_CONFIRMED', 1, {
          messageIdentity: 'message-one',
          chainReceipt: provisionalReceipt,
        }),
      ),
    ).toThrow(/finalized/);
    expect(() =>
      applyTransferEvent(
        reserved,
        event(1, 'SOURCE_FAILED', 1, {
          reasonCode: 'SOURCE_REVERT',
          chainReceipt: {
            ...provisionalReceipt,
            finality: 'FINALIZED',
          },
        }),
      ),
    ).toThrow(/reverted receipt/);
  });

  it('preserves one source debit, unavailable receivable, costs and one destination credit', () => {
    let portfolio = createPortfolio({
      experimentId: 'experiment-one',
      scenarioId: 'scenario-one',
      portfolioId: 'portfolio-one',
      resultProvenance: 'SYNTHETIC_TEST',
      initialValueUsdcMinor: '1000000000',
      maxDestinationAttempts: '2',
      balanceViews: [
        {
          viewId: 'sepolia-usdc',
          networkId: 'ethereum-sepolia',
          assetId: 'usdc',
          balanceFamilyId: 'sepolia-usdc',
          decimals: 6,
          canonicalDecimals: 6,
        },
        {
          viewId: 'arc-usdc-native',
          networkId: 'arc-testnet',
          assetId: 'usdc',
          balanceFamilyId: 'arc-usdc',
          decimals: 18,
          canonicalDecimals: 6,
        },
        {
          viewId: 'arc-usdc-erc20',
          networkId: 'arc-testnet',
          assetId: 'usdc',
          balanceFamilyId: 'arc-usdc',
          decimals: 6,
          canonicalDecimals: 6,
        },
      ],
      initialCash: [{ viewId: 'sepolia-usdc', amountUsdcMinor: '1000000000' }],
    });
    let transfer = initialTransfer();
    const events = [
      event(0, 'RESERVED', 0),
      event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
      event(2, 'ATTESTATION_OBSERVED', 2, { messageIdentity: 'message-one' }),
      event(3, 'DESTINATION_CONFIRMED', 3, { messageIdentity: 'message-one' }),
    ];
    for (const e of events) {
      const next = applyTransferEvent(transfer, e);
      const receipt = accountingReceiptForTransferEvent({
        before: transfer,
        after: next,
        event: e,
        expectedPortfolioVersion: portfolio.version,
        costs:
          e.kind === 'BURN_CONFIRMED'
            ? [
                {
                  costId: 'transfer-fee-one',
                  category: 'TRANSFER_FEE',
                  funding: 'WITHHELD',
                  amountUsdcMinor: '1000',
                  networkId: 'ethereum-sepolia',
                  cashBalanceFamilyId: null,
                  sourceHash: e.sourceHash,
                },
              ]
            : [],
      });
      if (receipt) portfolio = applyReceipt(portfolio, receipt);
      transfer = next;
    }
    expect(portfolio.receivables).toHaveLength(0);
    expect(
      portfolio.cash.find((x) => x.balanceFamilyId === 'arc-usdc')
        ?.amountUsdcMinor,
    ).toBe('99999000');
    expect(globalBookValue(portfolio)).toBe('999999000');
    const duplicate = accountingReceiptForTransferEvent({
      before: initialTransfer(),
      after: applyTransferEvent(initialTransfer(), events[0]!),
      event: events[0]!,
      expectedPortfolioVersion: '0',
    }) as AccountingReceiptData;
    const once = applyReceipt(
      createPortfolio({
        experimentId: 'experiment-one',
        scenarioId: 'scenario-one',
        portfolioId: 'p-two',
        resultProvenance: 'SYNTHETIC_TEST',
        initialValueUsdcMinor: '1000000000',
        maxDestinationAttempts: '2',
        balanceViews: portfolio.balanceViews,
        initialCash: [
          { viewId: 'sepolia-usdc', amountUsdcMinor: '1000000000' },
        ],
      }),
      duplicate,
    );
    expect(contentHash(applyReceipt(once, duplicate))).toBe(contentHash(once));
  });

  it('freezes the deadline view while permitting later reconciliation', () => {
    let transfer = initialTransfer();
    transfer = applyTransferEvent(transfer, event(0, 'RESERVED', 0));
    transfer = applyTransferEvent(
      transfer,
      event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
    );
    transfer = applyTransferEvent(
      transfer,
      event(2, 'CLOSURE_RECORDED', 2, { reasonCode: 'EXPERIMENT_CLOSED' }),
    );
    const frozen = transfer.deadlineStateHash;
    transfer = applyTransferEvent(
      transfer,
      event(3, 'ATTESTATION_OBSERVED', 3, { messageIdentity: 'message-one' }),
    );
    transfer = applyTransferEvent(
      transfer,
      event(4, 'DESTINATION_CONFIRMED', 4, { messageIdentity: 'message-one' }),
    );
    expect(transfer.state).toBe('SETTLED');
    expect(transfer.deadlineStateHash).toBe(frozen);
  });

  it('invalidates a reorg-dependent pending transfer without releasing capital', () => {
    let transfer = initialTransfer();
    transfer = applyTransferEvent(transfer, event(0, 'RESERVED', 0));
    transfer = applyTransferEvent(
      transfer,
      event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
    );
    transfer = applyTransferEvent(
      transfer,
      event(2, 'DEPENDENCY_INVALIDATED', 2, {
        messageIdentity: 'message-one',
        reasonCode: 'SOURCE_BLOCK_REORG',
      }),
    );
    expect(transfer.state).toBe('INVALIDATED');
    expect(transfer.invalidatedDependencyHash).toBe(h('3'));
    expect(transfer.netReceivableUsdcMinor).toBe('99999000');
    expect(() =>
      applyTransferEvent(
        transfer,
        event(3, 'ATTESTATION_OBSERVED', 3, {
          messageIdentity: 'message-one',
        }),
      ),
    ).toThrow(/cannot ready/);
  });

  it('stops destination retries at the frozen bound', () => {
    let transfer = initialTransfer();
    transfer = applyTransferEvent(transfer, event(0, 'RESERVED', 0));
    transfer = applyTransferEvent(
      transfer,
      event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'message-one' }),
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      transfer = applyTransferEvent(
        transfer,
        event(2 + attempt * 2, 'ATTESTATION_OBSERVED', 2 + attempt * 2, {
          messageIdentity: 'message-one',
        }),
      );
      transfer = applyTransferEvent(
        transfer,
        event(3 + attempt * 2, 'DESTINATION_FAILED', 3 + attempt * 2, {
          messageIdentity: 'message-one',
          reasonCode: 'DESTINATION_RPC',
        }),
      );
    }
    expect(transfer.destinationAttempts).toBe('2');
    expect(transfer.state).toBe('DESTINATION_RETRY');
    expect(() =>
      applyTransferEvent(
        transfer,
        event(6, 'ATTESTATION_OBSERVED', 6, {
          messageIdentity: 'message-one',
        }),
      ),
    ).toThrow(/retry bound/);
  });
});
