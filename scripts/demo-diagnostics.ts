import { readFileSync, writeFileSync } from 'node:fs';
import { buildDemoDiagnostic, replayDemoDiagnostic } from '@poa/experiments';
import { contentHash } from '@poa/domain';

if (process.argv[2] === '--replay') {
  const output = replayDemoDiagnostic(
    JSON.parse(readFileSync(process.argv[3]!, 'utf8')),
  );
  process.stdout.write(
    JSON.stringify({
      diagnosticHash: output.diagnosticHash,
      replayHash: contentHash(output),
      scenarios: output.scenarios.map(
        ({ snapshots: _snapshots, ...result }) => result,
      ),
    }),
  );
} else {
  for (const kind of ['FAILURE_STRESS', 'LONGER_REPLAY'] as const) {
    const bundle = buildDemoDiagnostic(kind);
    const output = replayDemoDiagnostic(bundle);
    if (process.argv.includes('--write'))
      writeFileSync(
        'tests/fixtures/m7-' + kind.toLowerCase() + '.json',
        JSON.stringify(bundle, null, 2) + '\n',
      );
    console.log(
      JSON.stringify({
        kind,
        diagnosticHash: contentHash(bundle),
        replayHash: contentHash(output),
        provenance: bundle.presentationProvenance,
        sourceProvenance: bundle.sourceProvenance,
        forwardObservationCount: '0',
      }),
    );
  }
}
