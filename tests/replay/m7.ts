import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { contentHash } from '@poa/domain';
import { replayDemoDiagnostic } from '@poa/experiments';

for (const kind of ['failure_stress', 'longer_replay']) {
  const file = 'tests/fixtures/m7-' + kind + '.json';
  const replay = replayDemoDiagnostic(JSON.parse(readFileSync(file, 'utf8')));
  const child = JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/demo-diagnostics.ts', '--replay', file],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(child.replayHash, contentHash(replay));
  console.log(
    'M7 ' + kind + ' independent replay verified: ' + child.replayHash,
  );
}
