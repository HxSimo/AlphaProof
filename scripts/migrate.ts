import { createPool, migrate } from '@poa/storage';
const pool = createPool();
try {
  await migrate(pool);
  console.log('Database migrations verified');
} finally {
  await pool.end();
}
