import { z } from 'zod';
import {
  Id,
  Hash,
  Int,
  PositiveUInt,
  Provenance,
  Timestamp,
  UInt,
} from './primitives.js';

export const AccountingVersion = z.literal('1.0.0');
export const TransferAccountingState = z.enum([
  'IN_TRANSIT',
  'READY_TO_RECEIVE',
  'DELAYED',
  'DESTINATION_RETRY',
]);
export const CostFunding = z.enum(['AVAILABLE_CASH', 'PAYABLE', 'WITHHELD']);
export const AccountingCost = z.strictObject({
  costId: Id,
  category: z.enum([
    'APPROVAL_GAS',
    'EXECUTION_GAS',
    'SOURCE_GAS',
    'DESTINATION_GAS',
    'RETRY_GAS',
    'PROTOCOL_FEE',
    'SWAP_FEE_IMPACT',
    'TRANSFER_FEE',
    'RELAYER',
  ]),
  funding: CostFunding,
  amountUsdcMinor: PositiveUInt,
  networkId: Id,
  cashBalanceFamilyId: Id.nullable(),
  sourceHash: Hash,
});

export const BalanceView = z.strictObject({
  viewId: Id,
  networkId: Id,
  assetId: Id,
  balanceFamilyId: Id,
  decimals: z.number().int().min(0).max(36),
  canonicalDecimals: z.number().int().min(0).max(36),
});
export const CashBalance = z.strictObject({
  balanceFamilyId: Id,
  networkId: Id,
  assetId: Id,
  amountUsdcMinor: UInt,
});
export const Reservation = z.strictObject({
  reservationId: Id,
  operationId: Id,
  balanceFamilyId: Id,
  networkId: Id,
  assetId: Id,
  amountUsdcMinor: PositiveUInt,
});
export const AccountingPosition = z.strictObject({
  positionId: Id,
  networkId: Id,
  instrumentId: Id,
  assetId: Id,
  sharesMinor: PositiveUInt,
  indexNumerator: PositiveUInt,
  indexDenominator: PositiveUInt,
  bookValueUsdcMinor: UInt,
  roundingRemainderNumerator: UInt,
  lastSourceHash: Hash,
  lastObservedAt: Timestamp,
});
export const AccountingReceivable = z.strictObject({
  transferId: Id,
  messageIdentity: Id,
  sourceNetworkId: Id,
  destinationNetworkId: Id,
  destinationBalanceFamilyId: Id,
  amountUsdcMinor: PositiveUInt,
  state: TransferAccountingState,
  destinationAttempts: UInt,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const FeePayable = z.strictObject({
  payableId: Id,
  costId: Id,
  networkId: Id,
  amountUsdcMinor: PositiveUInt,
});
export const Allowance = z.strictObject({
  allowanceId: Id,
  networkId: Id,
  assetId: Id,
  spenderId: Id,
  amountMinor: UInt,
});
export const RecognizedCost = AccountingCost.extend({ operationId: Id });
export const AppliedAccountingReceipt = z.strictObject({
  operationId: Id,
  receiptHash: Hash,
  versionApplied: PositiveUInt,
});

export const ShadowPortfolio = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/shadow-portfolio/v1'),
  accountingVersion: AccountingVersion,
  experimentId: Id,
  scenarioId: Id,
  portfolioId: Id,
  resultProvenance: Provenance,
  unitOfAccount: z.literal('USDC'),
  unitDecimals: z.literal(6),
  initialValueUsdcMinor: PositiveUInt,
  maxDestinationAttempts: PositiveUInt,
  version: UInt,
  balanceViews: z.array(BalanceView),
  cash: z.array(CashBalance),
  reservations: z.array(Reservation),
  positions: z.array(AccountingPosition),
  receivables: z.array(AccountingReceivable),
  payables: z.array(FeePayable),
  allowances: z.array(Allowance),
  recognizedCosts: z.array(RecognizedCost),
  modeledPnlUsdcMinor: Int,
  appliedReceipts: z.array(AppliedAccountingReceipt),
  lastAppliedAt: Timestamp.nullable(),
  closedAt: Timestamp.nullable(),
  deadlineStateHash: Hash.nullable(),
});

const ReceiptBase = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/accounting-receipt/v1'),
  accountingVersion: AccountingVersion,
  operationId: Id,
  experimentId: Id,
  scenarioId: Id,
  expectedPortfolioVersion: UInt,
  observedAt: Timestamp,
  resultProvenance: Provenance,
  sourceHashes: z.array(Hash).min(1),
});
const base = ReceiptBase.shape;
const costs = { costs: z.array(AccountingCost) };
export const AccountingReceipt = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('NO_EFFECT'),
    status: z.enum(['REJECTED_BEFORE_ATTEMPT', 'SKIPPED']),
    reasonCode: z.string().min(1),
    costs: z.tuple([]),
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('RESERVE'),
    reservationId: Id,
    cashViewId: Id,
    amountUsdcMinor: PositiveUInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('COST'),
    status: z.literal('FAILED_AFTER_ATTEMPT'),
    reasonCode: z.string().min(1),
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('APPROVE'),
    allowanceId: Id,
    networkId: Id,
    assetId: Id,
    spenderId: Id,
    amountMinor: UInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('DEPOSIT'),
    cashViewId: Id,
    positionId: Id,
    instrumentId: Id,
    sharesCreditMinor: PositiveUInt,
    indexNumerator: PositiveUInt,
    indexDenominator: PositiveUInt,
    inputUsdcMinor: PositiveUInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('WITHDRAW'),
    cashViewId: Id,
    positionId: Id,
    sharesDebitMinor: PositiveUInt,
    cashCreditUsdcMinor: UInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('SWAP'),
    sourceCashViewId: Id,
    destinationCashViewId: Id,
    sourceDebitUsdcMinor: PositiveUInt,
    destinationCreditUsdcMinor: UInt,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('PAYABLE_SETTLED'),
    payableId: Id,
    cashViewId: Id,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_SOURCE_FAILED'),
    reservationId: Id,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_BURNED'),
    reservationId: Id,
    transferId: Id,
    messageIdentity: Id,
    destinationNetworkId: Id,
    destinationCashViewId: Id,
    netReceivableUsdcMinor: PositiveUInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_READY'),
    transferId: Id,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_DELAYED'),
    transferId: Id,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_DESTINATION_RETRY'),
    transferId: Id,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('TRANSFER_SETTLED'),
    transferId: Id,
    destinationCreditUsdcMinor: UInt,
  }),
  z.strictObject({
    ...base,
    ...costs,
    kind: z.literal('ACCRUE'),
    positionId: Id,
    nextIndexNumerator: PositiveUInt,
    nextIndexDenominator: PositiveUInt,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('CLOSE'),
    closedAt: Timestamp,
    costs: z.tuple([]),
  }),
]);

export const PositionValuationInput = z.strictObject({
  positionId: Id,
  markValueUsdcMinor: UInt.nullable(),
  recoverableUsdcMinor: UInt.nullable(),
  exitCostUsdcMinor: UInt.nullable(),
  dataQuality: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
  sourceHash: Hash,
  observedAt: Timestamp,
});
export const PortfolioValuation = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/portfolio-valuation/v1'),
  accountingVersion: AccountingVersion,
  portfolioHash: Hash,
  portfolioVersion: UInt,
  markValueUsdcMinor: UInt.nullable(),
  liquidationValueUsdcMinor: UInt.nullable(),
  availableUsdcMinor: UInt,
  reservedUsdcMinor: UInt,
  inTransitUsdcMinor: UInt,
  blockedValueUsdcMinor: UInt.nullable(),
  feesPayableUsdcMinor: UInt,
  dataQuality: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
  sourceHashes: z.array(Hash),
  reasonCodes: z.array(
    z.enum([
      'DATA_UNAVAILABLE',
      'STALE_DATA',
      'IN_TRANSIT_UNAVAILABLE',
      'BLOCKED_LIQUIDITY',
    ]),
  ),
});

export type ShadowPortfolioData = z.infer<typeof ShadowPortfolio>;
export type AccountingReceiptData = z.infer<typeof AccountingReceipt>;
export type AccountingCostData = z.infer<typeof AccountingCost>;
export type PositionValuationInputData = z.infer<typeof PositionValuationInput>;
export type PortfolioValuationData = z.infer<typeof PortfolioValuation>;
