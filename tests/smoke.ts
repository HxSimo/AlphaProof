import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { CatalogResponse } from '@poa/schemas';

const api = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const web = process.env.SMOKE_WEB_URL ?? 'http://localhost:3000';
async function ready(url: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response;
    } catch {
      /* startup race */
    }
    await setTimeout(1000);
  }
  throw new Error(`Service did not become ready: ${url}`);
}
await ready(`${api}/health/ready`);
const response = await ready(`${api}/v1/profiles`);
const data = CatalogResponse.parse(await response.json());
assert.equal(data.profiles.length, 3);
assert.ok(data.profiles.every((p) => !p.enabled && p.blockers.length > 0));
const html = await (await ready(web)).text();
assert.ok(
  html.includes(data.bundleHash),
  'Web must render the canonical API bundle hash',
);
for (const profile of data.profiles)
  assert.ok(html.includes(profile.resultProvenance));
assert.ok(html.includes('External profiles remain closed'));
console.log(
  'PASS: API database readiness, validated disabled catalog, web renders API hash/provenance/limitations',
);
