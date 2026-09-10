import { setTimeout } from 'node:timers/promises';
import {
  createPool,
  ExperimentRepository,
  OperationsRepository,
  migrate,
} from '@poa/storage';
import { loadBundle } from '@poa/config';
import { runActionWorkerOnce, runFoundationCheck } from './worker.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => controller.abort());
const pool = createPool();
try {
  await migrate(pool);
  const config = loadBundle();
  const repository = new ExperimentRepository(pool, {
    bundle: config.bundle,
    bundleHash: config.seal.bundleHash,
    allowSynthetic: process.env.POA_ENABLE_SYNTHETIC_M3 === '1',
  });
  const operations = new OperationsRepository(pool);
  const workerId = `worker-${process.pid}`;
  do {
    await runFoundationCheck(pool);
    try {
      const result = await runActionWorkerOnce(repository, workerId);
      await operations.heartbeat(workerId, result.status);
      console.log(JSON.stringify({ service: 'worker', ...result }));
    } catch {
      await operations.heartbeat(workerId, 'RETRY_RECORDED');
      console.error(
        JSON.stringify({
          service: 'worker',
          code: 'WORKER_INTERRUPTED',
          recovery: 'DURABLE_RETRY',
        }),
      );
    }
    if (process.argv.includes('--once')) break;
    await setTimeout(30000, undefined, { signal: controller.signal }).catch(
      (error) => {
        if (error.name !== 'AbortError') throw error;
      },
    );
  } while (!controller.signal.aborted);
} finally {
  await pool.end();
}
