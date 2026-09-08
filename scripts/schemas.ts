import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as schemas from '@poa/schemas';
import { canonicalJson } from '@poa/domain';

// Zod JSON Schema exports structural validation. Cross-field invariants remain
// in the versioned TS validator and tests; a JSON-only parse cannot replace it.
const output: Record<string, unknown> = {};
for (const [name, schema] of Object.entries(schemas)) {
  if (schema && typeof schema === 'object' && 'toJSONSchema' in schema) {
    output[name] = (schema as { toJSONSchema(): unknown }).toJSONSchema();
  }
}
const text =
  JSON.stringify(
    {
      schemaVersion: 'proof-of-alpha/schema-catalog/v1',
      semanticValidation:
        'packages/schemas + packages/config; see docs/schemas.md',
      schemas: output,
    },
    null,
    2,
  ) + '\n';
const file = 'schemas/generated/v1.json';
if (process.argv[2] === 'write') {
  mkdirSync('schemas/generated', { recursive: true });
  writeFileSync(file, text);
} else if (
  canonicalJson(JSON.parse(readFileSync(file, 'utf8'))) !==
  canonicalJson(JSON.parse(text))
)
  throw new Error('Generated schema drift: run pnpm schemas:generate');
console.log(
  `Schema catalog: ${Object.keys(output).length} definitions checked`,
);
