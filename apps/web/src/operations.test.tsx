import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { OperationsSnapshot } from '@poa/schemas';
import { OperationsView } from '../app/operations-view.js';
it('does not turn missing monitoring into healthy status', () => {
  const html = renderToStaticMarkup(
    createElement(OperationsView, { data: null }),
  );
  expect(html).toContain('monitoring unavailable');
  expect(html).not.toContain('HEALTHY');
});
it('renders canonical retry, incident and stale-worker state without a financial inference', () => {
  const data = OperationsSnapshot.parse({
    schemaVersion: 'proof-of-alpha/operations-snapshot/v1',
    observedAt: '2026-09-10T12:00:00.000Z',
    policyHash: '0x' + '1'.repeat(64),
    status: 'DEGRADED',
    alerts: ['WORKER_STALE', 'FAILED_JOBS'],
    jobs: [{ state: 'FAILED', count: '1', maxAttempt: '3' }],
    oldestRunnableAgeSeconds: null,
    workers: [
      {
        workerId: 'lost-worker',
        lastSeenAt: '2026-09-10T11:00:00.000Z',
        lastStatus: 'RUNNING',
        stale: true,
      },
    ],
    openIncidentCount: '2',
    rejectedRequestCount: '17',
    automaticFundingEnabled: false,
  });
  const html = renderToStaticMarkup(createElement(OperationsView, { data }));
  for (const text of [
    'DEGRADED',
    'WORKER_STALE',
    'FAILED_JOBS',
    '17',
    'Unavailable',
    'does not confer economic',
  ])
    expect(html).toContain(text);
});
