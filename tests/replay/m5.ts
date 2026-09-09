import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentHash } from '@poa/domain';
import { M5ReplayBundle } from '@poa/schemas';
import { replayTransfer } from '@poa/transfers';

const load = (path: string) =>
  M5ReplayBundle.parse(JSON.parse(readFileSync(path, 'utf8')));

if (process.argv[2] === '--child') {
  const bundle = load(process.argv[3]!);
  const result = replayTransfer(bundle.initial, bundle.events);
  process.stdout.write(`${contentHash(result.transfer)}\n`);
} else {
  const fixturePath = 'tests/fixtures/m5-cctp-lifecycle.json';
  const bundle = load(fixturePath);
  const direct = replayTransfer(bundle.initial, bundle.events);
  const root = mkdtempSync(join(tmpdir(), 'poa-m5-replay-'));
  try {
    const path = join(root, 'bundle.json');
    writeFileSync(path, readFileSync(fixturePath));
    const child = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'tests/replay/m5.ts', '--child', path],
      { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
    ).trim();
    assert.equal(child, contentHash(direct.transfer));
    assert.equal(direct.transfer.state, 'SETTLED');
    assert.ok(direct.transfer.deadlineStateHash);
    console.log(`M5 cross-process transfer replay verified: ${child}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
