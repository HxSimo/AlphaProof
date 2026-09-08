import { writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadBundle, defaultConfigDir, profileReadiness } from '@poa/config';

const mode = process.argv[2] ?? 'check';
if (!['check', 'seal'].includes(mode))
  throw new Error('Usage: pnpm config:validate or pnpm config:seal');
const directory = process.env.POA_CONFIG_DIR ?? defaultConfigDir;
const { bundle, seal } = loadBundle(directory, mode !== 'seal');
for (const i of bundle.instruments.instruments)
  if (!existsSync(resolve(i.factSheet)))
    throw new Error(`Missing fact sheet: ${i.factSheet}`);
for (const d of bundle.dependencies.dependencies)
  if (!existsSync(resolve(d.fixture)))
    throw new Error(`Missing fixture: ${d.fixture}`);
if (mode === 'seal')
  writeFileSync(
    join(directory, 'checksums.json'),
    JSON.stringify(seal, null, 2) + '\n',
  );
console.log(
  JSON.stringify(
    {
      valid: true,
      bundleHash: seal.bundleHash,
      networks: bundle.networks.networks.length,
      instruments: bundle.instruments.instruments.length,
      dependencies: bundle.dependencies.dependencies.length,
      profiles: bundle.profiles.profiles.map((p) => {
        const r = profileReadiness(p, bundle);
        return {
          profileId: r.profileId,
          resultProvenance: r.resultProvenance,
          enabled: r.enabled,
          blockerCount: r.blockers.length,
        };
      }),
    },
    null,
    2,
  ),
);
