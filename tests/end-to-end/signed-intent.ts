import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createServer } from '../../apps/api/src/server.js';
import { runActionWorkerOnce } from '../../apps/worker/src/worker.js';
import { isolatedRepository, TEST_PRIVATE_KEY } from '../helpers/m3.js';

const exec = promisify(execFile);
const test = await isolatedRepository('poa_m3_e2e');
const app = createServer(async () => {}, test.repository);
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const api = `http://127.0.0.1:${address.port}`;
  const oversized = await fetch(`${api}/v1/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: 'large', displayName: 'x'.repeat(70_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, 'PAYLOAD_TOO_LARGE');
  const child = await exec(
    process.execPath,
    ['--import', 'tsx', 'examples/self-hosted-treasury-agent/src/main.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POA_API_URL: api,
        POA_AGENT_PRIVATE_KEY: TEST_PRIVATE_KEY,
        POA_BOOTSTRAP_EXPERIMENT: '1',
        POA_AGENT_ID: 'process-agent',
        POA_AGENT_VERSION_ID: 'process-agent-v1',
        POA_EXPERIMENT_ID: 'process-experiment',
        POA_IDEMPOTENCY_KEY: 'process-intent-0001',
      },
    },
  );
  const submission = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
  assert.equal(submission.privateKeySent, false);
  assert.equal(submission.status, 'ACCEPTED');
  const stored = (
    await test.pool.query<any>(
      'SELECT payload,signed_bytes,received_at FROM action_intents WHERE action_id=$1',
      [submission.actionId],
    )
  ).rows[0];
  assert.ok(stored.signed_bytes.startsWith('0x'));
  assert.ok(stored.received_at);
  assert.ok(!JSON.stringify(stored).includes(TEST_PRIVATE_KEY.slice(2)));
  const duplicate = await fetch(
    `${api}/v1/experiments/process-experiment/actions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stored.payload),
    },
  );
  assert.equal(duplicate.status, 202);
  assert.equal((await duplicate.json()).record.actionId, submission.actionId);

  await assert.rejects(
    runActionWorkerOnce(test.repository, 'crashing-worker', {
      afterReceipt: (index) => {
        if (index === 0) throw new Error('simulated process loss');
      },
    }),
    /simulated process loss/,
  );
  assert.equal(await test.repository.receiptCount(submission.actionId), 1);
  const resumed = await runActionWorkerOnce(
    test.repository,
    'restarted-worker',
  );
  assert.equal(resumed.status, 'SUCCEEDED');
  assert.equal(await test.repository.receiptCount(submission.actionId), 2);
  const final = await test.repository.getAction(
    'process-experiment',
    submission.actionId,
  );
  assert.equal(final.record.status, 'SUCCEEDED');
  const portfolio = (await test.repository.getPortfolios('process-experiment'))
    .scenarios[0]!.portfolio;
  assert.equal(portfolio.version, '2');
  assert.equal(portfolio.positions.length, 1);
  assert.equal(portfolio.recognizedCosts.length, 2);
  assert.equal(
    (await test.pool.query('SELECT count(*)::int AS n FROM execution_plans'))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await test.pool.query('SELECT count(*)::int AS n FROM jobs')).rows[0].n,
    1,
  );
  const replayDirectory = mkdtempSync(join(tmpdir(), 'poa-m3-replay-'));
  try {
    const replayFile = join(replayDirectory, 'bundle.json');
    const bundle = (
      await test.pool.query<any>(
        'SELECT synthetic_input_bundle FROM execution_plans WHERE action_id=$1',
        [submission.actionId],
      )
    ).rows[0].synthetic_input_bundle;
    writeFileSync(replayFile, JSON.stringify(bundle));
    const replay = await exec(
      process.execPath,
      ['--import', 'tsx', 'tests/replay/m3.ts', replayFile],
      { cwd: process.cwd(), env: process.env },
    );
    assert.equal(
      JSON.parse(replay.stdout.trim()).receiptsHash,
      bundle.expectedReceiptsHash,
    );
  } finally {
    rmSync(replayDirectory, { recursive: true, force: true });
  }
  const nextEnvelope = await (
    await import('../helpers/m3.js')
  ).envelopeFor(
    test.repository,
    {
      agentId: 'process-agent',
      experimentId: 'process-experiment',
      policyHash: final.record.request.intent.policyHash,
    },
    { nonce: '2' },
    'process-partial-0001',
  );
  const partialAction = await test.repository.acceptAction(
    'process-experiment',
    nextEnvelope,
  );
  const { PoaError } = await import('@poa/domain');
  const partial = await runActionWorkerOnce(test.repository, 'partial-worker', {
    afterReceipt: (index) => {
      if (index === 0)
        throw new PoaError('LIMIT_EXCEEDED', 'Synthetic later-step failure');
    },
  });
  assert.equal(partial.status, 'PARTIALLY_SUCCEEDED');
  assert.equal(
    (
      await test.repository.getAction(
        'process-experiment',
        partialAction.record.actionId,
      )
    ).record.status,
    'PARTIALLY_SUCCEEDED',
  );
  assert.equal(
    await test.repository.receiptCount(partialAction.record.actionId),
    1,
  );
  const scenarios = (await test.repository.getPortfolios('process-experiment'))
    .scenarios;
  const afterPlanEnvelope = await (
    await import('../helpers/m3.js')
  ).envelopeFor(
    test.repository,
    {
      agentId: 'process-agent',
      experimentId: 'process-experiment',
      policyHash: final.record.request.intent.policyHash,
    },
    {
      capitalScenarioId: scenarios[1]!.scenarioId,
      expectedPortfolioVersion: '0',
      nonce: '3',
    },
    'process-after-plan-01',
  );
  const afterPlanAction = await test.repository.acceptAction(
    'process-experiment',
    afterPlanEnvelope,
  );
  await assert.rejects(
    runActionWorkerOnce(test.repository, 'after-plan-crash', {
      afterPlan: () => {
        throw new Error('crash after durable plan');
      },
    }),
    /crash after durable plan/,
  );
  assert.equal(
    await test.repository.receiptCount(afterPlanAction.record.actionId),
    0,
  );
  assert.equal(
    (await runActionWorkerOnce(test.repository, 'after-plan-restart')).status,
    'SUCCEEDED',
  );

  const afterReceiptsEnvelope = await (
    await import('../helpers/m3.js')
  ).envelopeFor(
    test.repository,
    {
      agentId: 'process-agent',
      experimentId: 'process-experiment',
      policyHash: final.record.request.intent.policyHash,
    },
    {
      capitalScenarioId: scenarios[2]!.scenarioId,
      expectedPortfolioVersion: '0',
      nonce: '4',
    },
    'process-after-receipts',
  );
  const afterReceiptsAction = await test.repository.acceptAction(
    'process-experiment',
    afterReceiptsEnvelope,
  );
  await assert.rejects(
    runActionWorkerOnce(test.repository, 'after-receipts-crash', {
      afterReceipt: (index) => {
        if (index === 1) throw new Error('crash after all durable receipts');
      },
    }),
    /crash after all durable receipts/,
  );
  assert.equal(
    await test.repository.receiptCount(afterReceiptsAction.record.actionId),
    2,
  );
  assert.equal(
    (await runActionWorkerOnce(test.repository, 'after-receipts-restart'))
      .status,
    'SUCCEEDED',
  );
  assert.equal(
    (await runActionWorkerOnce(test.repository, 'duplicate-delivery')).status,
    'IDLE',
  );
  console.log(
    'PASS: external SDK process kept key local, durable prospective receipt, exact duplicate, archived M2 replay, partial failure, and crashes after plan/receipt/final-receipt without duplicate effects',
  );
} finally {
  await app.close();
  await test.cleanup();
}
