import { z } from 'zod';
import {
  Address,
  Hash,
  Id,
  Provenance,
  Timestamp,
  UInt,
} from './primitives.js';

export const TransferVersion = z.literal('1.0.0');
export const TransferLifecycleState = z.enum([
  'RESERVED',
  'SOURCE_FAILED',
  'ATTESTATION_PENDING',
  'READY_TO_RECEIVE',
  'DESTINATION_RETRY',
  'SETTLED',
  'INVALIDATED',
]);
export const TransferEvidenceMode = z.enum(['SYNTHETIC', 'LIVE_TESTNET']);

export const CctpRoute = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/cctp-route/v1'),
  routeId: Id,
  sourceNetworkId: Id,
  destinationNetworkId: Id,
  sourceChainId: UInt,
  destinationChainId: UInt,
  sourceDomain: z.number().int().min(0).max(0xffffffff),
  destinationDomain: z.number().int().min(0).max(0xffffffff),
  sourceUsdc: Address,
  destinationUsdc: Address,
  sourceTokenMessenger: Address,
  destinationMessageTransmitter: Address,
  tokenDecimals: z.literal(6),
  sourceNativeGasDecimals: z.number().int().min(0).max(36),
  destinationNativeGasDecimals: z.number().int().min(0).max(36),
  transferMode: z.literal('STANDARD'),
  minFinalityThreshold: z.literal(2000),
  maxDestinationAttempts: z.number().int().positive(),
  delayedAfterSeconds: z.number().int().positive(),
  attestationBaseUrl: z.string().url(),
  enabled: z.boolean(),
});

export const ChainReceiptEvidence = z.strictObject({
  networkId: Id,
  chainId: UInt,
  transactionHash: Hash,
  blockNumber: UInt,
  blockHash: Hash,
  transactionIndex: UInt,
  status: z.enum(['SUCCESS', 'REVERTED']),
  finality: z.enum(['PROVISIONAL', 'FINALIZED', 'INVALIDATED']),
  gasUsed: UInt,
  effectiveGasPriceNativeMinor: UInt,
  rawObjectHash: Hash,
  observedAt: Timestamp,
});

export const TransferLifecycleEvent = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/transfer-event/v1'),
  transferVersion: TransferVersion,
  eventId: Id,
  transferId: Id,
  sequence: UInt,
  kind: z.enum([
    'RESERVED',
    'SOURCE_FAILED',
    'BURN_CONFIRMED',
    'ATTESTATION_OBSERVED',
    'ATTESTATION_DELAYED',
    'DESTINATION_FAILED',
    'DESTINATION_CONFIRMED',
    'DEPENDENCY_INVALIDATED',
    'CLOSURE_RECORDED',
  ]),
  messageIdentity: Id.nullable(),
  sourceHash: Hash,
  occurredAt: Timestamp,
  chainReceipt: ChainReceiptEvidence.nullable(),
  attestationHash: Hash.nullable(),
  reasonCode: z.string().min(1).nullable(),
});

export const CctpTransfer = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/cctp-transfer/v1'),
  transferVersion: TransferVersion,
  transferId: Id,
  experimentId: Id,
  scenarioId: Id,
  routeId: Id,
  reservationId: Id,
  sourceCashViewId: Id,
  destinationCashViewId: Id,
  amountUsdcMinor: UInt,
  netReceivableUsdcMinor: UInt,
  state: TransferLifecycleState,
  evidenceMode: TransferEvidenceMode,
  resultProvenance: Provenance,
  messageIdentity: Id.nullable(),
  nextSequence: UInt,
  destinationAttempts: UInt,
  maxDestinationAttempts: UInt,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  closedAt: Timestamp.nullable(),
  deadlineStateHash: Hash.nullable(),
  invalidatedDependencyHash: Hash.nullable(),
});

export const M5ReplayBundle = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/m5-replay-bundle/v1'),
    initial: CctpTransfer,
    events: z.array(TransferLifecycleEvent).min(1),
  })
  .superRefine((value, ctx) => {
    value.events.forEach((event, index) => {
      if (
        event.transferId !== value.initial.transferId ||
        BigInt(event.sequence) !== BigInt(index)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['events', index],
          message: 'Replay events must bind one transfer in contiguous order',
        });
    });
  });

export const YieldSchedule = z
  .strictObject({
    schemaVersion: z.literal('proof-of-alpha/yield-schedule/v1'),
    scheduleId: Id,
    networkId: Id,
    vaultAddress: Address.nullable(),
    assetAddress: Address,
    assetDecimals: z.literal(6),
    budgetAssetMinor: UInt,
    startsAt: Timestamp,
    endsAt: Timestamp,
    frozenAt: Timestamp,
    experimentStartsAt: Timestamp,
    fundingTransactionHash: Hash.nullable(),
    deploymentTransactionHash: Hash.nullable(),
    sourceHashes: z.array(Hash).min(1),
    evidenceMode: TransferEvidenceMode,
  })
  .superRefine((value, ctx) => {
    if (value.startsAt >= value.endsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Yield schedule must end after it starts',
      });
    if (value.frozenAt >= value.experimentStartsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['frozenAt'],
        message: 'Yield schedule must be frozen before experiment start',
      });
    if (
      value.evidenceMode === 'LIVE_TESTNET' &&
      (value.vaultAddress === null ||
        value.fundingTransactionHash === null ||
        value.deploymentTransactionHash === null)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['evidenceMode'],
        message:
          'Live schedules require a deployed vault and genuine deployment/funding evidence',
      });
    if (
      value.evidenceMode === 'SYNTHETIC' &&
      (value.fundingTransactionHash !== null ||
        value.deploymentTransactionHash !== null)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['evidenceMode'],
        message: 'Synthetic schedules cannot claim transaction evidence',
      });
  });

export type CctpRouteData = z.infer<typeof CctpRoute>;
export type CctpTransferData = z.infer<typeof CctpTransfer>;
export type TransferLifecycleEventData = z.infer<typeof TransferLifecycleEvent>;
export type YieldScheduleData = z.infer<typeof YieldSchedule>;
export type M5ReplayBundleData = z.infer<typeof M5ReplayBundle>;
