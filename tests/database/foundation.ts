import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool, migrate } from '@poa/storage';
import { contentHash } from '@poa/domain';
import { runFoundationCheck } from '../../apps/worker/src/worker.js';

// Isolated schema, never truncate or reset an existing database.
const url = process.env.DATABASE_URL;
assert.ok(url, 'DATABASE_URL is required; database checks never silently skip');
const admin = createPool(url);
const schema = `poa_m0_test_${process.pid}_${Date.now()}`;
await admin.query(`CREATE SCHEMA ${schema}`);
const scoped = new URL(url);
scoped.searchParams.set('options', `-c search_path=${schema}`);
let pool = createPool(scoped.toString());
const directory = mkdtempSync(join(tmpdir(), 'poa-migrations-'));
try {
  await Promise.all([migrate(pool), migrate(pool)]);
  assert.equal(
    (await pool.query('SELECT * FROM schema_migrations')).rowCount,
    4,
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () => runFoundationCheck(pool)),
  );
  assert.equal(results.filter((x) => x.inserted).length, 1);
  const stored = (await pool.query('SELECT * FROM configuration_snapshots'))
    .rows;
  assert.equal(stored.length, 1);
  assert.equal(contentHash(stored[0].payload), stored[0].content_hash);
  await pool.end();
  pool = createPool(scoped.toString());
  assert.equal((await runFoundationCheck(pool)).inserted, false);
  for (const sql of [
    'DELETE FROM configuration_snapshots',
    "UPDATE configuration_snapshots SET payload = '{}'::jsonb",
    'TRUNCATE configuration_snapshots',
  ]) {
    await assert.rejects(pool.query(sql), /append-only/);
  }
  const original = readFileSync(
    'db/migrations/0001_configuration_snapshots.sql',
    'utf8',
  );
  writeFileSync(
    join(directory, '0001_configuration_snapshots.sql'),
    original + '\n-- changed\n',
  );
  await assert.rejects(
    migrate(pool, directory),
    (error) => (error as { code: string }).code === 'MIGRATION_CHANGED',
  );
  writeFileSync(join(directory, '0001_configuration_snapshots.sql'), original);
  writeFileSync(
    join(directory, '0002_failure.sql'),
    'CREATE TABLE should_rollback(id int); SELECT missing_column;',
  );
  await assert.rejects(migrate(pool, directory));
  assert.equal(
    (await pool.query("SELECT to_regclass('should_rollback') AS name")).rows[0]
      .name,
    null,
  );
  assert.equal(
    (await pool.query('SELECT * FROM schema_migrations')).rowCount,
    4,
  );
  console.log(
    'PASS: concurrent migrations; duplicate worker delivery; reconnect/restart; snapshot hash; append-only UPDATE/DELETE/TRUNCATE; migration drift; failure rollback (8 checks)',
  );
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
}
