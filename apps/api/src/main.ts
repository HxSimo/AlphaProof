import { createPool, databaseReady } from '@poa/storage';
import { createServer } from './server.js';
const pool = createPool();
const app = createServer(() => databaseReady(pool));
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
    milestone: 'M0',
    address: app.server.address(),
  }),
);
