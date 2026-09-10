import { readFileSync } from 'node:fs';
import { contentHash, PoaError } from '@poa/domain';
import { replayDemoSession } from './lib/session-replay.js';

const session = JSON.parse(
  readFileSync(process.argv[2] ?? 'docs/evidence/m7-session.json', 'utf8'),
);
for (const source of session.sourceFiles) {
  if (
    !/^(packages\/[a-z-]+\/src\/[a-z0-9-]+\.ts|scripts\/lib\/session-replay\.ts|package\.json|pnpm-lock\.yaml|\.node-version)$/.test(
      source.path,
    ) ||
    contentHash(readFileSync(source.path, 'utf8')) !== source.contentHash
  )
    throw new PoaError(
      'VERSION_DRIFT',
      'Replay source differs; restore the archived source revision',
    );
}
console.log(JSON.stringify(await replayDemoSession(session)));
