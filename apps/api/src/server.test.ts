import { expect, it } from 'vitest';
import { CatalogResponse } from '@poa/schemas';
import { createServer } from './server.js';

it('serves a validated catalog with disabled experiments and no invented results', async () => {
  const app = createServer(async () => {});
  try {
    const response = await app.inject('/v1/profiles');
    expect(response.statusCode).toBe(200);
    expect(
      CatalogResponse.parse(response.json()).experimentStartAvailable,
    ).toBe(false);
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/experiments' })).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
it('keeps liveness separate from database readiness and redacts failure details', async () => {
  const app = createServer(async () => {
    throw new Error('secret connection string');
  });
  try {
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    const result = await app.inject('/health/ready');
    expect(result.statusCode).toBe(503);
    expect(result.json()).toEqual({
      status: 'unavailable',
      code: 'DATABASE_UNAVAILABLE',
    });
  } finally {
    await app.close();
  }
});
