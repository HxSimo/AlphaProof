import { loadBundle } from '@poa/config';
import { archiveConfiguration, databaseReady, type Pool } from '@poa/storage';

export async function runFoundationCheck(pool: Pool) {
  const config = loadBundle();
  await databaseReady(pool);
  const archived = await archiveConfiguration(pool, config);
  return {
    jobType: 'CONFIGURATION_CHECK' as const,
    milestone: 'M0' as const,
    bundleHash: config.seal.bundleHash,
    ...archived,
  };
}
