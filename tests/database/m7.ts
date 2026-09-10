import assert from 'node:assert/strict';
import { contentHash, PoaError } from '@poa/domain';
import { loadOperationsPolicy } from '@poa/config';
import {
  ExperimentRepository,
  OperationsRepository,
  M6Repository,
} from '@poa/storage';
import { createServer } from '../../apps/api/src/server.js';
import { runActionWorkerOnce } from '../../apps/worker/src/worker.js';
import { bootstrap, envelopeFor, isolatedRepository } from '../helpers/m3.js';

const test = await isolatedRepository('poa_m7');
try {
  const policy = { ...loadOperationsPolicy(), requestsPerWindowPerClient: 3 };
  const ops = new OperationsRepository(test.pool, policy);
  assert.ok((await ops.snapshot()).alerts.includes('WORKER_STALE'));
  await ops.heartbeat('m7-worker', 'IDLE');
  assert.equal((await ops.snapshot()).status, 'HEALTHY');
  assert.equal((await ops.snapshot()).oldestRunnableAgeSeconds, null);
  const quotaResults = await Promise.all(
    Array.from({ length: 20 }, () => ops.consumeRequest(contentHash('client'))),
  );
  assert.equal(quotaResults.filter(Boolean).length, 3);
  assert.equal(
    (await new OperationsRepository(test.pool, policy).snapshot())
      .rejectedRequestCount,
    '17',
  );
  const started = await bootstrap(test.repository, 'm7');
  const incident = {
    incidentId: 'm7-outage',
    experimentId: started.experimentId,
    scenarioId: null,
    code: 'DATA_UNAVAILABLE' as const,
    severity: 'WARNING' as const,
    message: 'Synthetic outage demonstration; no values substituted.',
    evidenceHashes: [contentHash('outage-fixture')],
    resolvesIncidentId: null,
  };
  const incidents = await Promise.all([
    ops.recordIncident(incident),
    ops.recordIncident(incident),
  ]);
  assert.deepEqual(incidents[0], incidents[1]);
  assert.equal(
    (await new M6Repository(test.pool).auditEvents(started.experimentId))
      .length,
    1,
  );
  await assert.rejects(
    ops.recordIncident({ ...incident, message: 'changed' }),
    (e: any) => e.code === 'IDEMPOTENCY_CONFLICT',
  );
  await assert.rejects(
    test.pool.query('DELETE FROM operation_incidents'),
    /append-only/,
  );
  await ops.recordIncident({
    ...incident,
    incidentId: 'm7-recovery',
    code: 'RECOVERY_COMPLETED',
    severity: 'INFO',
    message: 'Original incident retained after recovery.',
    resolvesIncidentId: incident.incidentId,
  });
  assert.equal((await ops.snapshot()).openIncidentCount, '0');
  const other = await bootstrap(test.repository, 'other');
  await assert.rejects(
    ops.recordIncident({
      ...incident,
      incidentId: 'splice',
      experimentId: other.experimentId,
      resolvesIncidentId: incident.incidentId,
    }),
    (e: any) => e.code === 'PROVENANCE_SPLICE',
  );
  await test.repository.createExperiment({
    experimentId: 'same-profile',
    agentId: started.agentId,
    versionId: started.versionId,
    profileId: 'synthetic-m3-local',
  });
  await assert.rejects(
    test.repository.startExperiment('same-profile'),
    (e: any) => e.code === 'QUOTA_EXCEEDED',
  );
  const frozen = await test.repository.frozenProfile(started.experimentId);
  const altered = structuredClone(test.config.bundle);
  altered.profiles.profiles.find(
    (p) => p.profileId === 'ethereum-forward',
  )!.quotas.acceptedIntentsPerDayPerScenario = 1;
  const reconfigured = new ExperimentRepository(test.pool, {
    bundle: altered,
    bundleHash: test.config.seal.bundleHash,
    allowSynthetic: true,
  });
  assert.equal(
    contentHash(await reconfigured.frozenProfile(started.experimentId)),
    contentHash(frozen),
  );
  const accepted = await test.repository.acceptAction(
    started.experimentId,
    await envelopeFor(test.repository, started),
  );
  const actionId = accepted.record.actionId;
  await assert.rejects(
    runActionWorkerOnce(test.repository, 'crash-worker', {
      afterReceipt: () => {
        throw new Error('synthetic crash');
      },
    }),
    /synthetic crash/,
  );
  assert.equal(await test.repository.receiptCount(actionId), 1);
  const stored = (await test.repository.loadPlan(actionId))!
    .synthetic_input_bundle.receipts[0];
  await assert.rejects(
    test.repository.applyActionReceipt(actionId, {
      ...stored,
      sourceHashes: [contentHash('changed')],
    }),
    (e: any) => e.code === 'OPERATION_CONFLICT',
  );
  // Restart after the intent start deadline: prior execution remains resumable.
  await runActionWorkerOnce(reconfigured, 'restarted-worker', {
    now: () => Date.now() + 300_000,
  });
  assert.equal(
    (await reconfigured.getAction(started.experimentId, actionId)).record
      .status,
    'SUCCEEDED',
  );
  assert.equal(await test.repository.receiptCount(actionId), 2);
  const journalBefore = (
    await test.pool.query('SELECT count(*)::text AS n FROM economic_journal')
  ).rows[0].n;
  await test.repository.completeAction(actionId, 'SUCCEEDED');
  assert.equal(
    (await test.pool.query('SELECT count(*)::text AS n FROM economic_journal'))
      .rows[0].n,
    journalBefore,
  );
  const failed = await test.repository.acceptAction(
    other.experimentId,
    await envelopeFor(test.repository, other, {}, 'other-idempotency-key'),
  );
  await test.pool.query(
    'UPDATE jobs SET max_attempts=1 WHERE financial_identity=$1',
    [failed.record.actionId],
  );
  await assert.rejects(
    runActionWorkerOnce(test.repository, 'exhausted-worker', {
      afterReceipt: () => {
        throw new Error('synthetic final crash');
      },
    }),
  );
  const final = await test.repository.getAction(
    other.experimentId,
    failed.record.actionId,
  );
  assert.equal(final.record.status, 'PARTIALLY_SUCCEEDED');
  assert.ok(final.record.reasonCodes.includes('RETRY_EXHAUSTED'));
  assert.equal(
    (
      await test.pool.query(
        'SELECT active_action_id FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2',
        [other.experimentId, final.record.request.intent.capitalScenarioId],
      )
    ).rows[0].active_action_id,
    null,
  );
  assert.ok((await ops.snapshot()).alerts.includes('FAILED_JOBS'));
  const token = 'local-operator-test-token-32-characters';
  const apiOps = new OperationsRepository(test.pool, {
    ...policy,
    requestsPerWindowPerClient: 100,
  });
  const api = createServer(
    async () => {},
    test.repository,
    new M6Repository(test.pool),
    { operations: apiOps, requireControlAuth: true, controlToken: token },
  );
  try {
    assert.equal(
      (
        await api.inject({
          method: 'POST',
          url: '/v1/agents',
          payload: { agentId: 'attack', displayName: 'attack' },
        })
      ).statusCode,
      401,
    );
    assert.equal((await api.inject('/health/operations')).statusCode, 200);
    for (const authorization of [token, 'Bearer ' + 'é'.repeat(token.length)])
      assert.equal(
        (
          await api.inject({
            method: 'POST',
            url: '/v1/agents',
            headers: { authorization },
            payload: {},
          })
        ).statusCode,
        401,
      );
    const stop = {
      method: 'POST' as const,
      url: '/v1/experiments/' + started.experimentId + '/stop',
      headers: { authorization: 'Bearer ' + token },
      payload: {
        reason:
          'Timed rehearsal ended early; no completed economic experiment claimed.',
      },
    };
    assert.equal((await api.inject(stop)).statusCode, 200);
    assert.equal((await api.inject(stop)).statusCode, 200);
    assert.ok(
      (await ops.incidents(started.experimentId)).some(
        (i) => i.code === 'STOPPED_EARLY',
      ),
    );
    assert.equal(
      (
        await api.inject(
          '/v1/experiments/' + started.experimentId + '/incidents',
        )
      ).json().length,
      (await ops.incidents(started.experimentId)).length,
    );
  } finally {
    await api.close();
  }
  // Malformed traffic consumes ingress quota but creates no economic event.
  const rateApi = createServer(async () => {}, test.repository, undefined, {
    operations: ops,
  });
  const before = (
    await test.pool.query('SELECT count(*)::text AS n FROM economic_journal')
  ).rows[0].n;
  try {
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await rateApi.inject({
            method: 'POST',
            url: '/v1/agents',
            remoteAddress: '10.7.0.1',
            payload: '{',
            headers: { 'content-type': 'application/json' },
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (await rateApi.inject({ url: '/v1/profiles', remoteAddress: '10.7.0.1' }))
        .statusCode,
      429,
    );
    assert.equal((await rateApi.inject('/health/live')).statusCode, 200);
    assert.equal(
      (
        await test.pool.query(
          'SELECT count(*)::text AS n FROM economic_journal',
        )
      ).rows[0].n,
      before,
    );
  } finally {
    await rateApi.close();
  }
  await assert.rejects(
    test.repository.acceptAction(
      started.experimentId,
      await envelopeFor(
        test.repository,
        started,
        { nonce: '9' },
        'stopped-new-action',
      ),
    ),
    PoaError,
  );
  // A lost process at the final lease boundary may not gain another attempt.
  const lease = await bootstrap(test.repository, 'lease');
  const leaseEnvelope = await envelopeFor(test.repository, lease);
  const leaseAction = await test.repository.acceptAction(
    lease.experimentId,
    leaseEnvelope,
  );
  await test.pool.query(
    'UPDATE jobs SET max_attempts=1 WHERE financial_identity=$1',
    [leaseAction.record.actionId],
  );
  await test.repository.claimJob('lost-process');
  await test.pool.query(
    "UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second',available_at=clock_timestamp()-interval '3 minutes' WHERE financial_identity=$1",
    [leaseAction.record.actionId],
  );
  assert.ok((await ops.snapshot()).alerts.includes('QUEUE_LAG'));
  await runActionWorkerOnce(test.repository, 'lease-recovery');
  assert.equal(
    await test.repository.receiptCount(leaseAction.record.actionId),
    0,
  );
  assert.equal(
    (
      await test.repository.getAction(
        lease.experimentId,
        leaseAction.record.actionId,
      )
    ).record.status,
    'FAILED',
  );
  assert.equal(
    (
      await test.pool.query(
        'SELECT attempt FROM jobs WHERE financial_identity=$1',
        [leaseAction.record.actionId],
      )
    ).rows[0].attempt,
    1,
  );
  // Frozen accepted-intent quota wins over changed operator configuration.
  const limited = await bootstrap(reconfigured, 'limited');
  const limitedAction = await reconfigured.acceptAction(
    limited.experimentId,
    await envelopeFor(reconfigured, limited),
  );
  await runActionWorkerOnce(reconfigured, 'limited-worker');
  await assert.rejects(
    reconfigured.acceptAction(
      limited.experimentId,
      await envelopeFor(
        reconfigured,
        limited,
        { nonce: '2' },
        'quota-second-intent-0001',
      ),
    ),
    (e: any) => e.code === 'QUOTA_EXCEEDED',
  );
  assert.equal(
    (
      await reconfigured.getAction(
        limited.experimentId,
        limitedAction.record.actionId,
      )
    ).record.status,
    'SUCCEEDED',
  );
  // A byte-identical duplicate is still acknowledged after operator stop.
  const original = (
    await test.pool.query(
      'SELECT payload FROM action_intents WHERE action_id=$1',
      [actionId],
    )
  ).rows[0].payload;
  assert.equal(
    (await test.repository.acceptAction(started.experimentId, original)).record
      .actionId,
    actionId,
  );
  console.log(
    'PASS: M7 durable monitoring/rate concurrency, immutable incidents/recovery, frozen quotas, operator auth, worker expiry/restart/exhaustion, stop and provenance isolation',
  );
} finally {
  await test.cleanup();
}
