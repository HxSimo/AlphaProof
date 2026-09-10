import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  CatalogResponse,
  DashboardResponse,
  OperationsSnapshot,
} from '@poa/schemas';

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
assert.ok(html.includes('CANONICAL READ-ONLY DASHBOARD'));
const operations = OperationsSnapshot.parse(
  await (await ready(`${api}/health/operations`)).json(),
);
assert.equal(operations.automaticFundingEnabled, false);
assert.ok(html.includes('Operations'));
const experimentId = process.env.POA_DEMO_EXPERIMENT_ID;
if (experimentId) {
  const dashboard = DashboardResponse.parse(
    await (
      await ready(`${api}/v1/experiments/${experimentId}/dashboard`)
    ).json(),
  );
  assert.equal(dashboard.scenarios.length, 3);
  assert.ok(dashboard.incidents.length > 0);
  assert.ok(html.includes('REFERENCE_UNAVAILABLE'));
  assert.ok(html.includes('WORKER_INTERRUPTED'));
  assert.ok(html.includes('Correlated policy views'));
  assert.ok(html.includes('NOT_ELIGIBLE_FOR_REAL_CAPITAL'));
  if (dashboard.commitment)
    assert.ok(html.includes(dashboard.commitment.batch.root));
  const download = await ready(`${web}/exports/${experimentId}`);
  assert.ok(
    download.headers.get('content-disposition')?.includes('attachment'),
  );
  assert.equal((await download.json()).policy.experimentId, experimentId);
  assert.equal(
    (
      await fetch(`${api}/v1/agents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
} else assert.ok(html.includes('No canonical demo experiment is configured'));
console.log(
  'PASS: API database readiness, validated disabled catalog, web renders canonical hash/provenance, operational state, authenticated controls and configured dashboard/export or explicit unavailable state',
);
