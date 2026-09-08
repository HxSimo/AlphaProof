import { contentHash, PoaError } from '@poa/domain';
import {
  AccountingReceipt,
  PortfolioValuation,
  PositionValuationInput,
  ShadowPortfolio,
  type AccountingCostData,
  type AccountingReceiptData,
  type PortfolioValuationData,
  type PositionValuationInputData,
  type ShadowPortfolioData,
} from '@poa/schemas';

const UINT256_LIMIT = 1n << 256n;
const UINT_PATTERN = /^(0|[1-9][0-9]{0,77})$/;
const by =
  <T>(key: (value: T) => string) =>
  (a: T, b: T) =>
    key(a).localeCompare(key(b));
const uint = (value: string) => {
  if (!UINT_PATTERN.test(value)) fail(`Invalid canonical uint: ${value}`);
  const parsed = BigInt(value);
  if (parsed >= UINT256_LIMIT) fail(`Canonical uint exceeds uint256: ${value}`);
  return parsed;
};
const text = (value: bigint) => value.toString();
const total = (values: readonly string[]) =>
  values.reduce((sum, value) => sum + uint(value), 0n);
function fail(message: string): never {
  throw new PoaError('ACCOUNTING_INVARIANT', message);
}
function transition(message: string): never {
  throw new PoaError('INVALID_TRANSITION', message);
}
function requireUInt(value: bigint, label: string) {
  if (value < 0n || value >= UINT256_LIMIT) fail(`${label} is outside uint256`);
  return value;
}
function unique<T>(
  items: readonly T[],
  key: (value: T) => string,
  label: string,
) {
  if (new Set(items.map(key)).size !== items.length) fail(`Duplicate ${label}`);
}

export interface ScaleResult {
  valueMinor: string;
  remainder: {
    kind: 'EXACT' | 'DISCARDED' | 'ADDED';
    amountSourceMinor: string;
    denominator: string;
  };
}

export function mulDiv(
  multiplicand: string,
  multiplier: string,
  denominator: string,
  rounding: 'FLOOR' | 'CEIL',
): ScaleResult {
  const a = uint(multiplicand);
  const b = uint(multiplier);
  const d = uint(denominator);
  if (d === 0n) fail('Division denominator must be positive');
  const product = a * b;
  const quotient = product / d;
  const remainder = product % d;
  const rounded =
    rounding === 'CEIL' && remainder !== 0n ? quotient + 1n : quotient;
  requireUInt(rounded, 'Rounded result');
  return {
    valueMinor: text(rounded),
    remainder: {
      kind:
        remainder === 0n
          ? 'EXACT'
          : rounding === 'FLOOR'
            ? 'DISCARDED'
            : 'ADDED',
      amountSourceMinor: text(
        remainder === 0n || rounding === 'FLOOR' ? remainder : d - remainder,
      ),
      denominator: text(d),
    },
  };
}

export function rescaleMinor(
  amountMinor: string,
  fromDecimals: number,
  toDecimals: number,
  rounding: 'FLOOR' | 'CEIL',
): ScaleResult {
  if (!Number.isInteger(fromDecimals) || !Number.isInteger(toDecimals))
    fail('Decimal scales must be integers');
  if (
    fromDecimals < 0 ||
    toDecimals < 0 ||
    fromDecimals > 36 ||
    toDecimals > 36
  )
    fail('Decimal scale is outside 0..36');
  const amount = uint(amountMinor);
  if (fromDecimals <= toDecimals) {
    const value = requireUInt(
      amount * 10n ** BigInt(toDecimals - fromDecimals),
      'Scaled result',
    );
    return {
      valueMinor: text(value),
      remainder: { kind: 'EXACT', amountSourceMinor: '0', denominator: '1' },
    };
  }
  return mulDiv(
    amountMinor,
    '1',
    text(10n ** BigInt(fromDecimals - toDecimals)),
    rounding,
  );
}

export interface CreatePortfolioInput {
  experimentId: string;
  scenarioId: string;
  portfolioId: string;
  resultProvenance: ShadowPortfolioData['resultProvenance'];
  initialValueUsdcMinor: string;
  maxDestinationAttempts: string;
  balanceViews: ShadowPortfolioData['balanceViews'];
  initialCash: { viewId: string; amountUsdcMinor: string }[];
}

function familyForView(state: ShadowPortfolioData, viewId: string) {
  const view = state.balanceViews.find((item) => item.viewId === viewId);
  if (!view) fail(`Unknown balance view: ${viewId}`);
  return view;
}
function cashForFamily(state: ShadowPortfolioData, balanceFamilyId: string) {
  const cash = state.cash.find(
    (item) => item.balanceFamilyId === balanceFamilyId,
  );
  if (!cash) fail(`Missing cash balance family: ${balanceFamilyId}`);
  return cash;
}
function debitCash(
  state: ShadowPortfolioData,
  balanceFamilyId: string,
  amount: bigint,
) {
  const cash = cashForFamily(state, balanceFamilyId);
  const available = uint(cash.amountUsdcMinor);
  if (available < amount)
    throw new PoaError(
      'INSUFFICIENT_AVAILABLE_BALANCE',
      `Insufficient available cash in ${balanceFamilyId}`,
    );
  cash.amountUsdcMinor = text(available - amount);
}
function creditCash(
  state: ShadowPortfolioData,
  balanceFamilyId: string,
  amount: bigint,
) {
  const cash = cashForFamily(state, balanceFamilyId);
  cash.amountUsdcMinor = text(
    requireUInt(uint(cash.amountUsdcMinor) + amount, 'Cash balance'),
  );
}
function positionBook(shares: string, numerator: string, denominator: string) {
  return mulDiv(shares, numerator, denominator, 'FLOOR');
}
function sortState(state: ShadowPortfolioData) {
  state.balanceViews.sort(by((x) => x.viewId));
  state.cash.sort(by((x) => x.balanceFamilyId));
  state.reservations.sort(by((x) => x.reservationId));
  state.positions.sort(by((x) => x.positionId));
  state.receivables.sort(by((x) => x.transferId));
  state.payables.sort(by((x) => x.payableId));
  state.allowances.sort(by((x) => x.allowanceId));
  state.recognizedCosts.sort(by((x) => x.costId));
}

export function assertPortfolio(stateInput: ShadowPortfolioData) {
  const state = ShadowPortfolio.parse(stateInput);
  unique(state.balanceViews, (x) => x.viewId, 'balance view ID');
  unique(state.cash, (x) => x.balanceFamilyId, 'cash balance family');
  unique(state.reservations, (x) => x.reservationId, 'reservation ID');
  unique(state.positions, (x) => x.positionId, 'position ID');
  unique(state.receivables, (x) => x.transferId, 'transfer ID');
  unique(
    state.receivables,
    (x) => x.messageIdentity,
    'transfer message identity',
  );
  unique(state.payables, (x) => x.payableId, 'payable ID');
  unique(state.allowances, (x) => x.allowanceId, 'allowance ID');
  unique(state.recognizedCosts, (x) => x.costId, 'recognized cost ID');
  unique(state.appliedReceipts, (x) => x.operationId, 'applied operation ID');
  if (uint(state.version) !== BigInt(state.appliedReceipts.length))
    fail('Portfolio version must equal its applied receipt count');
  if ((state.version === '0') !== (state.lastAppliedAt === null))
    fail('Initial state alone may omit the last applied time');
  for (const [index, applied] of state.appliedReceipts.entries()) {
    if (uint(applied.versionApplied) !== BigInt(index + 1))
      fail('Applied receipt versions must be contiguous and ordered');
  }

  const families = new Map<string, (typeof state.balanceViews)[number]>();
  for (const view of state.balanceViews) {
    const family = families.get(view.balanceFamilyId);
    if (
      family &&
      (family.networkId !== view.networkId ||
        family.assetId !== view.assetId ||
        family.canonicalDecimals !== view.canonicalDecimals)
    )
      fail(
        `Balance family ${view.balanceFamilyId} aliases incompatible assets`,
      );
    families.set(view.balanceFamilyId, view);
  }
  for (const cash of state.cash) {
    const family = families.get(cash.balanceFamilyId);
    if (
      !family ||
      family.networkId !== cash.networkId ||
      family.assetId !== cash.assetId
    )
      fail(`Cash family ${cash.balanceFamilyId} has no matching view`);
  }
  if (families.size !== state.cash.length)
    fail('Every balance family must have exactly one canonical cash balance');
  for (const reservation of state.reservations) {
    const family = families.get(reservation.balanceFamilyId);
    if (
      !family ||
      family.networkId !== reservation.networkId ||
      family.assetId !== reservation.assetId
    )
      fail(
        `Reservation ${reservation.reservationId} has an invalid balance family`,
      );
    if (
      !state.appliedReceipts.some(
        (receipt) => receipt.operationId === reservation.operationId,
      )
    )
      fail(`Reservation ${reservation.reservationId} has no applied operation`);
  }
  for (const receivable of state.receivables) {
    const family = families.get(receivable.destinationBalanceFamilyId);
    if (!family || family.networkId !== receivable.destinationNetworkId)
      fail(`Receivable ${receivable.transferId} has an invalid destination`);
    if (receivable.sourceNetworkId === receivable.destinationNetworkId)
      fail(`Receivable ${receivable.transferId} has identical endpoints`);
    if (receivable.createdAt > receivable.updatedAt)
      fail(`Receivable ${receivable.transferId} moves backward in time`);
    if (
      uint(receivable.destinationAttempts) > uint(state.maxDestinationAttempts)
    )
      fail(`Receivable ${receivable.transferId} exceeds its attempt limit`);
    if (state.lastAppliedAt && receivable.updatedAt > state.lastAppliedAt)
      fail(`Receivable ${receivable.transferId} is newer than portfolio state`);
  }
  for (const position of state.positions) {
    if (
      !state.balanceViews.some(
        (view) =>
          view.networkId === position.networkId &&
          view.assetId === position.assetId,
      )
    )
      fail(
        `Position ${position.positionId} has an unknown network/asset identity`,
      );
    if (state.lastAppliedAt && position.lastObservedAt > state.lastAppliedAt)
      fail(`Position ${position.positionId} is newer than portfolio state`);
    const expected = positionBook(
      position.sharesMinor,
      position.indexNumerator,
      position.indexDenominator,
    );
    if (
      position.bookValueUsdcMinor !== expected.valueMinor ||
      position.roundingRemainderNumerator !==
        expected.remainder.amountSourceMinor
    )
      fail(`Position ${position.positionId} book value is not index-derived`);
  }
  for (const payable of state.payables) {
    const cost = state.recognizedCosts.find(
      (item) => item.costId === payable.costId,
    );
    if (
      !cost ||
      cost.funding !== 'PAYABLE' ||
      cost.amountUsdcMinor !== payable.amountUsdcMinor
    )
      fail(`Payable ${payable.payableId} is not backed by one recognized cost`);
  }
  for (const cost of state.recognizedCosts) {
    if (
      !state.appliedReceipts.some(
        (receipt) => receipt.operationId === cost.operationId,
      )
    )
      fail(`Cost ${cost.costId} does not reference an applied operation`);
  }
  for (const allowance of state.allowances) {
    if (
      !state.balanceViews.some(
        (view) =>
          view.networkId === allowance.networkId &&
          view.assetId === allowance.assetId,
      )
    )
      fail(`Allowance ${allowance.allowanceId} has an unknown network/asset`);
  }
  const grossAssets =
    total(state.cash.map((x) => x.amountUsdcMinor)) +
    total(state.reservations.map((x) => x.amountUsdcMinor)) +
    total(state.positions.map((x) => x.bookValueUsdcMinor)) +
    total(state.receivables.map((x) => x.amountUsdcMinor));
  const liabilities = total(state.payables.map((x) => x.amountUsdcMinor));
  if (liabilities > grossAssets) fail('Portfolio has negative net value');
  const netValue = grossAssets - liabilities;
  const expectedNet =
    uint(state.initialValueUsdcMinor) +
    BigInt(state.modeledPnlUsdcMinor) -
    total(state.recognizedCosts.map((x) => x.amountUsdcMinor));
  if (expectedNet < 0n || netValue !== expectedNet)
    fail(
      `Conservation failed: net=${netValue} expected=${expectedNet} ` +
        `(initial + modeled PnL - costs)`,
    );
  if ((state.closedAt === null) !== (state.deadlineStateHash === null))
    fail('Closure time and deadline state hash must appear together');
  if (
    state.closedAt &&
    state.lastAppliedAt &&
    state.closedAt > state.lastAppliedAt
  )
    fail('Closure cannot be newer than the latest applied receipt');
  return state;
}

export function createPortfolio(
  input: CreatePortfolioInput,
): ShadowPortfolioData {
  const cash = new Map<string, ShadowPortfolioData['cash'][number]>();
  for (const view of input.balanceViews) {
    const existing = cash.get(view.balanceFamilyId);
    if (!existing)
      cash.set(view.balanceFamilyId, {
        balanceFamilyId: view.balanceFamilyId,
        networkId: view.networkId,
        assetId: view.assetId,
        amountUsdcMinor: '0',
      });
  }
  const fundedFamilies = new Set<string>();
  for (const item of input.initialCash) {
    const view = input.balanceViews.find(
      (candidate) => candidate.viewId === item.viewId,
    );
    if (!view) fail(`Unknown initial cash view: ${item.viewId}`);
    if (fundedFamilies.has(view.balanceFamilyId))
      fail(`Initial cash duplicates balance family: ${view.balanceFamilyId}`);
    fundedFamilies.add(view.balanceFamilyId);
    const balance = cash.get(view.balanceFamilyId)!;
    balance.amountUsdcMinor = text(
      requireUInt(uint(item.amountUsdcMinor), 'Initial cash'),
    );
  }
  const state: ShadowPortfolioData = {
    schemaVersion: 'proof-of-alpha/shadow-portfolio/v1',
    accountingVersion: '1.0.0',
    experimentId: input.experimentId,
    scenarioId: input.scenarioId,
    portfolioId: input.portfolioId,
    resultProvenance: input.resultProvenance,
    unitOfAccount: 'USDC',
    unitDecimals: 6,
    initialValueUsdcMinor: input.initialValueUsdcMinor,
    maxDestinationAttempts: input.maxDestinationAttempts,
    version: '0',
    balanceViews: structuredClone(input.balanceViews),
    cash: [...cash.values()],
    reservations: [],
    positions: [],
    receivables: [],
    payables: [],
    allowances: [],
    recognizedCosts: [],
    modeledPnlUsdcMinor: '0',
    appliedReceipts: [],
    lastAppliedAt: null,
    closedAt: null,
    deadlineStateHash: null,
  };
  sortState(state);
  if (
    total(state.cash.map((x) => x.amountUsdcMinor)) !==
    uint(input.initialValueUsdcMinor)
  )
    fail('Initial cash must equal one scenario global capital exactly');
  return assertPortfolio(state);
}

function applyCosts(
  state: ShadowPortfolioData,
  receipt: AccountingReceiptData,
  costs: AccountingCostData[],
  expectedWithheld: bigint,
) {
  unique(costs, (cost) => cost.costId, 'cost ID in receipt');
  let withheld = 0n;
  for (const cost of costs) {
    if (!receipt.sourceHashes.includes(cost.sourceHash))
      fail(`Cost ${cost.costId} source is not archived by its receipt`);
    if (state.recognizedCosts.some((item) => item.costId === cost.costId))
      throw new PoaError(
        'OPERATION_CONFLICT',
        `Cost already recognized: ${cost.costId}`,
      );
    const amount = uint(cost.amountUsdcMinor);
    if (cost.funding === 'AVAILABLE_CASH') {
      if (!cost.cashBalanceFamilyId)
        fail(`Cash-funded cost ${cost.costId} needs a balance family`);
      if (
        cashForFamily(state, cost.cashBalanceFamilyId).networkId !==
        cost.networkId
      )
        fail(`Cash-funded cost ${cost.costId} names a different network`);
      debitCash(state, cost.cashBalanceFamilyId, amount);
    } else if (cost.funding === 'PAYABLE') {
      if (cost.cashBalanceFamilyId)
        fail(`Payable cost ${cost.costId} cannot name a cash family`);
      state.payables.push({
        payableId: cost.costId,
        costId: cost.costId,
        networkId: cost.networkId,
        amountUsdcMinor: cost.amountUsdcMinor,
      });
    } else {
      if (cost.cashBalanceFamilyId)
        fail(`Withheld cost ${cost.costId} cannot name a cash family`);
      withheld += amount;
    }
    state.recognizedCosts.push({ ...cost, operationId: receipt.operationId });
  }
  if (withheld !== expectedWithheld)
    fail(
      `Withheld costs ${withheld} do not match economic output gap ${expectedWithheld}`,
    );
}

const transferReceiptKinds = new Set<AccountingReceiptData['kind']>([
  'TRANSFER_READY',
  'TRANSFER_DELAYED',
  'TRANSFER_DESTINATION_RETRY',
  'TRANSFER_SETTLED',
]);

export function applyReceipt(
  stateInput: ShadowPortfolioData,
  receiptInput: AccountingReceiptData,
): ShadowPortfolioData {
  const original = assertPortfolio(stateInput);
  const receipt = AccountingReceipt.parse(receiptInput);
  const receiptHash = contentHash(receipt);
  const prior = original.appliedReceipts.find(
    (item) => item.operationId === receipt.operationId,
  );
  if (prior) {
    if (prior.receiptHash !== receiptHash)
      throw new PoaError(
        'OPERATION_CONFLICT',
        `Operation ${receipt.operationId} was already applied with different content`,
      );
    return original;
  }
  if (
    receipt.experimentId !== original.experimentId ||
    receipt.scenarioId !== original.scenarioId ||
    receipt.resultProvenance !== original.resultProvenance
  )
    fail(
      'Receipt experiment, scenario, or provenance binding does not match portfolio',
    );
  if (receipt.expectedPortfolioVersion !== original.version)
    throw new PoaError(
      'STALE_PORTFOLIO',
      `Expected version ${receipt.expectedPortfolioVersion}, current ${original.version}`,
    );
  if (original.lastAppliedAt && receipt.observedAt < original.lastAppliedAt)
    throw new PoaError(
      'INVALID_TRANSITION',
      'Receipt observation time cannot move backward',
    );
  if (original.closedAt && !transferReceiptKinds.has(receipt.kind))
    throw new PoaError(
      'CLOSED_PORTFOLIO',
      'Deadline state rejects new local economics',
    );

  const state = structuredClone(original);
  if (receipt.kind === 'NO_EFFECT') {
    // An authenticated pre-attempt rejection is durable but costs no gas.
  } else if (receipt.kind === 'RESERVE') {
    if (receipt.costs.length) fail('Reservation cannot incur an attempt cost');
    if (
      state.reservations.some(
        (item) => item.reservationId === receipt.reservationId,
      )
    )
      fail(`Reservation already exists: ${receipt.reservationId}`);
    const view = familyForView(state, receipt.cashViewId);
    debitCash(state, view.balanceFamilyId, uint(receipt.amountUsdcMinor));
    state.reservations.push({
      reservationId: receipt.reservationId,
      operationId: receipt.operationId,
      balanceFamilyId: view.balanceFamilyId,
      networkId: view.networkId,
      assetId: view.assetId,
      amountUsdcMinor: receipt.amountUsdcMinor,
    });
  } else if (receipt.kind === 'COST') {
    applyCosts(state, receipt, receipt.costs, 0n);
  } else if (receipt.kind === 'APPROVE') {
    const allowance = state.allowances.find(
      (item) => item.allowanceId === receipt.allowanceId,
    );
    if (allowance && uint(allowance.amountMinor) >= uint(receipt.amountMinor)) {
      if (receipt.costs.length)
        fail(
          'A sufficient existing allowance cannot incur another approval cost',
        );
    } else {
      applyCosts(state, receipt, receipt.costs, 0n);
    }
    if (
      allowance &&
      (allowance.networkId !== receipt.networkId ||
        allowance.assetId !== receipt.assetId ||
        allowance.spenderId !== receipt.spenderId)
    )
      fail('Allowance identity cannot change under an existing allowance ID');
    const value = {
      allowanceId: receipt.allowanceId,
      networkId: receipt.networkId,
      assetId: receipt.assetId,
      spenderId: receipt.spenderId,
      amountMinor: receipt.amountMinor,
    };
    if (allowance) Object.assign(allowance, value);
    else state.allowances.push(value);
  } else if (receipt.kind === 'DEPOSIT') {
    const view = familyForView(state, receipt.cashViewId);
    debitCash(state, view.balanceFamilyId, uint(receipt.inputUsdcMinor));
    let position = state.positions.find(
      (item) => item.positionId === receipt.positionId,
    );
    const beforeBook = position ? uint(position.bookValueUsdcMinor) : 0n;
    if (position) {
      if (
        position.networkId !== view.networkId ||
        position.instrumentId !== receipt.instrumentId ||
        position.assetId !== view.assetId ||
        position.indexNumerator !== receipt.indexNumerator ||
        position.indexDenominator !== receipt.indexDenominator
      )
        fail(
          'Existing position identity/index differs; accrue it before depositing',
        );
      position.sharesMinor = text(
        requireUInt(
          uint(position.sharesMinor) + uint(receipt.sharesCreditMinor),
          'Position shares',
        ),
      );
    } else {
      position = {
        positionId: receipt.positionId,
        networkId: view.networkId,
        instrumentId: receipt.instrumentId,
        assetId: view.assetId,
        sharesMinor: receipt.sharesCreditMinor,
        indexNumerator: receipt.indexNumerator,
        indexDenominator: receipt.indexDenominator,
        bookValueUsdcMinor: '0',
        roundingRemainderNumerator: '0',
        lastSourceHash: receipt.sourceHashes[0]!,
        lastObservedAt: receipt.observedAt,
      };
      state.positions.push(position);
    }
    const book = positionBook(
      position.sharesMinor,
      position.indexNumerator,
      position.indexDenominator,
    );
    position.bookValueUsdcMinor = book.valueMinor;
    position.roundingRemainderNumerator = book.remainder.amountSourceMinor;
    position.lastSourceHash = receipt.sourceHashes[0]!;
    position.lastObservedAt = receipt.observedAt;
    const credit = uint(position.bookValueUsdcMinor) - beforeBook;
    const input = uint(receipt.inputUsdcMinor);
    if (credit > input) fail('Deposit creates position value');
    applyCosts(state, receipt, receipt.costs, input - credit);
  } else if (receipt.kind === 'WITHDRAW') {
    const view = familyForView(state, receipt.cashViewId);
    const position = state.positions.find(
      (item) => item.positionId === receipt.positionId,
    );
    if (!position) transition(`Position not found: ${receipt.positionId}`);
    if (
      position.networkId !== view.networkId ||
      position.assetId !== view.assetId
    )
      fail('Withdrawal cash view does not match position asset/network');
    const debitShares = uint(receipt.sharesDebitMinor);
    const beforeShares = uint(position.sharesMinor);
    if (debitShares > beforeShares)
      transition('Withdrawal exceeds position shares');
    const beforeBook = uint(position.bookValueUsdcMinor);
    const remainingShares = beforeShares - debitShares;
    let afterBook = 0n;
    if (remainingShares === 0n) {
      state.positions = state.positions.filter(
        (item) => item.positionId !== receipt.positionId,
      );
    } else {
      position.sharesMinor = text(remainingShares);
      const book = positionBook(
        position.sharesMinor,
        position.indexNumerator,
        position.indexDenominator,
      );
      position.bookValueUsdcMinor = book.valueMinor;
      position.roundingRemainderNumerator = book.remainder.amountSourceMinor;
      position.lastSourceHash = receipt.sourceHashes[0]!;
      position.lastObservedAt = receipt.observedAt;
      afterBook = uint(book.valueMinor);
    }
    const bookDebit = beforeBook - afterBook;
    const cashCredit = uint(receipt.cashCreditUsdcMinor);
    if (cashCredit > bookDebit) fail('Withdrawal creates cash value');
    creditCash(state, view.balanceFamilyId, cashCredit);
    applyCosts(state, receipt, receipt.costs, bookDebit - cashCredit);
  } else if (receipt.kind === 'SWAP') {
    const source = familyForView(state, receipt.sourceCashViewId);
    const destination = familyForView(state, receipt.destinationCashViewId);
    if (source.balanceFamilyId === destination.balanceFamilyId)
      fail('Swap source and destination must be different balance families');
    if (source.networkId !== destination.networkId)
      fail('A swap cannot move value between networks; use a transfer');
    const debit = uint(receipt.sourceDebitUsdcMinor);
    const credit = uint(receipt.destinationCreditUsdcMinor);
    if (credit > debit) fail('Swap creates value without modeled PnL');
    debitCash(state, source.balanceFamilyId, debit);
    creditCash(state, destination.balanceFamilyId, credit);
    applyCosts(state, receipt, receipt.costs, debit - credit);
  } else if (receipt.kind === 'PAYABLE_SETTLED') {
    const view = familyForView(state, receipt.cashViewId);
    const payable = state.payables.find(
      (item) => item.payableId === receipt.payableId,
    );
    if (!payable)
      throw new PoaError(
        'PAYABLE_NOT_FOUND',
        `Payable not found: ${receipt.payableId}`,
      );
    if (payable.networkId !== view.networkId)
      fail('Payable must be settled from its network cash');
    debitCash(state, view.balanceFamilyId, uint(payable.amountUsdcMinor));
    state.payables = state.payables.filter(
      (item) => item.payableId !== receipt.payableId,
    );
  } else if (receipt.kind === 'TRANSFER_SOURCE_FAILED') {
    const reservation = state.reservations.find(
      (item) => item.reservationId === receipt.reservationId,
    );
    if (!reservation)
      transition(`Reservation not found: ${receipt.reservationId}`);
    const withheld = total(
      receipt.costs
        .filter((cost) => cost.funding === 'WITHHELD')
        .map((cost) => cost.amountUsdcMinor),
    );
    const amount = uint(reservation.amountUsdcMinor);
    if (withheld > amount) fail('Source failure costs exceed reservation');
    state.reservations = state.reservations.filter(
      (item) => item.reservationId !== receipt.reservationId,
    );
    creditCash(state, reservation.balanceFamilyId, amount - withheld);
    applyCosts(state, receipt, receipt.costs, withheld);
  } else if (receipt.kind === 'TRANSFER_BURNED') {
    const reservation = state.reservations.find(
      (item) => item.reservationId === receipt.reservationId,
    );
    if (!reservation)
      transition(`Reservation not found: ${receipt.reservationId}`);
    if (
      state.receivables.some(
        (item) =>
          item.transferId === receipt.transferId ||
          item.messageIdentity === receipt.messageIdentity,
      )
    )
      fail('Transfer ID or message identity already exists');
    const destination = familyForView(state, receipt.destinationCashViewId);
    if (destination.networkId !== receipt.destinationNetworkId)
      fail('Transfer destination view/network mismatch');
    if (reservation.networkId === destination.networkId)
      fail('Transfer source and destination networks must differ');
    const amount = uint(reservation.amountUsdcMinor);
    const receivable = uint(receipt.netReceivableUsdcMinor);
    if (receivable > amount) fail('Transfer burn creates receivable value');
    state.reservations = state.reservations.filter(
      (item) => item.reservationId !== receipt.reservationId,
    );
    state.receivables.push({
      transferId: receipt.transferId,
      messageIdentity: receipt.messageIdentity,
      sourceNetworkId: reservation.networkId,
      destinationNetworkId: receipt.destinationNetworkId,
      destinationBalanceFamilyId: destination.balanceFamilyId,
      amountUsdcMinor: receipt.netReceivableUsdcMinor,
      state: 'IN_TRANSIT',
      destinationAttempts: '0',
      createdAt: receipt.observedAt,
      updatedAt: receipt.observedAt,
    });
    applyCosts(state, receipt, receipt.costs, amount - receivable);
  } else if (
    receipt.kind === 'TRANSFER_READY' ||
    receipt.kind === 'TRANSFER_DELAYED' ||
    receipt.kind === 'TRANSFER_DESTINATION_RETRY' ||
    receipt.kind === 'TRANSFER_SETTLED'
  ) {
    const receivable = state.receivables.find(
      (item) => item.transferId === receipt.transferId,
    );
    if (!receivable) transition(`Transfer not found: ${receipt.transferId}`);
    if (receipt.observedAt < receivable.updatedAt)
      transition('Transfer observation time cannot move backward');
    if (receipt.kind === 'TRANSFER_READY') {
      if (
        !['IN_TRANSIT', 'DELAYED', 'DESTINATION_RETRY'].includes(
          receivable.state,
        )
      )
        transition(`Cannot mark ${receivable.state} ready`);
      if (
        receivable.state === 'DESTINATION_RETRY' &&
        uint(receivable.destinationAttempts) >=
          uint(state.maxDestinationAttempts)
      )
        transition(
          'Destination attempt limit reached; receivable stays blocked',
        );
      applyCosts(state, receipt, receipt.costs, 0n);
      receivable.state = 'READY_TO_RECEIVE';
      receivable.updatedAt = receipt.observedAt;
    } else if (receipt.kind === 'TRANSFER_DELAYED') {
      if (receivable.state !== 'IN_TRANSIT')
        transition(`Cannot delay ${receivable.state}`);
      applyCosts(state, receipt, receipt.costs, 0n);
      receivable.state = 'DELAYED';
      receivable.updatedAt = receipt.observedAt;
    } else if (receipt.kind === 'TRANSFER_DESTINATION_RETRY') {
      if (receivable.state !== 'READY_TO_RECEIVE')
        transition(`Cannot retry ${receivable.state}`);
      if (
        uint(receivable.destinationAttempts) >=
        uint(state.maxDestinationAttempts)
      )
        transition('Destination retry limit reached');
      applyCosts(state, receipt, receipt.costs, 0n);
      receivable.state = 'DESTINATION_RETRY';
      receivable.destinationAttempts = text(
        requireUInt(
          uint(receivable.destinationAttempts) + 1n,
          'Destination attempts',
        ),
      );
      receivable.updatedAt = receipt.observedAt;
    } else {
      if (receivable.state !== 'READY_TO_RECEIVE')
        transition(`Cannot settle ${receivable.state}`);
      const book = uint(receivable.amountUsdcMinor);
      const credit = uint(receipt.destinationCreditUsdcMinor);
      if (credit > book) fail('Destination settlement creates cash value');
      creditCash(state, receivable.destinationBalanceFamilyId, credit);
      state.receivables = state.receivables.filter(
        (item) => item.transferId !== receipt.transferId,
      );
      applyCosts(state, receipt, receipt.costs, book - credit);
    }
  } else if (receipt.kind === 'ACCRUE') {
    if (receipt.costs.length)
      fail('Index accrual cannot incur operation costs');
    const position = state.positions.find(
      (item) => item.positionId === receipt.positionId,
    );
    if (!position) transition(`Position not found: ${receipt.positionId}`);
    if (receipt.observedAt <= position.lastObservedAt)
      transition('Accrual observation must be later than prior position state');
    const before = uint(position.bookValueUsdcMinor);
    const book = positionBook(
      position.sharesMinor,
      receipt.nextIndexNumerator,
      receipt.nextIndexDenominator,
    );
    const after = uint(book.valueMinor);
    position.indexNumerator = receipt.nextIndexNumerator;
    position.indexDenominator = receipt.nextIndexDenominator;
    position.bookValueUsdcMinor = book.valueMinor;
    position.roundingRemainderNumerator = book.remainder.amountSourceMinor;
    position.lastSourceHash = receipt.sourceHashes[0]!;
    position.lastObservedAt = receipt.observedAt;
    state.modeledPnlUsdcMinor = text(
      BigInt(state.modeledPnlUsdcMinor) + (after - before),
    );
  } else if (receipt.kind === 'CLOSE') {
    if (receipt.closedAt !== receipt.observedAt)
      fail('Closure timestamp must equal its observed timestamp');
    state.closedAt = receipt.closedAt;
    state.deadlineStateHash = contentHash(original);
  }

  state.version = text(uint(original.version) + 1n);
  state.lastAppliedAt = receipt.observedAt;
  state.appliedReceipts.push({
    operationId: receipt.operationId,
    receiptHash,
    versionApplied: state.version,
  });
  sortState(state);
  return assertPortfolio(state);
}

export interface ReplayResult {
  state: ShadowPortfolioData;
  stateHashes: `0x${string}`[];
}

export function replay(
  initial: ShadowPortfolioData,
  receipts: AccountingReceiptData[],
  serializeAfterEveryReceipt = true,
): ReplayResult {
  let state = assertPortfolio(structuredClone(initial));
  const stateHashes = [contentHash(state)];
  for (const receipt of receipts) {
    state = applyReceipt(state, receipt);
    if (serializeAfterEveryReceipt)
      state = assertPortfolio(
        JSON.parse(JSON.stringify(state)) as ShadowPortfolioData,
      );
    stateHashes.push(contentHash(state));
  }
  return { state, stateHashes };
}

export function valuePortfolio(
  stateInput: ShadowPortfolioData,
  valuationInputs: PositionValuationInputData[],
): PortfolioValuationData {
  const state = assertPortfolio(stateInput);
  const inputs = valuationInputs.map((input) =>
    PositionValuationInput.parse(input),
  );
  unique(inputs, (input) => input.positionId, 'position valuation');
  if (
    inputs.length !== state.positions.length ||
    state.positions.some(
      (position) =>
        !inputs.some((input) => input.positionId === position.positionId),
    )
  )
    fail('Valuation must contain exactly one input for every open position');
  let dataQuality: PortfolioValuationData['dataQuality'] = inputs.some(
    (input) =>
      input.dataQuality === 'UNAVAILABLE' ||
      input.markValueUsdcMinor === null ||
      input.recoverableUsdcMinor === null ||
      input.exitCostUsdcMinor === null,
  )
    ? 'UNAVAILABLE'
    : inputs.some((input) => input.dataQuality === 'STALE')
      ? 'STALE'
      : 'FRESH';
  const available = total(state.cash.map((item) => item.amountUsdcMinor));
  const reserved = total(
    state.reservations.map((item) => item.amountUsdcMinor),
  );
  const inTransit = total(
    state.receivables.map((item) => item.amountUsdcMinor),
  );
  const payables = total(state.payables.map((item) => item.amountUsdcMinor));
  const reasonCodes: PortfolioValuationData['reasonCodes'] = [];
  if (dataQuality === 'UNAVAILABLE') reasonCodes.push('DATA_UNAVAILABLE');
  if (dataQuality === 'STALE') reasonCodes.push('STALE_DATA');
  if (inTransit > 0n) reasonCodes.push('IN_TRANSIT_UNAVAILABLE');
  let markValue: bigint | null = null;
  let liquidationValue: bigint | null = null;
  let blockedValue: bigint | null = null;
  if (dataQuality !== 'UNAVAILABLE') {
    let positionMarks = 0n;
    let positionLiquidation = 0n;
    let blocked = 0n;
    for (const input of inputs) {
      const mark = uint(input.markValueUsdcMinor!);
      const recoverable = uint(input.recoverableUsdcMinor!);
      const exitCost = uint(input.exitCostUsdcMinor!);
      if (exitCost > recoverable)
        fail('Exit cost exceeds recoverable position value');
      positionMarks += mark;
      positionLiquidation += recoverable - exitCost;
      if (recoverable < mark) blocked += mark - recoverable;
    }
    const grossMark = available + reserved + inTransit + positionMarks;
    const grossLiquidation = available + reserved + positionLiquidation;
    if (payables > grossMark || payables > grossLiquidation)
      fail('Valuation liabilities exceed recoverable assets');
    markValue = grossMark - payables;
    liquidationValue = grossLiquidation - payables;
    blockedValue = blocked;
    if (blocked > 0n) reasonCodes.push('BLOCKED_LIQUIDITY');
  }
  return PortfolioValuation.parse({
    schemaVersion: 'proof-of-alpha/portfolio-valuation/v1',
    accountingVersion: '1.0.0',
    portfolioHash: contentHash(state),
    portfolioVersion: state.version,
    markValueUsdcMinor: markValue === null ? null : text(markValue),
    liquidationValueUsdcMinor:
      liquidationValue === null ? null : text(liquidationValue),
    availableUsdcMinor: text(available),
    reservedUsdcMinor: text(reserved),
    inTransitUsdcMinor: text(inTransit),
    blockedValueUsdcMinor: blockedValue === null ? null : text(blockedValue),
    feesPayableUsdcMinor: text(payables),
    dataQuality,
    sourceHashes: inputs.map((input) => input.sourceHash).sort(),
    reasonCodes,
  });
}

export function globalBookValue(state: ShadowPortfolioData) {
  const valid = assertPortfolio(state);
  return text(
    total(valid.cash.map((x) => x.amountUsdcMinor)) +
      total(valid.reservations.map((x) => x.amountUsdcMinor)) +
      total(valid.positions.map((x) => x.bookValueUsdcMinor)) +
      total(valid.receivables.map((x) => x.amountUsdcMinor)) -
      total(valid.payables.map((x) => x.amountUsdcMinor)),
  );
}
