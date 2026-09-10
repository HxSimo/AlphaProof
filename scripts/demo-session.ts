import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { contentHash, type Hex } from '@poa/domain';
import { evaluateEligibility } from '@poa/evaluation';
import {
  prepareSyntheticReferenceEntry,
  prepareSyntheticScenarioCheckpoint,
} from '@poa/experiments';
import {
  DemoSession,
  ExportObject,
  AgentVersionRecord,
  type ExportObjectData,
  type AuditEventData,
} from '@poa/schemas';
import { M6Repository, OperationsRepository } from '@poa/storage';
import { createServer } from '../apps/api/src/server.js';
import { runActionWorkerOnce } from '../apps/worker/src/worker.js';
import { isolatedRepository, TEST_PRIVATE_KEY } from '../tests/helpers/m3.js';
import { replayDemoSession } from './lib/session-replay.js';

import { rejectDemoTampering } from '../tests/end-to-end/demo-tamper.js';
const execute = promisify(execFile);
const testing = process.argv.includes('--test');
const directory = testing
  ? mkdtempSync(join(tmpdir(), 'poa-m7-session-'))
  : null;
const file =
  process.env.POA_DEMO_OUTPUT ||
  (directory
    ? join(directory, 'session.json')
    : 'docs/evidence/m7-session.json');
if (existsSync(file)) {
  console.log(
    JSON.stringify({
      status: 'RETAINED_REPLAY',
      file,
      ...(await replayDemoSession(JSON.parse(readFileSync(file, 'utf8')))),
    }),
  );
  process.exit(0);
}
const began = Date.now();
const test = await isolatedRepository('poa_m7_demo');
const m6 = new M6Repository(test.pool);
const ops = new OperationsRepository(test.pool);
const token = 'synthetic-demo-operator-token-for-local-tests';
const app = createServer(async () => {}, test.repository, m6, {
  operations: ops,
  requireControlAuth: true,
  controlToken: token,
});
const experimentId = 'm7-demo-' + began;
let complete = false;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const api = 'http://127.0.0.1:' + address.port;
  const submissions = [];
  for (const [index, scenarioId] of [
    'capital-1k',
    'capital-10k',
    'capital-100k',
  ].entries()) {
    const child = await execute(
      process.execPath,
      ['--import', 'tsx', 'examples/self-hosted-treasury-agent/src/main.ts'],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          POA_API_URL: api,
          POA_AGENT_PRIVATE_KEY: TEST_PRIVATE_KEY,
          POA_OPERATOR_TOKEN: token,
          POA_BOOTSTRAP_EXPERIMENT: index === 0 ? '1' : '0',
          POA_AGENT_ID: experimentId + '-agent',
          POA_AGENT_VERSION_ID: experimentId + '-version',
          POA_EXPERIMENT_ID: experimentId,
          POA_SCENARIO_ID: scenarioId,
          POA_IDEMPOTENCY_KEY: experimentId + '-intent-' + index,
        },
      },
    );
    submissions.push(JSON.parse(child.stdout.trim().split('\n').at(-1)!));
  }
  const initial = (
    await test.repository.getPortfolios(experimentId)
  ).scenarios.map((s) => s.portfolio);
  for (const submission of submissions) {
    const row = (
      await test.pool.query(
        'SELECT payload FROM action_intents WHERE action_id=$1',
        [submission.actionId],
      )
    ).rows[0];
    const duplicate = await fetch(
      api + '/v1/experiments/' + experimentId + '/actions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row.payload),
      },
    );
    assert.equal((await duplicate.json()).record.actionId, submission.actionId);
  }
  await assert.rejects(
    runActionWorkerOnce(test.repository, 'm7-crash', {
      afterReceipt: () => {
        throw new Error('rehearsed process loss');
      },
    }),
  );
  while (
    (await runActionWorkerOnce(test.repository, 'm7-restarted')).status !==
    'IDLE'
  ) {}
  await ops.heartbeat('m7-restarted', 'IDLE');
  const policy = await test.repository.getPolicy(experimentId);
  const profile = await test.repository.frozenProfile(experimentId);
  const agentVersion = AgentVersionRecord.parse(
    (
      await test.pool.query(
        'SELECT payload FROM agent_versions WHERE version_id=$1',
        [experimentId + '-version'],
      )
    ).rows[0].payload,
  );
  const entryAt = new Date(Date.parse(policy.startsAt) + 60_000).toISOString();
  const referenceEntries = [];
  for (const ref of (await test.repository.getReferences(experimentId)).filter(
    (r) => r.kind === 'CONSERVATIVE_YIELD',
  )) {
    const entry = await prepareSyntheticReferenceEntry(
      ref,
      entryAt,
      ref.scenarioId === 'capital-1k',
    );
    await test.repository.applyReferenceEntry(ref.referenceId, entry.receipts, {
      status: entry.status,
      bundle: entry.bundle,
    });
    referenceEntries.push(entry.bundle);
    if (entry.status === 'ENTRY_FAILED')
      await ops.recordIncident({
        incidentId: experimentId + '-reference-failed',
        experimentId,
        scenarioId: ref.scenarioId,
        code: 'REFERENCE_UNAVAILABLE',
        severity: 'WARNING',
        message:
          'Synthetic conservative entry failed after approval; cash and actual costs retained. No replacement selected.',
        evidenceHashes: [contentHash(entry.bundle)],
        resolvesIncidentId: null,
      });
  }
  const references = await test.repository.getReferences(experimentId);
  const checkpoints = [],
    eligibility = [];
  for (const scenario of (await test.repository.getPortfolios(experimentId))
    .scenarios) {
    const own = references.filter((r) => r.scenarioId === scenario.scenarioId);
    const prepared = await prepareSyntheticScenarioCheckpoint({
      checkpointId: experimentId + '-' + scenario.scenarioId + '-checkpoint',
      sequence: '1',
      checkpointAt: new Date(Date.parse(entryAt) + 300_000).toISOString(),
      agent: scenario.portfolio,
      cashReference: own.find((r) => r.kind === 'CASH')!,
      conservativeYieldReference: own.find(
        (r) => r.kind === 'CONSERVATIVE_YIELD',
      )!,
    });
    const output = await test.repository.saveScenarioCheckpoint(
      prepared.checkpoint,
      [],
      prepared.rawObjects,
      prepared.checkpointInputs,
    );
    checkpoints.push(
      await test.repository.getReplayBundle(prepared.checkpoint.checkpointId),
    );
    const receipt = evaluateEligibility({
      experimentId,
      scenarioId: scenario.scenarioId,
      policyHash: contentHash(policy),
      checkpointHash: output.checkpoint.checkpointHash as Hex,
      resultProvenance: 'SYNTHETIC_TEST',
      networkProfile: policy.networkProfile,
      operationalStatus: 'COMPLIANT',
      economicStatus: 'UNASSESSABLE',
      statisticalStatus: 'NOT_ASSESSED',
      statisticalMethodVersion: null,
    });
    eligibility.push(await m6.saveEligibility(receipt));
  }
  const actions = [];
  for (const submission of submissions) {
    const record = (
      await test.repository.getAction(experimentId, submission.actionId)
    ).record;
    const envelope = (
      await test.pool.query(
        'SELECT payload FROM action_intents WHERE action_id=$1',
        [submission.actionId],
      )
    ).rows[0].payload;
    const storedPlan = (await test.repository.loadPlan(submission.actionId))!;
    const inputBundle = storedPlan.synthetic_input_bundle;
    const plan = storedPlan.payload;
    const receipts = (
      await test.pool.query(
        'SELECT payload FROM accounting_receipts WHERE action_id=$1 ORDER BY applied_portfolio_version',
        [submission.actionId],
      )
    ).rows.map((r) => r.payload);
    actions.push({ record, envelope, plan, inputBundle, receipts });
  }
  const incidents = await ops.incidents(experimentId);
  const sourcePaths = [
    ...readdirSync('packages', { recursive: true })
      .filter(
        (path): path is string =>
          typeof path === 'string' &&
          /^[a-z-]+\/src\/[a-z0-9-]+\.ts$/.test(path),
      )
      .map((path) => 'packages/' + path),
    'scripts/lib/session-replay.ts',
    'package.json',
    'pnpm-lock.yaml',
    '.node-version',
  ].sort();
  const sourceFiles = sourcePaths.map((path) => {
    const utf8 = readFileSync(path, 'utf8');
    return { path, utf8, contentHash: contentHash(utf8) };
  });
  const objects: ExportObjectData[] = [];
  const add = async (
    objectType: ExportObjectData['objectType'],
    schemaVersion: string,
    payload: unknown,
    auditType: AuditEventData['objectType'],
  ) => {
    const object = ExportObject.parse({
      objectType,
      schemaVersion,
      payload,
      contentHash: contentHash(payload),
      experimentId,
      scenarioId: null,
      resultProvenance: 'SYNTHETIC_TEST',
    });
    if (objects.some((o) => o.contentHash === object.contentHash)) return;
    objects.push(object);
    await m6.appendAuditObject({
      experimentId,
      objectType: auditType,
      occurredAt: new Date().toISOString(),
      resultProvenance: 'SYNTHETIC_TEST',
      objectSchemaVersion: schemaVersion,
      objectContentHash: object.contentHash as Hex,
    });
  };
  await add('FROZEN_POLICY', policy.schemaVersion, policy, 'POLICY_LOCKED');
  await add(
    'FROZEN_CONFIGURATION',
    'proof-of-alpha/frozen-configuration/v1',
    { manifest: test.config.bundle, seal: test.config.seal, sourceFiles },
    'POLICY_LOCKED',
  );
  await add(
    'FROZEN_PROFILE',
    'proof-of-alpha/profile/v1',
    profile,
    'POLICY_LOCKED',
  );
  await add(
    'SCHEMA_CATALOG',
    'proof-of-alpha/schema-catalog/v1',
    JSON.parse(readFileSync('schemas/generated/v1.json', 'utf8')),
    'POLICY_LOCKED',
  );
  await add(
    'FROZEN_CONFIGURATION',
    agentVersion.schemaVersion,
    agentVersion,
    'AGENT_VERSION',
  );
  for (const action of actions)
    await add(
      'EXECUTION_RECEIPT',
      'proof-of-alpha/demo-action/v1',
      action,
      'EXECUTION',
    );
  for (const entry of referenceEntries)
    await add(
      'RAW_INPUT',
      'proof-of-alpha/reference-entry-replay/v1',
      entry,
      'EXECUTION',
    );
  for (const checkpoint of checkpoints)
    await add(
      'CHECKPOINT',
      'proof-of-alpha/checkpoint-replay/v1',
      checkpoint,
      'VALUATION',
    );
  for (const receipt of eligibility)
    await add(
      'ELIGIBILITY_EVALUATION',
      receipt.schemaVersion,
      receipt,
      'EVALUATION',
    );
  for (const incident of incidents)
    await add('INCIDENT', incident.schemaVersion, incident, 'INCIDENT');
  const auditEvents = await m6.auditEvents(experimentId);
  const built = await m6.createBatch(
    experimentId,
    experimentId + '-batch',
    auditEvents.at(-1)!.sequence,
  );
  const session = DemoSession.parse({
    schemaVersion: 'proof-of-alpha/demo-session/v1',
    sessionVersion: '0.7.0',
    createdAt: new Date().toISOString(),
    resultProvenance: 'SYNTHETIC_TEST',
    agentVersion,
    policy,
    policyHash: contentHash(policy),
    profile,
    initialPortfolios: initial,
    actions,
    referenceEntries,
    checkpoints,
    eligibility,
    incidents,
    objects,
    auditEvents,
    sourceFiles,
    commitment: { ...built, registryReceipt: null },
    limitations: [
      'Real SDK signatures and PostgreSQL receipt; economic observations are synthetic and clocks are compressed.',
      'No transaction is claimed for these virtual portfolios. Economic criteria are UNASSESSABLE: the frozen multi-day observation window is incomplete.',
      'The conservative entry failure, interrupted worker and all actual synthetic costs remain visible.',
      'This session has a local unpublished commitment until a verified Arc receipt is attached.',
      'Automatic funding and real-capital eligibility are disabled.',
    ],
    automaticFundingEnabled: false,
  });
  await replayDemoSession(session);
  if (testing) await rejectDemoTampering(session);
  await ops.saveDemoSession(session);
  const view = await m6.dashboard(experimentId);
  assert.equal(view.scenarios.length, 3);
  assert.equal(view.commitment, null);
  assert.equal(view.incidents.length, incidents.length);
  assert.equal(
    (await fetch(api + '/v1/experiments/' + experimentId + '/demo-export'))
      .status,
    200,
  );
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(session, null, 2) + '\n', { flag: 'wx' });
  const child = await execute(
    process.execPath,
    ['--import', 'tsx', 'scripts/replay-demo-session.ts', file],
    { encoding: 'utf8' },
  );
  assert.equal(JSON.parse(child.stdout).sessionHash, contentHash(session));
  const metadata = {
    status: 'PASS',
    file,
    sessionHash: contentHash(session),
    experimentId,
    databaseSchema: test.schema,
    elapsedMilliseconds: Date.now() - began,
    publicationStatus: 'UNPUBLISHED',
    resultProvenance: 'SYNTHETIC_TEST',
    forwardObservationCount: '0',
  };
  if (!testing)
    writeFileSync(
      file + '.run.json',
      JSON.stringify(metadata, null, 2) + '\n',
      { flag: 'wx' },
    );
  console.log(JSON.stringify(metadata));
  complete = true;
} finally {
  await app.close();
  if (testing) {
    await test.cleanup();
    if (directory) rmSync(directory, { recursive: true, force: true });
  } else {
    await test.closeRetained();
    if (!complete)
      console.error(
        'M7 preparation failed; retained schema for review: ' + test.schema,
      );
  }
}
