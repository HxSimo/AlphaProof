import { expect, it } from 'vitest';
import { contentHash } from '@poa/domain';
import { applyReceipt } from '@poa/accounting';
import { buildDemoDiagnostic, replayDemoDiagnostic } from './m7.js';

it('preserves withdrawal cash, failed swap costs, transit closure and one settlement under restarts', () => {
  const fixture = buildDemoDiagnostic('FAILURE_STRESS');
  const replay = replayDemoDiagnostic(fixture);
  expect(
    new Set(fixture.scenarios.map((s) => s.receipts[3]!.sourceHashes[0])).size,
  ).toBe(3);
  for (const [i, scenario] of replay.scenarios.entries()) {
    expect(scenario.snapshots[2]!.portfolio.positions).toHaveLength(0);
    expect(scenario.snapshots[3]!.portfolio.recognizedCosts).toHaveLength(4);
    expect(scenario.snapshots[6]!.portfolio.receivables[0]!.state).toBe(
      'DELAYED',
    );
    expect(scenario.unresolvedAtClosure).not.toBeNull();
    expect(scenario.snapshots.at(-1)!.portfolio.receivables).toHaveLength(0);
    expect(scenario.snapshots.at(-1)!.portfolio.deadlineStateHash).toBe(
      scenario.snapshots[7]!.portfolio.deadlineStateHash,
    );
    expect(scenario.references).toHaveLength(2);
    const state = scenario.snapshots.at(-1)!.portfolio;
    expect(() =>
      applyReceipt(state, {
        ...fixture.scenarios[i]!.receipts[1]!,
        operationId: 'late-deposit',
        expectedPortfolioVersion: state.version,
      }),
    ).toThrow();
  }
});

it('replays thirty dated days with losses and both fixed references without forward history', () => {
  const fixture = buildDemoDiagnostic('LONGER_REPLAY');
  const replay = replayDemoDiagnostic(fixture);
  expect(fixture.presentationProvenance).toBe('HISTORICAL_REPLAY');
  expect(fixture.sourceProvenance).toBe('SYNTHETIC_TEST');
  expect(replay.forwardObservationCount).toBe('0');
  for (const scenario of replay.scenarios) {
    expect(scenario.snapshots).toHaveLength(32);
    expect(BigInt(scenario.maxDrawdownBps)).toBeGreaterThan(0n);
    expect(scenario.unavailableMark).toBeNull();
    expect(scenario.references.map((r) => r.kind)).toEqual([
      'CASH',
      'CONSERVATIVE_YIELD',
    ]);
    expect(BigInt(scenario.markValueUsdcMinor)).toBeLessThan(
      BigInt(scenario.cashReferenceUsdcMinor),
    );
  }
  expect(
    contentHash(replayDemoDiagnostic(JSON.parse(JSON.stringify(fixture)))),
  ).toBe(contentHash(replay));
});

it('fails closed on missing objects, altered receipt mechanics and provenance splicing', () => {
  const fixture = buildDemoDiagnostic('LONGER_REPLAY');
  const missing = structuredClone(fixture);
  missing.rawInputs.shift();
  expect(() => replayDemoDiagnostic(missing)).toThrow();
  const missingReferenceGas = structuredClone(fixture);
  const gasHash =
    missingReferenceGas.scenarios[0]!.references[1]!.receipts[0]!
      .sourceHashes[1];
  missingReferenceGas.rawInputs = missingReferenceGas.rawInputs.filter(
    (o) => o.contentHash !== gasHash,
  );
  expect(() => replayDemoDiagnostic(missingReferenceGas)).toThrow(/every cost/);
  const splice = structuredClone(fixture);
  splice.scenarios[0]!.initial.resultProvenance = 'FORWARD_SHADOW';
  expect(() => replayDemoDiagnostic(splice)).toThrow(/forward/);
  const changed = structuredClone(fixture);
  const receipt = changed.scenarios[0]!.receipts[2]!;
  if (receipt.kind === 'ACCRUE') receipt.nextIndexNumerator = '999999';
  expect(() => replayDemoDiagnostic(changed)).toThrow(/captured mechanics/);
});
