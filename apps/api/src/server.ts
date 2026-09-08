import Fastify from 'fastify';
import { catalog } from '@poa/config';

export function createServer(
  checkDatabase: () => Promise<void> = async () => {
    throw new Error('Database not configured');
  },
) {
  const config = catalog();
  const app = Fastify({ bodyLimit: 65536, logger: false });
  app.get('/health/live', async () => ({ status: 'ok', milestone: 'M0' }));
  app.get('/health/ready', async (_, reply) => {
    try {
      await checkDatabase();
      return { status: 'ready', bundleHash: config.bundleHash };
    } catch {
      return reply
        .code(503)
        .send({ status: 'unavailable', code: 'DATABASE_UNAVAILABLE' });
    }
  });
  app.get('/v1/profiles', async () => config);
  return app;
}
