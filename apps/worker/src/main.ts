import { setTimeout } from 'node:timers/promises';
import { createPool, ExperimentRepository, migrate } from '@poa/storage';
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
  do {
    await runFoundationCheck(pool);
    console.log(JSON.stringify(await runActionWorkerOnce(repository)));
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
