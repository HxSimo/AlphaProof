import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentHash, PoaError } from '@poa/domain';
import {
  AccountingReceipt,
  type AccountingCostData,
  type AccountingReceiptData,
  type ShadowPortfolioData,
} from '@poa/schemas';
import {
  applyReceipt,
  assertPortfolio,
  createPortfolio,
  globalBookValue,
  mulDiv,
  replay,
  rescaleMinor,
  valuePortfolio,
  type CreatePortfolioInput,
} from './index.js';

const hash = (byte: number) =>
  `0x${byte.toString(16).padStart(2, '0').repeat(32)}`;
const at = (minute: number) =>
  new Date(Date.UTC(2026, 8, 8, 12, minute, 0, 0)).toISOString();

const views: ShadowPortfolioData['balanceViews'] = [
  {
    viewId: 'ethereum-usdc-erc20',
    networkId: 'ethereum-mainnet',
    assetId: 'usdc',
    balanceFamilyId: 'ethereum-usdc',
    decimals: 6,
    canonicalDecimals: 6,
  },
  {
    viewId: 'arc-usdc-native',
    networkId: 'arc-mainnet',
    assetId: 'usdc',
    balanceFamilyId: 'arc-usdc',
    decimals: 18,
    canonicalDecimals: 6,
  },
  {
    viewId: 'arc-usdc-erc20',
    networkId: 'arc-mainnet',
    assetId: 'usdc',
    balanceFamilyId: 'arc-usdc',
    decimals: 6,
    canonicalDecimals: 6,
  },
];

function newPortfolio(
  amountUsdcMinor = '10000000000',
  scenarioId = 'capital-10k',
) {
  return createPortfolio({
    experimentId: 'exp-m1',
    scenarioId,
    portfolioId: `portfolio-${scenarioId}`,
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: amountUsdcMinor,
    maxDestinationAttempts: '3',
    balanceViews: views,
    initialCash: [{ viewId: 'ethereum-usdc-erc20', amountUsdcMinor }],
  });
}

function receipt(
  state: ShadowPortfolioData,
  minute: number,
  fields: Record<string, unknown>,
): AccountingReceiptData {
  return AccountingReceipt.parse({
    schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
    accountingVersion: '1.0.0',
    operationId: `operation-${minute}`,
    experimentId: state.experimentId,
    scenarioId: state.scenarioId,
    expectedPortfolioVersion: state.version,
    observedAt: at(minute),
    resultProvenance: state.resultProvenance,
    sourceHashes: [hash(minute + 1)],
    costs: [],
    ...fields,
  });
}

function cost(
  minute: number,
  fields: Partial<AccountingCostData> &
    Pick<
      AccountingCostData,
      'costId' | 'category' | 'funding' | 'amountUsdcMinor'
    >,
): AccountingCostData {
  return {
    networkId: 'ethereum-mainnet',
    cashBalanceFamilyId: null,
    sourceHash: hash(minute + 1),
    ...fields,
  };
}

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(PoaError);
    expect((error as PoaError).code).toBe(code);
  }
}

function reserve(
  state: ShadowPortfolioData,
  minute: number,
  reservationId: string,
  amountUsdcMinor: string,
) {
  const event = receipt(state, minute, {
    kind: 'RESERVE',
    reservationId,
    cashViewId: 'ethereum-usdc-erc20',
    amountUsdcMinor,
  });
  return { event, state: applyReceipt(state, event) };
}

describe('integer accounting and rounding', () => {
  it('retains floor and ceiling remainders above Number.MAX_SAFE_INTEGER', () => {
    let seed = 0x1234_5678_9abcn;
    const mask = (1n << 120n) - 1n;
    const next = () => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask;
      return seed + 1n;
    };
    for (let i = 0; i < 500; i += 1) {
      const a = next();
      const b = next();
      const d = (next() % (1n << 60n)) + 1n;
      const product = a * b;
      const floor = mulDiv(a.toString(), b.toString(), d.toString(), 'FLOOR');
      const ceil = mulDiv(a.toString(), b.toString(), d.toString(), 'CEIL');
      const discarded = BigInt(floor.remainder.amountSourceMinor);
      expect(BigInt(floor.valueMinor) * d + discarded).toBe(product);
      expect(discarded).toBeLessThan(d);
      if (discarded === 0n) {
        expect(ceil.valueMinor).toBe(floor.valueMinor);
        expect(ceil.remainder.kind).toBe('EXACT');
      } else {
        expect(BigInt(ceil.valueMinor)).toBe(BigInt(floor.valueMinor) + 1n);
        expect(BigInt(ceil.remainder.amountSourceMinor)).toBe(d - discarded);
      }
    }
    const large = '900719925474099312345678901234';
    expect(rescaleMinor(large, 18, 6, 'FLOOR')).toEqual({
      valueMinor: '900719925474099312',
      remainder: {
        kind: 'DISCARDED',
        amountSourceMinor: '345678901234',
        denominator: '1000000000000',
      },
    });
    expect(rescaleMinor('123', 6, 18, 'FLOOR').valueMinor).toBe(
      '123000000000000',
    );
    expectCode(() => mulDiv('-1', '1', '2', 'FLOOR'), 'ACCOUNTING_INVARIANT');
    expectCode(() => mulDiv('01', '1', '2', 'FLOOR'), 'ACCOUNTING_INVARIANT');
  });

  it('keeps capital scenarios and network balance families independent', () => {
    const scenarios = [
      newPortfolio('1000000000', 'capital-1k'),
      newPortfolio('10000000000', 'capital-10k'),
      newPortfolio('100000000000', 'capital-100k'),
    ];
    const changed = reserve(scenarios[0]!, 0, 'reserve-1k', '100000000').state;
    expect(globalBookValue(changed)).toBe('1000000000');
    expect(scenarios[0]!.cash[1]?.amountUsdcMinor).toBe('1000000000');
    expect(globalBookValue(scenarios[1]!)).toBe('10000000000');
    expect(globalBookValue(scenarios[2]!)).toBe('100000000000');
    expect(new Set(scenarios.map((state) => state.portfolioId)).size).toBe(3);
  });

  it('aliases Arc native and ERC-20 views to one cash balance', () => {
    const input: CreatePortfolioInput = {
      experimentId: 'exp-alias',
      scenarioId: 'capital-1k',
      portfolioId: 'portfolio-alias',
      resultProvenance: 'SYNTHETIC_TEST',
      initialValueUsdcMinor: '1000000000',
      maxDestinationAttempts: '3',
      balanceViews: views,
      initialCash: [
        { viewId: 'arc-usdc-native', amountUsdcMinor: '1000000000' },
      ],
    };
    const state = createPortfolio(input);
    expect(state.cash).toHaveLength(2);
    expect(
      state.cash.find((item) => item.balanceFamilyId === 'arc-usdc')
        ?.amountUsdcMinor,
    ).toBe('1000000000');
    expectCode(
      () =>
        createPortfolio({
          ...input,
          initialValueUsdcMinor: '2000000000',
          initialCash: [
            { viewId: 'arc-usdc-native', amountUsdcMinor: '1000000000' },
            { viewId: 'arc-usdc-erc20', amountUsdcMinor: '1000000000' },
          ],
        }),
      'ACCOUNTING_INVARIANT',
    );
  });
});

describe('receipt reduction, costs and partial failure', () => {
  it('preserves conservation over deterministic arbitrary transfer sequences and restarts', () => {
    const initial = 9007199254740993123456n;
    for (let trial = 0; trial < 100; trial += 1) {
      let state = newPortfolio(initial.toString(), `capital-property-${trial}`);
      let expectedCosts = 0n;
      let minute = 0;
      const restart = (next: ShadowPortfolioData) =>
        assertPortfolio(
          JSON.parse(JSON.stringify(next)) as ShadowPortfolioData,
        );
      const amount = 1000000000n + BigInt(trial * 1009);
      const reservationId = `reservation-property-${trial}`;
      state = restart(
        reserve(state, minute++, reservationId, amount.toString()).state,
      );
      const withheld = BigInt((trial % 97) + 1);
      const attempt = BigInt((trial % 31) + 1);
      if (trial % 3 === 0) {
        const failed = receipt(state, minute++, {
          kind: 'TRANSFER_SOURCE_FAILED',
          reservationId,
          costs: [
            cost(minute - 1, {
              costId: `cost-property-withheld-${trial}`,
              category: 'TRANSFER_FEE',
              funding: 'WITHHELD',
              amountUsdcMinor: withheld.toString(),
            }),
            cost(minute - 1, {
              costId: `cost-property-attempt-${trial}`,
              category: 'SOURCE_GAS',
              funding: 'AVAILABLE_CASH',
              amountUsdcMinor: attempt.toString(),
              cashBalanceFamilyId: 'ethereum-usdc',
            }),
          ],
        });
        state = restart(applyReceipt(state, failed));
        expectedCosts += withheld + attempt;
        expect(contentHash(applyReceipt(state, failed))).toBe(
          contentHash(state),
        );
      } else {
        const net = amount - withheld;
        state = restart(
          applyReceipt(
            state,
            receipt(state, minute++, {
              kind: 'TRANSFER_BURNED',
              reservationId,
              transferId: `transfer-property-${trial}`,
              messageIdentity: `message-property-${trial}`,
              destinationNetworkId: 'arc-mainnet',
              destinationCashViewId: 'arc-usdc-native',
              netReceivableUsdcMinor: net.toString(),
              costs: [
                cost(minute - 1, {
                  costId: `cost-property-burn-${trial}`,
                  category: 'TRANSFER_FEE',
                  funding: 'WITHHELD',
                  amountUsdcMinor: withheld.toString(),
                }),
              ],
            }),
          ),
        );
        expectedCosts += withheld;
        if (trial % 2 === 0) {
          state = restart(
            applyReceipt(
              state,
              receipt(state, minute++, {
                kind: 'TRANSFER_DELAYED',
                transferId: `transfer-property-${trial}`,
              }),
            ),
          );
        }
        state = restart(
          applyReceipt(
            state,
            receipt(state, minute++, {
              kind: 'TRANSFER_READY',
              transferId: `transfer-property-${trial}`,
            }),
          ),
        );
        const retries = trial % 3;
        for (let retry = 0; retry < retries; retry += 1) {
          state = restart(
            applyReceipt(
              state,
              receipt(state, minute++, {
                kind: 'TRANSFER_DESTINATION_RETRY',
                transferId: `transfer-property-${trial}`,
              }),
            ),
          );
          state = restart(
            applyReceipt(
              state,
              receipt(state, minute++, {
                kind: 'TRANSFER_READY',
                transferId: `transfer-property-${trial}`,
              }),
            ),
          );
        }
        const settlementCost = BigInt((trial % 17) + 1);
        const settlement = receipt(state, minute++, {
          kind: 'TRANSFER_SETTLED',
          transferId: `transfer-property-${trial}`,
          destinationCreditUsdcMinor: (net - settlementCost).toString(),
          costs: [
            cost(minute - 1, {
              costId: `cost-property-settle-${trial}`,
              category: 'DESTINATION_GAS',
              funding: 'WITHHELD',
              amountUsdcMinor: settlementCost.toString(),
              networkId: 'arc-mainnet',
            }),
          ],
        });
        state = restart(applyReceipt(state, settlement));
        expectedCosts += settlementCost;
        expect(contentHash(applyReceipt(state, settlement))).toBe(
          contentHash(state),
        );
      }
      expect(globalBookValue(state)).toBe((initial - expectedCosts).toString());
      expect(assertPortfolio(state)).toEqual(state);
    }
  });

  it('preserves a successful withdrawal and recognizes a later failed swap once', () => {
    let state = newPortfolio();
    const approve = receipt(state, 0, {
      kind: 'APPROVE',
      allowanceId: 'allowance-vault',
      networkId: 'ethereum-mainnet',
      assetId: 'usdc',
      spenderId: 'synthetic-vault',
      amountMinor: '4000000000',
      costs: [
        cost(0, {
          costId: 'cost-approval',
          category: 'APPROVAL_GAS',
          funding: 'AVAILABLE_CASH',
          amountUsdcMinor: '2000000',
          cashBalanceFamilyId: 'ethereum-usdc',
        }),
      ],
    });
    state = applyReceipt(state, approve);
    const afterApproval = contentHash(state);
    expect(contentHash(applyReceipt(state, approve))).toBe(afterApproval);

    const sufficient = receipt(state, 1, {
      kind: 'APPROVE',
      allowanceId: 'allowance-vault',
      networkId: 'ethereum-mainnet',
      assetId: 'usdc',
      spenderId: 'synthetic-vault',
      amountMinor: '3000000000',
    });
    state = applyReceipt(state, sufficient);
    expect(state.recognizedCosts).toHaveLength(1);

    const redundantCost = receipt(state, 2, {
      kind: 'APPROVE',
      allowanceId: 'allowance-vault',
      networkId: 'ethereum-mainnet',
      assetId: 'usdc',
      spenderId: 'synthetic-vault',
      amountMinor: '3000000000',
      costs: [
        cost(2, {
          costId: 'cost-redundant-approval',
          category: 'APPROVAL_GAS',
          funding: 'AVAILABLE_CASH',
          amountUsdcMinor: '1',
          cashBalanceFamilyId: 'ethereum-usdc',
        }),
      ],
    });
    expectCode(
      () => applyReceipt(state, redundantCost),
      'ACCOUNTING_INVARIANT',
    );

    const deposit = receipt(state, 3, {
      kind: 'DEPOSIT',
      cashViewId: 'ethereum-usdc-erc20',
      positionId: 'position-vault',
      instrumentId: 'synthetic-vault',
      sharesCreditMinor: '4000000000',
      indexNumerator: '1',
      indexDenominator: '1',
      inputUsdcMinor: '4000000000',
    });
    state = applyReceipt(state, deposit);
    state = applyReceipt(
      state,
      receipt(state, 4, {
        kind: 'ACCRUE',
        positionId: 'position-vault',
        nextIndexNumerator: '101',
        nextIndexDenominator: '100',
      }),
    );
    const withdrawal = receipt(state, 5, {
      kind: 'WITHDRAW',
      cashViewId: 'ethereum-usdc-erc20',
      positionId: 'position-vault',
      sharesDebitMinor: '4000000000',
      cashCreditUsdcMinor: '4035000000',
      costs: [
        cost(5, {
          costId: 'cost-withdraw-impact',
          category: 'PROTOCOL_FEE',
          funding: 'WITHHELD',
          amountUsdcMinor: '5000000',
        }),
      ],
    });
    state = applyReceipt(state, withdrawal);
    const cashAfterWithdrawal = state.cash.find(
      (item) => item.balanceFamilyId === 'ethereum-usdc',
    )!.amountUsdcMinor;
    const failedSwap = receipt(state, 6, {
      kind: 'COST',
      status: 'FAILED_AFTER_ATTEMPT',
      reasonCode: 'SYNTHETIC_REVERT',
      costs: [
        cost(6, {
          costId: 'cost-failed-swap-gas',
          category: 'EXECUTION_GAS',
          funding: 'AVAILABLE_CASH',
          amountUsdcMinor: '3000000',
          cashBalanceFamilyId: 'ethereum-usdc',
        }),
      ],
    });
    state = applyReceipt(state, failedSwap);

    expect(cashAfterWithdrawal).toBe('10033000000');
    expect(state.cash[1]?.amountUsdcMinor).toBe('10030000000');
    expect(state.positions).toHaveLength(0);
    expect(state.modeledPnlUsdcMinor).toBe('40000000');
    expect(globalBookValue(state)).toBe('10030000000');
    expect(state.recognizedCosts.map((item) => item.costId).sort()).toEqual([
      'cost-approval',
      'cost-failed-swap-gas',
      'cost-withdraw-impact',
    ]);
    expect(contentHash(applyReceipt(state, failedSwap))).toBe(
      contentHash(state),
    );

    const changedDuplicate = { ...failedSwap, reasonCode: 'DIFFERENT_REVERT' };
    expectCode(
      () => applyReceipt(state, changedDuplicate),
      'OPERATION_CONFLICT',
    );
  });

  it('records rejection before attempt without gas and rejects insufficient cash', () => {
    let state = newPortfolio('1000000000', 'capital-1k');
    state = applyReceipt(
      state,
      receipt(state, 0, {
        kind: 'NO_EFFECT',
        status: 'REJECTED_BEFORE_ATTEMPT',
        reasonCode: 'POLICY_LIMIT',
      }),
    );
    expect(state.recognizedCosts).toEqual([]);
    expect(globalBookValue(state)).toBe('1000000000');
    expectCode(
      () => reserve(state, 1, 'too-large', '1000000001'),
      'INSUFFICIENT_AVAILABLE_BALANCE',
    );
    const stale = receipt(state, 2, {
      kind: 'NO_EFFECT',
      status: 'SKIPPED',
      reasonCode: 'SYNTHETIC_SKIP',
    });
    stale.expectedPortfolioVersion = '0';
    expectCode(() => applyReceipt(state, stale), 'STALE_PORTFOLIO');
    const outOfOrder = receipt(state, 3, {
      kind: 'NO_EFFECT',
      status: 'SKIPPED',
      reasonCode: 'SYNTHETIC_SKIP',
    });
    outOfOrder.observedAt = '2026-09-08T11:59:00.000Z';
    expectCode(() => applyReceipt(state, outOfOrder), 'INVALID_TRANSITION');
    expectCode(
      () =>
        applyReceipt(
          state,
          receipt(state, 4, {
            kind: 'SWAP',
            sourceCashViewId: 'ethereum-usdc-erc20',
            destinationCashViewId: 'arc-usdc-native',
            sourceDebitUsdcMinor: '1000000',
            destinationCreditUsdcMinor: '1000000',
          }),
        ),
      'ACCOUNTING_INVARIANT',
    );
  });
});

describe('transfer lifecycle and restart replay', () => {
  it('releases a source failure minus only proven attempt costs', () => {
    let state = newPortfolio();
    state = reserve(state, 0, 'reservation-failure', '4000000000').state;
    const failed = receipt(state, 1, {
      kind: 'TRANSFER_SOURCE_FAILED',
      reservationId: 'reservation-failure',
      costs: [
        cost(1, {
          costId: 'cost-source-withheld',
          category: 'TRANSFER_FEE',
          funding: 'WITHHELD',
          amountUsdcMinor: '1000000',
        }),
        cost(1, {
          costId: 'cost-source-attempt-gas',
          category: 'SOURCE_GAS',
          funding: 'AVAILABLE_CASH',
          amountUsdcMinor: '2000000',
          cashBalanceFamilyId: 'ethereum-usdc',
        }),
      ],
    });
    state = applyReceipt(state, failed);
    expect(state.reservations).toEqual([]);
    expect(state.receivables).toEqual([]);
    expect(state.cash[1]?.amountUsdcMinor).toBe('9997000000');
    expect(globalBookValue(state)).toBe('9997000000');
    expect(contentHash(applyReceipt(state, failed))).toBe(contentHash(state));
  });

  it('replays the synthetic burn/delay/retry/settlement fixture exactly', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../tests/fixtures/m1-accounting-transfer.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      fixtureVersion: string;
      provenance: string;
      portfolio: CreatePortfolioInput;
      receipts: unknown[];
      expected: Record<string, string | number>;
    };
    expect(fixture.fixtureVersion).toBe('proof-of-alpha/accounting-fixture/v1');
    expect(fixture.provenance).toBe('SYNTHETIC_TEST');
    const initial = createPortfolio(fixture.portfolio);
    const events = fixture.receipts.map((event) =>
      AccountingReceipt.parse(event),
    );
    const first = replay(initial, events, true);
    const second = replay(
      JSON.parse(JSON.stringify(initial)) as ShadowPortfolioData,
      events,
      true,
    );
    expect(second).toEqual(first);
    expect(first.stateHashes).toHaveLength(events.length + 1);
    expect(new Set(first.stateHashes).size).toBe(first.stateHashes.length);
    expect(first.state.version).toBe(fixture.expected.version);
    expect(globalBookValue(first.state)).toBe(
      fixture.expected.globalBookValueUsdcMinor,
    );
    expect(
      first.state.cash.find((item) => item.balanceFamilyId === 'ethereum-usdc')
        ?.amountUsdcMinor,
    ).toBe(fixture.expected.ethereumCashUsdcMinor);
    expect(
      first.state.cash.find((item) => item.balanceFamilyId === 'arc-usdc')
        ?.amountUsdcMinor,
    ).toBe(fixture.expected.arcCashUsdcMinor);
    expect(
      first.state.recognizedCosts
        .reduce((sum, item) => sum + BigInt(item.amountUsdcMinor), 0n)
        .toString(),
    ).toBe(fixture.expected.recognizedCostUsdcMinor);
    expect(first.state.receivables).toHaveLength(
      Number(fixture.expected.receivableCount),
    );
    expect(first.state.payables).toHaveLength(
      Number(fixture.expected.payableCount),
    );
  });

  it('enforces transition order, retry ceilings and exactly one settlement credit', () => {
    let state = newPortfolio();
    state = reserve(state, 0, 'reservation-retries', '1000000000').state;
    state = applyReceipt(
      state,
      receipt(state, 1, {
        kind: 'TRANSFER_BURNED',
        reservationId: 'reservation-retries',
        transferId: 'transfer-retries',
        messageIdentity: 'message-retries',
        destinationNetworkId: 'arc-mainnet',
        destinationCashViewId: 'arc-usdc-native',
        netReceivableUsdcMinor: '1000000000',
      }),
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      state = applyReceipt(
        state,
        receipt(state, 2 + attempt * 2, {
          kind: 'TRANSFER_READY',
          transferId: 'transfer-retries',
        }),
      );
      state = applyReceipt(
        state,
        receipt(state, 3 + attempt * 2, {
          kind: 'TRANSFER_DESTINATION_RETRY',
          transferId: 'transfer-retries',
        }),
      );
    }
    state = applyReceipt(
      state,
      receipt(state, 6, {
        kind: 'TRANSFER_READY',
        transferId: 'transfer-retries',
      }),
    );
    const settlement = receipt(state, 7, {
      kind: 'TRANSFER_SETTLED',
      transferId: 'transfer-retries',
      destinationCreditUsdcMinor: '1000000000',
    });
    state = applyReceipt(state, settlement);
    const settledHash = contentHash(state);
    expect(contentHash(applyReceipt(state, settlement))).toBe(settledHash);
    expect(
      state.cash.find((item) => item.balanceFamilyId === 'arc-usdc')
        ?.amountUsdcMinor,
    ).toBe('1000000000');
    expectCode(
      () =>
        applyReceipt(
          state,
          receipt(state, 8, {
            kind: 'TRANSFER_SETTLED',
            transferId: 'transfer-retries',
            destinationCreditUsdcMinor: '1000000000',
          }),
        ),
      'INVALID_TRANSITION',
    );

    let blocked = newPortfolio();
    blocked = reserve(blocked, 0, 'reservation-blocked', '1000000000').state;
    blocked = applyReceipt(
      blocked,
      receipt(blocked, 1, {
        kind: 'TRANSFER_BURNED',
        reservationId: 'reservation-blocked',
        transferId: 'transfer-blocked',
        messageIdentity: 'message-blocked',
        destinationNetworkId: 'arc-mainnet',
        destinationCashViewId: 'arc-usdc-native',
        netReceivableUsdcMinor: '1000000000',
      }),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      blocked = applyReceipt(
        blocked,
        receipt(blocked, 10 + attempt * 2, {
          kind: 'TRANSFER_READY',
          transferId: 'transfer-blocked',
        }),
      );
      blocked = applyReceipt(
        blocked,
        receipt(blocked, 11 + attempt * 2, {
          kind: 'TRANSFER_DESTINATION_RETRY',
          transferId: 'transfer-blocked',
        }),
      );
    }
    expect(blocked.receivables[0]?.destinationAttempts).toBe('3');
    expectCode(
      () =>
        applyReceipt(
          blocked,
          receipt(blocked, 16, {
            kind: 'TRANSFER_READY',
            transferId: 'transfer-blocked',
          }),
        ),
      'INVALID_TRANSITION',
    );
  });
});

describe('valuation and deadline state', () => {
  function positionedPortfolio() {
    let state = newPortfolio();
    state = applyReceipt(
      state,
      receipt(state, 0, {
        kind: 'DEPOSIT',
        cashViewId: 'ethereum-usdc-erc20',
        positionId: 'position-valuation',
        instrumentId: 'synthetic-vault',
        sharesCreditMinor: '4000000000',
        indexNumerator: '1',
        indexDenominator: '1',
        inputUsdcMinor: '4000000000',
      }),
    );
    state = reserve(state, 1, 'reservation-valuation', '2000000000').state;
    state = applyReceipt(
      state,
      receipt(state, 2, {
        kind: 'TRANSFER_BURNED',
        reservationId: 'reservation-valuation',
        transferId: 'transfer-valuation',
        messageIdentity: 'message-valuation',
        destinationNetworkId: 'arc-mainnet',
        destinationCashViewId: 'arc-usdc-native',
        netReceivableUsdcMinor: '1999000000',
        costs: [
          cost(2, {
            costId: 'cost-valuation-transfer',
            category: 'TRANSFER_FEE',
            funding: 'WITHHELD',
            amountUsdcMinor: '1000000',
          }),
        ],
      }),
    );
    return state;
  }

  it('separates mark, liquidation, blocked and in-transit values without mutation', () => {
    const state = positionedPortfolio();
    const before = contentHash(state);
    const input = {
      positionId: 'position-valuation',
      markValueUsdcMinor: '4100000000',
      recoverableUsdcMinor: '3800000000',
      exitCostUsdcMinor: '100000000',
      dataQuality: 'FRESH' as const,
      sourceHash: hash(30),
      observedAt: at(30),
    };
    const first = valuePortfolio(state, [input]);
    const second = valuePortfolio(state, [input]);
    expect(first).toEqual(second);
    expect(contentHash(state)).toBe(before);
    expect(first.markValueUsdcMinor).toBe('10099000000');
    expect(first.liquidationValueUsdcMinor).toBe('7700000000');
    expect(first.inTransitUsdcMinor).toBe('1999000000');
    expect(first.blockedValueUsdcMinor).toBe('300000000');
    expect(first.reasonCodes).toEqual([
      'IN_TRANSIT_UNAVAILABLE',
      'BLOCKED_LIQUIDITY',
    ]);

    const stale = valuePortfolio(state, [{ ...input, dataQuality: 'STALE' }]);
    expect(stale.dataQuality).toBe('STALE');
    expect(stale.reasonCodes).toContain('STALE_DATA');
    const missing = valuePortfolio(state, [
      {
        ...input,
        markValueUsdcMinor: null,
        recoverableUsdcMinor: null,
        exitCostUsdcMinor: null,
        dataQuality: 'UNAVAILABLE',
      },
    ]);
    expect(missing.markValueUsdcMinor).toBeNull();
    expect(missing.liquidationValueUsdcMinor).toBeNull();
    expect(missing.blockedValueUsdcMinor).toBeNull();
    expect(missing.reasonCodes).toContain('DATA_UNAVAILABLE');
  });

  it('freezes a deadline hash while allowing an in-transit settlement to finish', () => {
    let state = positionedPortfolio();
    const close = receipt(state, 20, {
      kind: 'CLOSE',
      closedAt: at(20),
    });
    const preCloseHash = contentHash(state);
    state = applyReceipt(state, close);
    expect(state.deadlineStateHash).toBe(preCloseHash);
    expectCode(
      () =>
        applyReceipt(
          state,
          receipt(state, 21, {
            kind: 'ACCRUE',
            positionId: 'position-valuation',
            nextIndexNumerator: '101',
            nextIndexDenominator: '100',
          }),
        ),
      'CLOSED_PORTFOLIO',
    );
    state = applyReceipt(
      state,
      receipt(state, 22, {
        kind: 'TRANSFER_READY',
        transferId: 'transfer-valuation',
      }),
    );
    state = applyReceipt(
      state,
      receipt(state, 23, {
        kind: 'TRANSFER_SETTLED',
        transferId: 'transfer-valuation',
        destinationCreditUsdcMinor: '1999000000',
      }),
    );
    expect(state.deadlineStateHash).toBe(preCloseHash);
    expect(state.receivables).toHaveLength(0);
    expect(globalBookValue(state)).toBe('9999000000');
  });

  it('detects corrupt serialized state rather than repairing it', () => {
    const state = newPortfolio();
    const corrupt = JSON.parse(JSON.stringify(state)) as ShadowPortfolioData;
    corrupt.cash[1]!.amountUsdcMinor = '9999999999';
    expectCode(() => assertPortfolio(corrupt), 'ACCOUNTING_INVARIANT');
  });
});
