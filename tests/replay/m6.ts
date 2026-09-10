import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyExport } from '@poa/commitments';

const bundle = JSON.parse(
  readFileSync('docs/evidence/m6-demo-export.json', 'utf8'),
);
const evidence = JSON.parse(
  readFileSync('docs/evidence/m6-registry-publication.json', 'utf8'),
);
const replay = verifyExport(bundle);
assert.equal(replay.root, evidence.batch.root);
assert.equal(replay.batchHash, evidence.batchHash);
assert.equal(
  replay.transactionHash,
  evidence.publicationReceipt.transactionHash,
);
assert.equal(bundle.resultProvenance, 'SYNTHETIC_TEST');
assert.ok(
  bundle.limitations.some((value: string) =>
    value.includes('never real-capital eligible'),
  ),
);
console.log(
  `M6 retained export replay verified: root ${replay.root}, publication ${replay.transactionHash}`,
);
