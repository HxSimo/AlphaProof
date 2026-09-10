import { loadBundle } from '@poa/config';
import {
  createPool,
  databaseReady,
  ExperimentRepository,
  M6Repository,
  migrate,
} from '@poa/storage';
import { createServer } from './server.js';

const pool = createPool();
await migrate(pool);
const config = loadBundle();
const repository = new ExperimentRepository(pool, {
  bundle: config.bundle,
  bundleHash: config.seal.bundleHash,
  allowSynthetic: process.env.POA_ENABLE_SYNTHETIC_M3 === '1',
});
const app = createServer(
  () => databaseReady(pool),
  repository,
  new M6Repository(pool),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    await pool.end();
  });
await app.listen({
  host: '0.0.0.0',
  port: Number(process.env.API_PORT ?? 3001),
});
console.log(
  JSON.stringify({
    service: 'api',
    milestone: 'M6',
    address: app.server.address(),
  }),
);
