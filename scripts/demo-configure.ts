import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { PoaError } from '@poa/domain';
const file = process.env.POA_DEMO_OUTPUT ?? 'docs/evidence/m7-session.json';
const run = JSON.parse(readFileSync(file + '.run.json', 'utf8'));
if (
  !/^poa_m7_demo_[0-9_]+$/.test(run.databaseSchema) ||
  !/^m7-demo-[0-9]+$/.test(run.experimentId)
)
  throw new PoaError('CONFIG_INVALID', 'Unexpected retained demo metadata');
mkdirSync('.local', { recursive: true });
writeFileSync(
  '.local/m7-demo.env',
  `POA_DATABASE_OPTIONS=-c search_path=${run.databaseSchema}\nPOA_DEMO_EXPERIMENT_ID=${run.experimentId}\nPOA_ENABLE_SYNTHETIC_M3=1\n`,
);
console.log(
  'Local Docker demo selection written to .local/m7-demo.env; no keys copied.',
);
