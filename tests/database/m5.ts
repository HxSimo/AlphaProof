import assert from 'node:assert/strict';
import { createPortfolio } from '@poa/accounting';
import { contentHash } from '@poa/domain';
import { TransferRepository } from '@poa/storage';
import { createTransfer } from '@poa/transfers';
import type { TransferLifecycleEventData } from '@poa/schemas';
import { bootstrap, isolatedRepository } from '../helpers/m3.js';

const hash = (n: number) => `0x${String(n).repeat(64)}` as `0x${string}`;
const event = (
  sequence: number,
  kind: TransferLifecycleEventData['kind'],
  minute: number,
  extras: Partial<TransferLifecycleEventData> = {},
): TransferLifecycleEventData => ({
  schemaVersion: 'proof-of-alpha/transfer-event/v1',
  transferVersion: '1.0.0',
  eventId: `db-event-${sequence}-${kind.toLowerCase().replaceAll('_', '-')}`,
  transferId: 'db-transfer',
  sequence: String(sequence),
  kind,
  messageIdentity: null,
  sourceHash: hash((sequence % 8) + 1),
  occurredAt: `2026-09-09T12:${String(minute).padStart(2, '0')}:00.000Z`,
  chainReceipt: null,
  attestationHash: null,
  reasonCode: null,
  ...extras,
});

const test = await isolatedRepository('poa_m5_db');
try {
  const started = await bootstrap(test.repository, 'm5-db');
  const scenario = (await test.repository.getPortfolios(started.experimentId))
    .scenarios[0]!;
  const portfolio = createPortfolio({
    experimentId: started.experimentId,
    scenarioId: scenario.scenarioId,
    portfolioId: scenario.portfolio.portfolioId,
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: scenario.initialAmountUsdcMinor,
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
    initialCash: [
      {
        viewId: 'sepolia-usdc',
        amountUsdcMinor: scenario.initialAmountUsdcMinor,
      },
    ],
  });
  await test.pool.query(
    'UPDATE capital_scenarios SET portfolio=$3::jsonb,portfolio_version=0 WHERE experiment_id=$1 AND scenario_id=$2',
    [started.experimentId, scenario.scenarioId, JSON.stringify(portfolio)],
  );
  const transfer = createTransfer({
    transferId: 'db-transfer',
    experimentId: started.experimentId,
    scenarioId: scenario.scenarioId,
    routeId: 'cctp-sepolia-to-arc-testnet',
    reservationId: 'db-reservation',
    sourceCashViewId: 'sepolia-usdc',
    destinationCashViewId: 'arc-usdc-erc20',
    amountUsdcMinor: '100000000',
    netReceivableUsdcMinor: '99999000',
    evidenceMode: 'SYNTHETIC',
    resultProvenance: 'SYNTHETIC_TEST',
    createdAt: '2026-09-09T12:00:00.000Z',
    maxDestinationAttempts: '2',
  });
  let repository = new TransferRepository(test.pool);
  await repository.create(transfer);
  assert.equal(
    (await repository.claim('worker-before-crash', 0))?.transferId,
    transfer.transferId,
  );
  repository = new TransferRepository(test.pool);
  assert.equal(
    (await repository.claim('worker-after-restart', 0))?.transferId,
    transfer.transferId,
  );
  const reserve = event(0, 'RESERVED', 0);
  const [a, b] = await Promise.all([
    repository.appendEvent(transfer.transferId, reserve),
    repository.appendEvent(transfer.transferId, reserve),
  ]);
  assert.equal(contentHash(a), contentHash(b));
  assert.equal((await repository.events(transfer.transferId)).length, 1);
  await repository.appendEvent(
    transfer.transferId,
    event(1, 'BURN_CONFIRMED', 1, { messageIdentity: 'db-message' }),
    [
      {
        costId: 'db-source-fee',
        category: 'TRANSFER_FEE',
        funding: 'WITHHELD',
        amountUsdcMinor: '1000',
        networkId: 'ethereum-sepolia',
        cashBalanceFamilyId: null,
        sourceHash: hash(2),
      },
    ],
  );
  assert.equal(
    (
      await test.pool.query(
        "SELECT state FROM cctp_transfer_jobs WHERE transfer_id='db-transfer'",
      )
    ).rows[0].state,
    'READY',
  );
  repository = new TransferRepository(test.pool); // process restart
  await repository.appendEvent(
    transfer.transferId,
    event(2, 'ATTESTATION_OBSERVED', 2, { messageIdentity: 'db-message' }),
  );
  await repository.appendEvent(
    transfer.transferId,
    event(3, 'DESTINATION_FAILED', 3, {
      messageIdentity: 'db-message',
      reasonCode: 'DESTINATION_RPC',
    }),
    [
      {
        costId: 'db-retry-gas',
        category: 'RETRY_GAS',
        funding: 'PAYABLE',
        amountUsdcMinor: '5',
        networkId: 'arc-testnet',
        cashBalanceFamilyId: null,
        sourceHash: hash(4),
      },
    ],
  );
  await repository.appendEvent(
    transfer.transferId,
    event(4, 'ATTESTATION_OBSERVED', 4, { messageIdentity: 'db-message' }),
  );
  const settledEvent = event(5, 'DESTINATION_CONFIRMED', 5, {
    messageIdentity: 'db-message',
  });
  const settled = await repository.appendEvent(
    transfer.transferId,
    settledEvent,
  );
  assert.equal(settled.state, 'SETTLED');
  const repeated = await repository.appendEvent(
    transfer.transferId,
    settledEvent,
  );
  assert.equal(contentHash(repeated), contentHash(settled));
  const row = (
    await test.pool.query<any>(
      'SELECT portfolio FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2',
      [started.experimentId, scenario.scenarioId],
    )
  ).rows[0];
  assert.equal(row.portfolio.receivables.length, 0);
  assert.equal(
    row.portfolio.cash.find((x: any) => x.balanceFamilyId === 'arc-usdc')
      .amountUsdcMinor,
    '99999000',
  );
  assert.equal(
    (
      await test.pool.query(
        "SELECT count(*)::int n FROM cctp_transfer_accounting_receipts WHERE transfer_id='db-transfer'",
      )
    ).rows[0].n,
    6,
  );
  await assert.rejects(
    test.pool.query("UPDATE cctp_transfer_events SET payload='{}'::jsonb"),
    /append-only/,
  );

  const failure = createTransfer({
    ...transfer,
    transferId: 'failed-transfer',
    reservationId: 'failed-reservation',
    createdAt: '2026-09-09T13:00:00.000Z',
  });
  await repository.create(failure);
  const failedReserve = {
    ...event(0, 'RESERVED', 0),
    transferId: 'failed-transfer',
    eventId: 'failed-reserve',
    occurredAt: '2026-09-09T13:00:00.000Z',
  };
  await repository.appendEvent(failure.transferId, failedReserve);
  await repository.appendEvent(
    failure.transferId,
    {
      ...event(1, 'SOURCE_FAILED', 1, { reasonCode: 'SOURCE_REVERT' }),
      transferId: 'failed-transfer',
      eventId: 'failed-source',
      occurredAt: '2026-09-09T13:01:00.000Z',
    },
    [
      {
        costId: 'failed-gas',
        category: 'SOURCE_GAS',
        funding: 'WITHHELD',
        amountUsdcMinor: '9',
        networkId: 'ethereum-sepolia',
        cashBalanceFamilyId: null,
        sourceHash: hash(2),
      },
    ],
  );
  const failedState = await repository.load(failure.transferId);
  assert.equal(failedState.state, 'SOURCE_FAILED');
  console.log(
    'PASS: M5 atomic transfer events/accounting, concurrent duplicate delivery, same-message retry, exactly-once settlement, source failure and database restart',
  );
} finally {
  await test.cleanup();
}
