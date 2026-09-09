import assert from 'node:assert/strict';
import { prepareSyntheticReferenceEntry } from '@poa/experiments';
import { initialDistributionHash } from '@poa/valuation';
import { bootstrap, isolatedRepository } from '../helpers/m3.js';

const test = await isolatedRepository('poa_m4_db');
try {
  const started = await bootstrap(test.repository, 'm4-db');
  const portfolios = await test.repository.getPortfolios(started.experimentId);
  const references = await test.repository.getReferences(started.experimentId);
  assert.equal(portfolios.scenarios.length, 3);
  assert.equal(references.length, 6);
  for (const scenario of portfolios.scenarios) {
    const own = references.filter(
      (reference) => reference.scenarioId === scenario.scenarioId,
    );
    assert.deepEqual(own.map((reference) => reference.kind).sort(), [
      'CASH',
      'CONSERVATIVE_YIELD',
    ]);
    assert.ok(
      own.every(
        (reference) =>
          reference.portfolio.initialValueUsdcMinor ===
          scenario.initialAmountUsdcMinor,
      ),
    );
    assert.ok(
      own.every(
        (reference) =>
          reference.initialDistributionHash ===
            initialDistributionHash(scenario.portfolio) &&
          reference.periodStartsAt === started.policy.startsAt &&
          reference.periodEndsAt === started.policy.endsAt &&
          reference.valuationConvention === 'MARK_AND_LIQUIDATION_ESTIMATE',
      ),
    );
    assert.equal(
      new Set([
        scenario.portfolio.portfolioId,
        ...own.map((reference) => reference.portfolio.portfolioId),
      ]).size,
      3,
    );
  }
  const failed = references.find(
    (reference) => reference.kind === 'CONSERVATIVE_YIELD',
  )!;
  const at = new Date(Date.parse(started.policy.startsAt) + 1_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
  const prepared = await prepareSyntheticReferenceEntry(failed, at, true);
  const applied = await test.repository.applyReferenceEntry(
    failed.referenceId,
    prepared.receipts,
    {
      status: prepared.status,
      reasonCodes: prepared.reasonCodes,
      bundle: prepared.bundle,
    },
  );
  assert.equal(applied.status, 'ENTRY_FAILED');
  assert.equal(applied.comparisonAvailable, false);
  assert.equal(applied.replacementAllowed, false);
  assert.equal(
    applied.portfolio.cash[0]?.amountUsdcMinor,
    failed.portfolio.initialValueUsdcMinor,
  );
  assert.equal(applied.portfolio.positions.length, 0);
  assert.equal(applied.portfolio.recognizedCosts.length, 2);
  const repeated = await test.repository.applyReferenceEntry(
    failed.referenceId,
    prepared.receipts,
    { status: 'ENTRY_FAILED', reasonCodes: prepared.reasonCodes },
  );
  assert.equal(repeated.portfolio.version, applied.portfolio.version);
  await assert.rejects(
    test.repository.applyReferenceEntry(failed.referenceId, prepared.receipts, {
      status: 'ACTIVE',
    }),
    (error: any) => error.code === 'EXPERIMENT_LOCKED',
  );
  await assert.rejects(
    test.pool.query(
      "UPDATE reference_portfolios SET frozen_instrument_id='replacement' WHERE reference_id=$1",
      [failed.referenceId],
    ),
    /cannot change/,
  );
  await assert.rejects(
    test.pool.query(
      "UPDATE reference_receipts SET payload='{}'::jsonb WHERE reference_id=$1",
      [failed.referenceId],
    ),
    /append-only/,
  );
  console.log(
    'PASS: M4 creates two equal-capital fixed references per scenario; failed entry retains cash and incurred costs, is idempotent, and cannot be replaced',
  );
} finally {
  await test.cleanup();
}
