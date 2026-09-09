import assert from 'node:assert/strict';
import { contentHash } from '@poa/domain';
import {
  prepareSyntheticReferenceEntry,
  prepareSyntheticScenarioCheckpoint,
  replaySyntheticReferenceEntryBundle,
} from '@poa/experiments';
import { replayM4 } from '@poa/evaluation';
import { runActionWorkerOnce } from '../../apps/worker/src/worker.js';
import { createServer } from '../../apps/api/src/server.js';
import { bootstrap, envelopeFor, isolatedRepository } from '../helpers/m3.js';

const test = await isolatedRepository('poa_m4_scenarios');
try {
  const started = await bootstrap(test.repository, 'm4-scenarios');
  const initial = await test.repository.getPortfolios(started.experimentId);
  assert.deepEqual(
    initial.scenarios.map((item) => item.initialAmountUsdcMinor),
    ['1000000000', '10000000000', '100000000000'],
  );
  const accepted = [];
  for (const [index, scenario] of initial.scenarios.entries()) {
    const envelope = await envelopeFor(
      test.repository,
      started,
      {
        capitalScenarioId: scenario.scenarioId,
        expectedPortfolioVersion: scenario.portfolio.version,
        nonce: String(index + 1),
      },
      `m4-scenario-intent-${index + 1}`,
    );
    accepted.push(
      await test.repository.acceptAction(started.experimentId, envelope),
    );
  }
  while (
    (await runActionWorkerOnce(test.repository, 'm4-scenario-worker'))
      .status !== 'IDLE'
  ) {}
  assert.equal(new Set(accepted.map((item) => item.record.actionId)).size, 3);
  const actionReceiptIdentities = (
    await test.pool.query<{ operation_id: string }>(
      'SELECT operation_id FROM accounting_receipts',
    )
  ).rows.map((row) => row.operation_id);
  assert.equal(actionReceiptIdentities.length, 6);
  assert.equal(new Set(actionReceiptIdentities).size, 6);
  const plans = (
    await test.pool.query<any>(
      'SELECT action_id,synthetic_input_bundle FROM execution_plans ORDER BY action_id',
    )
  ).rows;
  assert.equal(plans.length, 3);
  assert.equal(
    new Set(
      plans.map((row: any) => row.synthetic_input_bundle.replay.amountMinor),
    ).size,
    3,
  );
  assert.equal(
    new Set(
      plans.map((row: any) => row.synthetic_input_bundle.totalCostUsdcMinor),
    ).size,
    3,
  );
  assert.equal(
    new Set(
      plans.flatMap((row: any) =>
        row.synthetic_input_bundle.observations.map(
          (observation: any) => observation.observationId,
        ),
      ),
    ).size,
    12,
  );
  assert.equal(
    new Set(
      plans.flatMap((row: any) =>
        row.synthetic_input_bundle.observations
          .filter((observation: any) =>
            observation.observationId.includes('gas'),
          )
          .map((observation: any) => observation.rawObject.objectHash),
      ),
    ).size,
    6,
  );

  let references = await test.repository.getReferences(started.experimentId);
  const entryAt = new Date(Date.parse(started.policy.startsAt) + 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
  const entryBundles = [];
  for (const reference of references.filter(
    (item) => item.kind === 'CONSERVATIVE_YIELD',
  )) {
    const entry = await prepareSyntheticReferenceEntry(reference, entryAt);
    entryBundles.push(entry.bundle);
    await test.repository.applyReferenceEntry(
      reference.referenceId,
      entry.receipts,
      { status: entry.status, bundle: entry.bundle },
    );
    const replayed = await replaySyntheticReferenceEntryBundle(
      await test.repository.getReferenceEntryBundle(reference.referenceId),
    );
    assert.equal(replayed.bundle.receiptsHash, entry.bundle.receiptsHash);
  }
  assert.equal(
    new Set(entryBundles.map((bundle) => bundle.amountUsdcMinor)).size,
    3,
  );
  assert.equal(
    new Set(entryBundles.map((bundle) => bundle.receiptsHash)).size,
    3,
  );
  assert.equal(
    new Set(
      entryBundles.flatMap((bundle) =>
        bundle.observations.map((observation) => observation.observationId),
      ),
    ).size,
    12,
  );

  const current = await test.repository.getPortfolios(started.experimentId);
  references = await test.repository.getReferences(started.experimentId);
  const checkpointAt = new Date(Date.parse(entryAt) + 300_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
  const outputs = [];
  for (const scenario of current.scenarios) {
    const own = references.filter(
      (reference) => reference.scenarioId === scenario.scenarioId,
    );
    const cash = own.find((reference) => reference.kind === 'CASH')!;
    const conservative = own.find(
      (reference) => reference.kind === 'CONSERVATIVE_YIELD',
    )!;
    const prepared = await prepareSyntheticScenarioCheckpoint({
      checkpointId: `checkpoint-${scenario.scenarioId}-1`,
      sequence: '1',
      checkpointAt,
      agent: scenario.portfolio,
      cashReference: cash,
      conservativeYieldReference: conservative,
    });
    const saved = await test.repository.saveScenarioCheckpoint(
      prepared.checkpoint,
      [],
      prepared.rawObjects,
      prepared.checkpointInputs,
    );
    outputs.push(saved);
    const repeated = await test.repository.saveScenarioCheckpoint(
      prepared.checkpoint,
      [],
      prepared.rawObjects,
      prepared.checkpointInputs,
    );
    assert.equal(
      repeated.checkpoint.checkpointHash,
      saved.checkpoint.checkpointHash,
    );
    const replayBundle = await test.repository.getReplayBundle(
      prepared.checkpoint.checkpointId,
    );
    const replay = replayM4(replayBundle);
    assert.equal(
      replay.evaluation.evaluationHash,
      saved.evaluation.evaluationHash,
    );
    const missingSource = structuredClone(replayBundle);
    missingSource.checkpointInputs!.agent.accruals[0]!.sourceHash =
      contentHash('absent-m4-source');
    assert.throws(
      () => replayM4(missingSource),
      (error: any) => error.code === 'ARCHIVE_INTEGRITY',
    );
  }
  assert.equal(
    new Set(outputs.map((output) => output.checkpoint.amountQuoteHash)).size,
    3,
  );
  assert.ok(
    outputs.every(
      (output) =>
        output.checkpoint.agent.portfolio.positions[0]!.bookValueUsdcMinor >
        '0',
    ),
  );
  assert.ok(
    outputs.every(
      (output) => output.evaluation.agent.markValueUsdcMinor !== null,
    ),
  );
  assert.ok(
    outputs.every(
      (output) =>
        output.evaluation.agent.liquidationValueUsdcMinor !==
        output.evaluation.agent.markValueUsdcMinor,
    ),
  );
  assert.ok(
    outputs.every(
      (output) =>
        output.evaluation.comparisonAvailability.cash &&
        output.evaluation.comparisonAvailability.conservativeYield,
    ),
  );
  assert.ok(
    outputs.every(
      (output) =>
        output.evaluation.capitalScenarioRelationship ===
          'CORRELATED_POLICY_VIEWS' &&
        output.evaluation.effectiveIndependentSampleCount === '1',
    ),
  );
  assert.ok(
    outputs.every(
      (output) =>
        output.evaluation.realCapitalEligibility ===
        'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
    ),
  );
  const storedCheckpoints = await test.repository.getValuations(
    started.experimentId,
  );
  const storedEvaluations = await test.repository.getEvaluations(
    started.experimentId,
  );
  assert.equal(storedCheckpoints.length, 3);
  assert.equal(storedEvaluations.length, 3);
  assert.equal(
    new Set(storedCheckpoints.map((checkpoint) => checkpoint.checkpointAt))
      .size,
    1,
  );
  assert.equal(
    (
      await test.pool.query(
        'SELECT count(*)::int AS n FROM valuation_checkpoints',
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (
      await test.pool.query(
        'SELECT count(*)::int AS n FROM scenario_evaluations',
      )
    ).rows[0].n,
    3,
  );
  await assert.rejects(
    test.pool.query("UPDATE valuation_checkpoints SET payload='{}'::jsonb"),
    /append-only/,
  );
  assert.equal(
    contentHash(storedEvaluations),
    contentHash(outputs.map((output) => output.evaluation)),
  );
  const api = createServer(async () => {}, test.repository);
  try {
    assert.equal(
      (
        await api.inject(`/v1/experiments/${started.experimentId}/references`)
      ).json().length,
      6,
    );
    assert.equal(
      (
        await api.inject(`/v1/experiments/${started.experimentId}/valuations`)
      ).json().length,
      3,
    );
    assert.equal(
      (
        await api.inject(`/v1/experiments/${started.experimentId}/evaluations`)
      ).json().length,
      3,
    );
  } finally {
    await api.close();
  }
  console.log(
    'PASS: three separately signed scenario streams, amount-specific inputs/costs, two references, common checkpoints, accrual, replay, idempotency and correlated descriptive evaluation',
  );
} finally {
  await test.cleanup();
}
