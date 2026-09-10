import assert from 'node:assert/strict';
import { contentHash, type Hex } from '@poa/domain';
import { evaluateEligibility } from '@poa/evaluation';
import { prepareSyntheticScenarioCheckpoint } from '@poa/experiments';
import {
  commitmentBatchHash,
  experimentIdHash,
  verifyProof,
} from '@poa/commitments';
import { M6Repository } from '@poa/storage';
import { createServer } from '../../apps/api/src/server.js';
import { bootstrap, isolatedRepository } from '../helpers/m3.js';
import { createM6ExportFixture } from '../helpers/m6.js';

const test = await isolatedRepository('poa_m6_db');
try {
  const started = await bootstrap(test.repository, 'm6-db');
  const portfolios = await test.repository.getPortfolios(started.experimentId);
  const references = await test.repository.getReferences(started.experimentId);
  const checkpointAt = new Date(Date.parse(started.policy.startsAt) + 300_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
  const outputs = [];
  for (const scenario of portfolios.scenarios) {
    const own = references.filter(
      (reference) => reference.scenarioId === scenario.scenarioId,
    );
    const prepared = await prepareSyntheticScenarioCheckpoint({
      checkpointId: `m6-${scenario.scenarioId}-checkpoint`,
      sequence: '1',
      checkpointAt,
      agent: scenario.portfolio,
      cashReference: own.find((reference) => reference.kind === 'CASH')!,
      conservativeYieldReference: own.find(
        (reference) => reference.kind === 'CONSERVATIVE_YIELD',
      )!,
    });
    outputs.push(
      await test.repository.saveScenarioCheckpoint(
        prepared.checkpoint,
        [],
        prepared.rawObjects,
        prepared.checkpointInputs,
      ),
    );
  }
  const repository = new M6Repository(test.pool);
  const eligibility = outputs.map((output) =>
    evaluateEligibility({
      experimentId: started.experimentId,
      scenarioId: output.checkpoint.scenarioId,
      policyHash: started.policyHash as Hex,
      checkpointHash: output.checkpoint.checkpointHash as Hex,
      resultProvenance: 'SYNTHETIC_TEST',
      networkProfile: started.policy.networkProfile,
      operationalStatus: 'COMPLIANT',
      economicStatus: 'CRITERIA_MET',
      statisticalStatus: 'NOT_ASSESSED',
      statisticalMethodVersion: null,
    }),
  );
  const [sameA, sameB] = await Promise.all([
    repository.saveEligibility(eligibility[0]!),
    repository.saveEligibility(eligibility[0]!),
  ]);
  assert.equal(contentHash(sameA), contentHash(sameB));
  await repository.saveEligibility(eligibility[1]!);
  await repository.saveEligibility(eligibility[2]!);
  const corrected = evaluateEligibility({
    experimentId: started.experimentId,
    scenarioId: eligibility[0]!.scenarioId,
    policyHash: started.policyHash as Hex,
    checkpointHash: eligibility[0]!.checkpointHash as Hex,
    resultProvenance: 'SYNTHETIC_TEST',
    networkProfile: started.policy.networkProfile,
    operationalStatus: 'VIOLATION',
    economicStatus: 'CRITERIA_NOT_MET',
    statisticalStatus: 'NOT_ASSESSED',
    statisticalMethodVersion: null,
    supersedesHash: contentHash(eligibility[0]!),
    dimensionReasonCodes: ['CORRECTION_RECALCULATED'],
  });
  await repository.saveEligibility(corrected);
  const history = await repository.getEligibility(started.experimentId);
  assert.equal(history.length, 4);
  assert.ok(
    history.some(
      (receipt) => contentHash(receipt) === contentHash(eligibility[0]!),
    ),
  );
  assert.equal(history.at(-1)!.supersedesHash, contentHash(eligibility[0]!));
  const events = await repository.auditEvents(started.experimentId);
  assert.equal(events.length, 4);
  assert.equal(
    events.at(-1)!.supersedesContentHash,
    contentHash(eligibility[0]!),
  );

  const [batchA, batchB] = await Promise.all([
    repository.createBatch(started.experimentId, 'm6-db-batch', '4'),
    repository.createBatch(started.experimentId, 'm6-db-batch', '4'),
  ]);
  assert.equal(batchA.batchHash, batchB.batchHash);
  assert.ok(batchA.proofs.every(verifyProof));
  await assert.rejects(
    repository.createBatch(started.experimentId, 'm6-gap-batch', '6'),
    (error: any) => error.code === 'BATCH_CONTINUITY',
  );
  const publication = {
    schemaVersion: 'proof-of-alpha/registry-publication-receipt/v1' as const,
    batchId: batchA.batch.batchId,
    batchHash: commitmentBatchHash(batchA.batch),
    experimentIdHash: experimentIdHash(started.experimentId),
    registryNetworkId: 'arc-testnet',
    chainId: '5042002',
    registryAddress: '0x1111111111111111111111111111111111111111',
    registryCodeHash: contentHash('db-registry-code'),
    publisherAddress: '0x2222222222222222222222222222222222222222',
    transactionHash: contentHash('db-publication'),
    block: {
      networkId: 'arc-testnet',
      environment: 'testnet' as const,
      chainId: '5042002',
      number: '100',
      hash: contentHash('db-block'),
      timestamp: checkpointAt,
      finality: 'FINALIZED' as const,
    },
    observedAt: checkpointAt,
    status: 'CONFIRMED' as const,
  };
  await repository.recordPublication(publication);
  await repository.recordPublication(publication);
  await assert.rejects(
    repository.recordPublication({
      ...publication,
      transactionHash: contentHash('duplicate-publication'),
    }),
    (error: any) => error.code === 'OPERATION_CONFLICT',
  );

  const restarted = new M6Repository(test.pool);
  assert.equal((await restarted.auditEvents(started.experimentId)).length, 4);
  assert.equal((await restarted.getBatches(started.experimentId)).length, 1);
  const dashboard = await restarted.dashboard(started.experimentId);
  assert.deepEqual(
    dashboard.scenarios.map((scenario) => scenario.initialAmountUsdcMinor),
    ['1000000000', '10000000000', '100000000000'],
  );
  assert.ok(
    dashboard.scenarios.every(
      (scenario) =>
        scenario.eligibility.overallStatus ===
          'NOT_ELIGIBLE_FOR_REAL_CAPITAL' &&
        scenario.eligibility.automaticFundingEnabled === false,
    ),
  );
  assert.equal(dashboard.effectiveIndependentSampleCount, '1');
  assert.equal(dashboard.commitment!.verified, true);
  await test.pool.query(
    `INSERT INTO experiments(experiment_id,agent_id,version_id,profile_id,state,created_at)
     SELECT 'm6-export-fixture',agent_id,version_id,profile_id,'DRAFT',clock_timestamp()
     FROM experiments WHERE experiment_id=$1`,
    [started.experimentId],
  );
  const exportFixture = createM6ExportFixture();
  await restarted.saveExport(exportFixture.bundle);
  assert.equal(
    contentHash(await restarted.getExport(exportFixture.bundle.exportId)),
    contentHash(exportFixture.bundle),
  );
  const api = createServer(async () => {}, test.repository, restarted);
  try {
    const dashboardResponse = await api.inject(
      `/v1/experiments/${started.experimentId}/dashboard`,
    );
    assert.equal(dashboardResponse.statusCode, 200);
    assert.equal(dashboardResponse.json().scenarios.length, 3);
    const proofResponse = await api.inject(
      `/v1/commitments/${batchA.batch.batchId}/proofs/${batchA.proofs[0]!.leafHash}`,
    );
    assert.equal(proofResponse.statusCode, 200);
    assert.equal(proofResponse.json().root, batchA.batch.root);
    const exportResponse = await api.inject(
      `/v1/exports/${exportFixture.bundle.exportId}`,
    );
    assert.equal(exportResponse.statusCode, 200);
    assert.equal(
      exportResponse.json().selectedResult.leafHash,
      exportFixture.bundle.selectedResult.leafHash,
    );
  } finally {
    await api.close();
  }
  await assert.rejects(
    test.pool.query("UPDATE audit_events SET payload='{}'::jsonb"),
    /append-only/,
  );
  await assert.rejects(
    test.pool.query('DELETE FROM eligibility_evaluations'),
    /append-only/,
  );
  await assert.rejects(
    test.pool.query("UPDATE reproducible_exports SET payload='{}'::jsonb"),
    /append-only/,
  );
  console.log(
    'PASS: M6 append-only reports/corrections, concurrent idempotency, ordered batches, proofs, duplicate publication, dashboard and database restart',
  );
} finally {
  await test.cleanup();
}
