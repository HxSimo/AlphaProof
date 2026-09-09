import { contentHash, PoaError } from '@poa/domain';
import {
  CctpRoute,
  CctpTransfer,
  TransferLifecycleEvent,
  type AccountingCostData,
  type AccountingReceiptData,
  type CctpRouteData,
  type CctpTransferData,
  type TransferLifecycleEventData,
} from '@poa/schemas';

const fail = (
  code: 'INVALID_TRANSITION' | 'DATA_UNAVAILABLE' | 'ACCOUNTING_INVARIANT',
  message: string,
): never => {
  throw new PoaError(code, message);
};
const amount = (value: string) => BigInt(value);

export function normalizeArcBalance(
  nativeMinor18: string,
  erc20Minor6: string,
) {
  const native = amount(nativeMinor18);
  const erc20 = amount(erc20Minor6);
  if (native < 0n || erc20 < 0n)
    fail('ACCOUNTING_INVARIANT', 'Arc balances must be unsigned');
  const canonical = native / 1_000_000_000_000n;
  const dust = native % 1_000_000_000_000n;
  if (canonical !== erc20)
    fail(
      'DATA_UNAVAILABLE',
      'Arc native and ERC-20 views disagree at the same block',
    );
  return {
    balanceFamilyId: 'arc-testnet-usdc',
    canonicalUsdcMinor: erc20Minor6,
    nativeDustMinor18: dust.toString(),
  };
}

export function gasCostUsdcMinor(input: {
  gasUsed: string;
  effectiveGasPriceNativeMinor: string;
  nativeDecimals: number;
  usdcMinorNumerator: string;
  nativeUnitDenominator: string;
}) {
  const product =
    amount(input.gasUsed) *
    amount(input.effectiveGasPriceNativeMinor) *
    amount(input.usdcMinorNumerator);
  const denominator =
    10n ** BigInt(input.nativeDecimals) * amount(input.nativeUnitDenominator);
  if (denominator <= 0n)
    fail('ACCOUNTING_INVARIANT', 'Gas conversion denominator must be positive');
  return ((product + denominator - 1n) / denominator).toString();
}

export function createTransfer(
  input: Omit<
    CctpTransferData,
    | 'schemaVersion'
    | 'transferVersion'
    | 'state'
    | 'messageIdentity'
    | 'nextSequence'
    | 'destinationAttempts'
    | 'updatedAt'
    | 'closedAt'
    | 'deadlineStateHash'
    | 'invalidatedDependencyHash'
  >,
) {
  if (
    input.evidenceMode === 'LIVE_TESTNET' &&
    input.resultProvenance !== 'CROSS_CHAIN_TESTNET'
  )
    fail(
      'ACCOUNTING_INVARIANT',
      'Live testnet transfers require CROSS_CHAIN_TESTNET provenance',
    );
  if (
    input.evidenceMode === 'SYNTHETIC' &&
    input.resultProvenance !== 'SYNTHETIC_TEST'
  )
    fail(
      'ACCOUNTING_INVARIANT',
      'Synthetic transfer cannot claim another provenance',
    );
  return CctpTransfer.parse({
    schemaVersion: 'proof-of-alpha/cctp-transfer/v1',
    transferVersion: '1.0.0',
    ...input,
    state: 'RESERVED',
    messageIdentity: null,
    nextSequence: '0',
    destinationAttempts: '0',
    updatedAt: input.createdAt,
    closedAt: null,
    deadlineStateHash: null,
    invalidatedDependencyHash: null,
  });
}

function verifyEvidence(
  transfer: CctpTransferData,
  event: TransferLifecycleEventData,
) {
  if (transfer.evidenceMode === 'LIVE_TESTNET') {
    const confirmed = ['BURN_CONFIRMED', 'DESTINATION_CONFIRMED'].includes(
      event.kind,
    );
    const failed = ['SOURCE_FAILED', 'DESTINATION_FAILED'].includes(event.kind);
    if (confirmed) {
      if (
        !event.chainReceipt ||
        event.chainReceipt.status !== 'SUCCESS' ||
        event.chainReceipt.finality !== 'FINALIZED'
      )
        fail(
          'DATA_UNAVAILABLE',
          `${event.kind} requires a successful finalized chain receipt`,
        );
    } else if (failed && event.chainReceipt) {
      if (
        event.chainReceipt.status !== 'REVERTED' ||
        event.chainReceipt.finality !== 'FINALIZED'
      )
        fail(
          'DATA_UNAVAILABLE',
          `${event.kind} chain evidence must be a finalized reverted receipt`,
        );
    } else if (!failed && event.chainReceipt) {
      fail(
        'ACCOUNTING_INVARIANT',
        `${event.kind} cannot carry unrelated chain receipt evidence`,
      );
    }
    if (event.kind === 'ATTESTATION_OBSERVED' && !event.attestationHash)
      fail(
        'DATA_UNAVAILABLE',
        'Attestation readiness requires archived attestation bytes',
      );
    if (event.kind !== 'ATTESTATION_OBSERVED' && event.attestationHash)
      fail(
        'ACCOUNTING_INVARIANT',
        `${event.kind} cannot carry unrelated attestation evidence`,
      );
  } else if (event.chainReceipt || event.attestationHash) {
    fail(
      'ACCOUNTING_INVARIANT',
      'Synthetic events cannot claim chain receipts or attestations',
    );
  }
}

export function applyTransferEvent(
  currentInput: CctpTransferData,
  eventInput: TransferLifecycleEventData,
) {
  const current = CctpTransfer.parse(currentInput);
  const event = TransferLifecycleEvent.parse(eventInput);
  if (event.transferId !== current.transferId)
    fail('ACCOUNTING_INVARIANT', 'Transfer event binding mismatch');
  if (event.sequence !== current.nextSequence)
    fail('INVALID_TRANSITION', 'Transfer event sequence is not contiguous');
  if (event.occurredAt < current.updatedAt)
    fail('INVALID_TRANSITION', 'Transfer event moves backward in time');
  verifyEvidence(current, event);
  const next = structuredClone(current);
  if (event.kind === 'RESERVED') {
    if (current.state !== 'RESERVED' || event.sequence !== '0')
      fail('INVALID_TRANSITION', 'Reservation can only be recorded first');
  } else if (event.kind === 'SOURCE_FAILED') {
    if (current.state !== 'RESERVED')
      fail('INVALID_TRANSITION', 'Source failure requires a reservation');
    if (!event.reasonCode)
      fail('DATA_UNAVAILABLE', 'Source failure requires a reason code');
    next.state = 'SOURCE_FAILED';
  } else if (event.kind === 'BURN_CONFIRMED') {
    if (current.state !== 'RESERVED')
      fail('INVALID_TRANSITION', 'Burn confirmation requires a reservation');
    if (!event.messageIdentity)
      fail(
        'DATA_UNAVAILABLE',
        'Burn confirmation requires the emitted CCTP message identity',
      );
    next.state = 'ATTESTATION_PENDING';
    next.messageIdentity = event.messageIdentity;
  } else if (event.kind === 'ATTESTATION_OBSERVED') {
    if (!['ATTESTATION_PENDING', 'DESTINATION_RETRY'].includes(current.state))
      fail(
        'INVALID_TRANSITION',
        'Attestation cannot ready this transfer state',
      );
    if (
      current.state === 'DESTINATION_RETRY' &&
      amount(current.destinationAttempts) >=
        amount(current.maxDestinationAttempts)
    )
      fail(
        'INVALID_TRANSITION',
        'Destination retry bound reached; receivable remains unavailable',
      );
    if (
      !current.messageIdentity ||
      event.messageIdentity !== current.messageIdentity
    )
      fail('INVALID_TRANSITION', 'Attestation message identity changed');
    next.state = 'READY_TO_RECEIVE';
  } else if (event.kind === 'ATTESTATION_DELAYED') {
    if (current.state !== 'ATTESTATION_PENDING')
      fail('INVALID_TRANSITION', 'Only a pending attestation can be delayed');
    if (
      !current.messageIdentity ||
      event.messageIdentity !== current.messageIdentity
    )
      fail(
        'INVALID_TRANSITION',
        'Delayed attestation message identity changed',
      );
    if (!event.reasonCode)
      fail('DATA_UNAVAILABLE', 'Delayed attestation requires a reason code');
  } else if (event.kind === 'DESTINATION_FAILED') {
    if (current.state !== 'READY_TO_RECEIVE')
      fail(
        'INVALID_TRANSITION',
        'Destination attempt requires ready attestation',
      );
    if (
      !current.messageIdentity ||
      event.messageIdentity !== current.messageIdentity
    )
      fail('INVALID_TRANSITION', 'Destination retry message identity changed');
    if (!event.reasonCode)
      fail('DATA_UNAVAILABLE', 'Destination failure requires a reason code');
    if (
      amount(current.destinationAttempts) >=
      amount(current.maxDestinationAttempts)
    )
      fail('INVALID_TRANSITION', 'Destination retry bound reached');
    next.destinationAttempts = (
      amount(current.destinationAttempts) + 1n
    ).toString();
    next.state = 'DESTINATION_RETRY';
  } else if (event.kind === 'DESTINATION_CONFIRMED') {
    if (current.state !== 'READY_TO_RECEIVE')
      fail('INVALID_TRANSITION', 'Settlement requires ready attestation');
    if (
      !current.messageIdentity ||
      event.messageIdentity !== current.messageIdentity
    )
      fail(
        'INVALID_TRANSITION',
        'Destination receipt message identity changed',
      );
    next.state = 'SETTLED';
  } else if (event.kind === 'DEPENDENCY_INVALIDATED') {
    if (['SOURCE_FAILED', 'SETTLED'].includes(current.state))
      fail(
        'INVALID_TRANSITION',
        'Final transfer state cannot be invalidated; settlement evidence must be finalized before credit',
      );
    if (!event.reasonCode)
      fail('DATA_UNAVAILABLE', 'Invalidation requires a reason code');
    next.state = 'INVALIDATED';
    next.invalidatedDependencyHash = event.sourceHash;
  } else {
    if (!event.reasonCode)
      fail('DATA_UNAVAILABLE', 'Closure requires a reason code');
    if (!current.closedAt) {
      next.closedAt = event.occurredAt;
      next.deadlineStateHash = contentHash(current);
    }
  }
  next.nextSequence = (amount(current.nextSequence) + 1n).toString();
  next.updatedAt = event.occurredAt;
  return CctpTransfer.parse(next);
}

export function replayTransfer(
  initial: CctpTransferData,
  events: TransferLifecycleEventData[],
) {
  let transfer = CctpTransfer.parse(initial);
  const hashes = [contentHash(transfer)];
  for (const event of events) {
    transfer = applyTransferEvent(transfer, event);
    transfer = CctpTransfer.parse(JSON.parse(JSON.stringify(transfer)));
    hashes.push(contentHash(transfer));
  }
  return { transfer, hashes };
}

export function accountingReceiptForTransferEvent(input: {
  before: CctpTransferData;
  after: CctpTransferData;
  event: TransferLifecycleEventData;
  expectedPortfolioVersion: string;
  costs?: AccountingCostData[];
}): AccountingReceiptData | null {
  const { before, after, event } = input;
  const costs = input.costs ?? [];
  const base = {
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1' as const,
    accountingVersion: '1.0.0' as const,
    operationId: event.eventId,
    experimentId: before.experimentId,
    scenarioId: before.scenarioId,
    expectedPortfolioVersion: input.expectedPortfolioVersion,
    observedAt: event.occurredAt,
    resultProvenance: before.resultProvenance,
    sourceHashes: [
      ...new Set([event.sourceHash, ...costs.map((cost) => cost.sourceHash)]),
    ],
  };
  if (event.kind === 'RESERVED')
    return {
      ...base,
      kind: 'RESERVE',
      reservationId: before.reservationId,
      cashViewId: before.sourceCashViewId,
      amountUsdcMinor: before.amountUsdcMinor,
      costs: [],
    };
  if (event.kind === 'SOURCE_FAILED')
    return {
      ...base,
      kind: 'TRANSFER_SOURCE_FAILED',
      reservationId: before.reservationId,
      costs,
    };
  if (event.kind === 'BURN_CONFIRMED')
    return {
      ...base,
      kind: 'TRANSFER_BURNED',
      reservationId: before.reservationId,
      transferId: before.transferId,
      messageIdentity: after.messageIdentity!,
      destinationNetworkId: routeDestination(after.routeId),
      destinationCashViewId: before.destinationCashViewId,
      netReceivableUsdcMinor: before.netReceivableUsdcMinor,
      costs,
    };
  if (event.kind === 'ATTESTATION_OBSERVED')
    return {
      ...base,
      kind: 'TRANSFER_READY',
      transferId: before.transferId,
      costs,
    };
  if (event.kind === 'ATTESTATION_DELAYED')
    return {
      ...base,
      kind: 'TRANSFER_DELAYED',
      transferId: before.transferId,
      costs,
    };
  if (event.kind === 'DESTINATION_FAILED')
    return {
      ...base,
      kind: 'TRANSFER_DESTINATION_RETRY',
      transferId: before.transferId,
      costs,
    };
  if (event.kind === 'DESTINATION_CONFIRMED')
    return {
      ...base,
      kind: 'TRANSFER_SETTLED',
      transferId: before.transferId,
      destinationCreditUsdcMinor: before.netReceivableUsdcMinor,
      costs,
    };
  return null;
}

function routeDestination(routeId: string): string {
  if (routeId === 'cctp-sepolia-to-arc-testnet') return 'arc-testnet';
  if (routeId === 'cctp-arc-testnet-to-sepolia') return 'ethereum-sepolia';
  return fail('ACCOUNTING_INVARIANT', `Unknown frozen route ${routeId}`);
}

export function validateRoute(routeInput: CctpRouteData) {
  const route = CctpRoute.parse(routeInput);
  if (
    route.sourceNetworkId === route.destinationNetworkId ||
    route.sourceDomain === route.destinationDomain
  )
    fail('ACCOUNTING_INVARIANT', 'CCTP endpoints must be distinct');
  if (
    route.sourceNetworkId === 'ethereum-sepolia' &&
    (route.sourceChainId !== '11155111' || route.sourceDomain !== 0)
  )
    fail('ACCOUNTING_INVARIANT', 'Sepolia route identity mismatch');
  if (
    route.sourceNetworkId === 'arc-testnet' &&
    (route.sourceChainId !== '5042002' || route.sourceDomain !== 26)
  )
    fail('ACCOUNTING_INVARIANT', 'Arc Testnet route identity mismatch');
  return route;
}

export function relayerCost(input: {
  costId: string;
  networkId: string;
  amountUsdcMinor: string;
  sourceHash: `0x${string}`;
}): AccountingCostData {
  if (amount(input.amountUsdcMinor) <= 0n)
    fail(
      'ACCOUNTING_INVARIANT',
      'Relayer charge must be positive when recorded',
    );
  return {
    ...input,
    category: 'RELAYER',
    funding: 'PAYABLE',
    cashBalanceFamilyId: null,
  };
}
