import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replaySyntheticM3Bundle } from '@poa/experiments';

const file = process.argv[2];
assert.ok(file, 'Pass an archived M3 synthetic input bundle path');
const bundle = JSON.parse(readFileSync(file, 'utf8'));
const replayed = await replaySyntheticM3Bundle(bundle);
assert.equal(replayed.receiptsHash, bundle.expectedReceiptsHash);
console.log(
  JSON.stringify({ status: 'PASS', receiptsHash: replayed.receiptsHash }),
);
