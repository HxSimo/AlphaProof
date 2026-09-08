import { setTimeout } from 'node:timers/promises';
import { createPool } from '@poa/storage';
import { runFoundationCheck } from './worker.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => controller.abort());
const pool = createPool();
try {
  do {
    console.log(JSON.stringify(await runFoundationCheck(pool)));
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
