import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { contentHash, PoaError } from '@poa/domain';

export function createPool(url = process.env.DATABASE_URL) {
  if (!url)
    throw new PoaError(
      'DATABASE_UNAVAILABLE',
      'Set DATABASE_URL; see .env.example',
    );
  return new Pool({
    connectionString: url,
    max: 4,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
}
export async function migrate(
  pool: Pool,
  directory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../db/migrations',
  ),
) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(712003)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, content_hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())',
    );
    for (const name of readdirSync(directory)
      .filter((x) => /^\d{4}_[a-z_]+\.sql$/.test(x))
      .sort()) {
      const sql = readFileSync(join(directory, name), 'utf8');
      const hash = contentHash(sql);
      const prior = await client.query<{ content_hash: string }>(
        'SELECT content_hash FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].content_hash !== hash)
          throw new PoaError(
            'MIGRATION_CHANGED',
            `Applied migration changed: ${name}`,
          );
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(name, content_hash) VALUES ($1, $2)',
          [name, hash],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(712003)');
    client.release();
  }
}
export async function databaseReady(pool: Pool) {
  await pool.query('SELECT content_hash FROM configuration_snapshots LIMIT 0');
}
export async function archiveConfiguration(pool: Pool, payload: unknown) {
  const hash = contentHash(payload);
  const result = await pool.query(
    'INSERT INTO configuration_snapshots(content_hash, payload) VALUES ($1, $2::jsonb) ON CONFLICT(content_hash) DO NOTHING',
    [hash, JSON.stringify(payload)],
  );
  return { contentHash: hash, inserted: result.rowCount === 1 };
}
export type { Pool } from 'pg';
export * from './m3.js';
