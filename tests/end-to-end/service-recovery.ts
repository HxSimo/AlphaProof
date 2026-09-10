import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { contentHash } from '@poa/domain';
import {
  DemoSession,
  OperationsSnapshot,
  DashboardResponse,
} from '@poa/schemas';
const execute = promisify(execFile);
const session = DemoSession.parse(
  JSON.parse(readFileSync('docs/evidence/m7-session-published.json', 'utf8')),
);
const api = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
if (!/^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(api))
  throw new Error('RECOVERY_REQUIRES_LOCALHOST');
const url = api + '/v1/experiments/' + session.policy.experimentId;
async function json(path: string) {
  const response = await fetch(path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return response.json();
}
const before = DemoSession.parse(await json(url + '/demo-export'));
const operations = OperationsSnapshot.parse(
  await json(api + '/health/operations'),
);
assert.ok(
  operations.jobs.every(
    (job) =>
      !['READY', 'RETRY', 'RUNNING'].includes(job.state) || job.count === '0',
  ),
  'Reconcile active jobs before an operational restart',
);
assert.equal(contentHash(before), contentHash(session));
const startedAt = new Date().toISOString(),
  began = Date.now();
await execute(
  'docker',
  [
    'compose',
    '--env-file',
    '.env',
    '--env-file',
    '.local/m7-demo.env',
    'restart',
    'postgres',
    'api',
    'worker',
  ],
  { timeout: 90000 },
);
let restored = false;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    await json(api + '/health/ready');
    restored = true;
    break;
  } catch {
    await setTimeout(1000);
  }
}
assert.ok(restored, 'Database/API did not recover');
const after = DemoSession.parse(await json(url + '/demo-export'));
assert.equal(contentHash(after), contentHash(before));
const dashboard = DashboardResponse.parse(await json(url + '/dashboard'));
assert.equal(
  dashboard.commitment!.registryReceipt.transactionHash,
  session.commitment.registryReceipt!.transactionHash,
);
assert.ok(dashboard.incidents.length >= 2);
const report = {
  schemaVersion: 'proof-of-alpha/service-recovery-evidence/v1',
  startedAt,
  completedAt: new Date().toISOString(),
  elapsedMilliseconds: Date.now() - began,
  servicesRestarted: ['postgres', 'api', 'worker'],
  experimentId: session.policy.experimentId,
  beforeExportHash: contentHash(before),
  afterExportHash: contentHash(after),
  publication: session.commitment.registryReceipt!.transactionHash,
  status: 'PASS',
  resultProvenance: 'SYNTHETIC_TEST',
  automaticFundingEnabled: false,
};
writeFileSync(
  process.env.POA_RECOVERY_REPORT ?? 'docs/evidence/m7-service-recovery.json',
  JSON.stringify(report, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(report));
