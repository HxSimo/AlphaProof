import { expect, it } from 'vitest';
import { contentHash } from '@poa/domain';
import { verifyExport } from '@poa/commitments';
import {
  createM6CorrectedExportFixture,
  createM6ExportFixture,
} from '../helpers/m6.js';

it('verifies every object, audit event, batch, proof and selected proof across a complete export', () => {
  const fixture = createM6ExportFixture();
  const result = verifyExport(fixture.bundle);
  expect(result.root).toBe(fixture.batch.root);
  expect(result.transactionHash).toBe(fixture.receipt.transactionHash);
});

it('fails closed on tampering, missing objects, version drift and provenance splicing', () => {
  const fixture = createM6ExportFixture();
  const tampered = structuredClone(fixture.bundle);
  (tampered.objects.at(-1)!.payload as Record<string, unknown>).overallStatus =
    'ELIGIBLE_UNDER_POLICY';
  expect(() => verifyExport(tampered)).toThrow();

  const missing = structuredClone(fixture.bundle);
  missing.objects = missing.objects.filter(
    (object) => object.objectType !== 'SIGNED_INTENT',
  );
  expect(() => verifyExport(missing)).toThrow();

  const drift = structuredClone(fixture.bundle);
  drift.engineVersions.accounting = '2.0.0';
  expect(() => verifyExport(drift)).toThrow(/Unsupported accounting/);

  const splice = structuredClone(fixture.bundle);
  const input = splice.objects.find(
    (object) => object.objectType === 'RAW_INPUT',
  )!;
  input.experimentId = 'another-experiment';
  expect(() => verifyExport(splice)).toThrow(/combines experiments/);

  const wrongRequired = structuredClone(fixture.bundle);
  wrongRequired.requiredObjectHashes.push(contentHash('absent'));
  expect(() => verifyExport(wrongRequired)).toThrow(/Required export object/);

  const missingLeaf = structuredClone(fixture.bundle);
  missingLeaf.leaves.pop();
  expect(() => verifyExport(missingLeaf)).toThrow(/every audit event/);

  const missingProof = structuredClone(fixture.bundle);
  missingProof.proofs.pop();
  expect(() => verifyExport(missingProof)).toThrow(/one proof per leaf/);

  const missingReceipt = structuredClone(
    createM6CorrectedExportFixture().bundle,
  );
  missingReceipt.registryReceipts.pop();
  expect(() => verifyExport(missingReceipt)).toThrow(/registry receipt/);
});
