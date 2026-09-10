import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyExport } from '@poa/commitments';
import { contentHash } from '@poa/domain';
import { evaluateEligibility } from '@poa/evaluation';
import { EvaluationReceipt } from '@poa/schemas';
import { createM6CorrectedExportFixture } from '../helpers/m6.js';

if (process.argv[2] === '--child') {
  const result = verifyExport(
    JSON.parse(readFileSync(process.argv[3]!, 'utf8')),
  );
  const bundle = JSON.parse(readFileSync(process.argv[3]!, 'utf8'));
  const selected = EvaluationReceipt.parse(
    bundle.objects.find(
      (object: any) =>
        object.contentHash === bundle.selectedResult.objectContentHash,
    ).payload,
  );
  const reproduced = evaluateEligibility({
    experimentId: selected.experimentId,
    scenarioId: selected.scenarioId,
    policyHash: selected.policyHash as `0x${string}`,
    checkpointHash: selected.checkpointHash as `0x${string}`,
    resultProvenance: selected.resultProvenance,
    networkProfile: selected.networkProfile,
    operationalStatus: selected.operationalStatus,
    economicStatus: selected.economicStatus,
    statisticalStatus: selected.statisticalStatus,
    statisticalMethodVersion: selected.statisticalMethodVersion,
    supersedesHash: selected.supersedesHash as `0x${string}` | null,
  });
  process.stdout.write(
    JSON.stringify({
      ...result,
      reproducedReceiptHash: contentHash(reproduced),
    }),
  );
} else {
  const directory = mkdtempSync(join(tmpdir(), 'poa-m6-export-'));
  const file = join(directory, 'export.json');
  try {
    const fixture = createM6CorrectedExportFixture();
    writeFileSync(file, JSON.stringify(fixture.bundle));
    const direct = {
      ...verifyExport(fixture.bundle),
      reproducedReceiptHash: fixture.bundle.selectedResult.objectContentHash,
    };
    const child = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'tests/end-to-end/export-proof.ts',
          '--child',
          file,
        ],
        { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
      ),
    );
    assert.deepEqual(child, direct);
    assert.equal(
      child.selectedObjectHash,
      fixture.bundle.selectedResult.objectContentHash,
    );
    assert.equal(child.leafHash, fixture.bundle.selectedResult.leafHash);
    assert.equal(child.root, fixture.batch.root);
    assert.equal(
      child.reproducedReceiptHash,
      fixture.bundle.selectedResult.objectContentHash,
    );
    console.log(
      `PASS: fresh-process export replay verified selected object ${child.selectedObjectHash}, leaf ${child.leafHash} and root ${child.root}`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
