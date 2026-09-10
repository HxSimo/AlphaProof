import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { contentHash } from '@poa/domain';
import {
  DemoSession,
  DemoRehearsal,
  type DemoRehearsalData,
} from '@poa/schemas';
import { replayDemoSession } from './lib/session-replay.js';
import { rejectDemoTampering } from '../tests/end-to-end/demo-tamper.js';
const execute = promisify(execFile);
const file =
  process.env.POA_REHEARSAL_EXPORT ?? 'docs/evidence/m7-session-published.json';
const session = DemoSession.parse(JSON.parse(readFileSync(file, 'utf8')));
const began = Date.now(),
  startedAt = new Date().toISOString();
const steps: DemoRehearsalData['steps'] = [];
async function step(
  name: string,
  script: string,
  args: string[] = [],
  extra: Record<string, string> = {},
) {
  const start = Date.now();
  const result = await execute(
    process.execPath,
    ['--import', 'tsx', script, ...args],
    {
      env: { ...process.env, ...extra },
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const status = result.stdout.includes('SKIPPED_TO_VERIFY')
    ? 'SKIPPED_TO_VERIFY'
    : 'PASS';
  steps.push({
    name,
    script,
    args,
    status,
    elapsedMilliseconds: Date.now() - start,
    output: result.stdout.trim(),
  });
  console.log(`${name}: ${status} (${Date.now() - start} ms)`);
}
await step(
  'External SDK → durable receipt → crash/restart → references → export/proof',
  'scripts/demo-session.ts',
  ['--test'],
  { POA_DEMO_OUTPUT: '' },
);
await step(
  'Delayed transfer, unresolved closure, withdrawal/failed swap, losses and longer labeled replay',
  'tests/replay/m7.ts',
);
await step(
  'Retained M5 transfer lifecycle replay (original provenance)',
  'tests/replay/m5.ts',
);
await step(
  'Retained M6 proof/correction replay (original provenance)',
  'tests/replay/m6.ts',
);
await step(
  'Independent selected M7 session replay',
  'scripts/replay-demo-session.ts',
  [file],
);
await step(
  'Ethereum forward activation boundary',
  'scripts/demo-forward-gate.ts',
);
await step(
  'Local deployment dashboard, incidents, controls and export',
  'tests/smoke.ts',
  [],
  { POA_DEMO_EXPERIMENT_ID: session.policy.experimentId },
);
await rejectDemoTampering(session);
assert.equal(
  (await replayDemoSession(session)).sessionHash,
  contentHash(session),
);
const report = DemoRehearsal.parse({
  schemaVersion: 'proof-of-alpha/demo-rehearsal/v1',
  startedAt,
  completedAt: new Date().toISOString(),
  elapsedMilliseconds: Date.now() - began,
  selectedExport: file,
  sessionCreatedAt: session.createdAt,
  sessionHash: contentHash(session),
  publication: session.commitment.registryReceipt,
  mode: 'LOCAL_REHEARSAL_WITH_RETAINED_TESTNET_ANCHOR',
  resultProvenance: 'SYNTHETIC_TEST',
  freshEthereumSession: false,
  forwardObservationCount: '0',
  modifiedLeafRejected: true,
  steps,
  limitations: [
    'Timing measures software rehearsal, not the economic observation period.',
    'Retained testnet receipts retain their original block/date; no new transaction is claimed by replay.',
    'Longer August replay inputs are synthetic; they add no forward observations.',
  ],
  automaticFundingEnabled: false,
});
const reportFile =
  process.env.POA_REHEARSAL_REPORT ?? 'docs/evidence/m7-rehearsal.json';
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'PASS',
    elapsedMilliseconds: report.elapsedMilliseconds,
    reportFile,
    reportHash: contentHash(report),
    retainedPublication: report.publication?.transactionHash ?? null,
    freshEthereumSession: false,
  }),
);
