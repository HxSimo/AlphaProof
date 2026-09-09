import { readFile } from 'node:fs/promises';
import { replayEconomicBundle } from '@poa/experiments';
import { FileObjectArchive } from '@poa/market-data';
import { EconomicReplayBundle } from '@poa/schemas';

const bundlePath = process.argv[2];
const objectRoot = process.argv[3];
if (!bundlePath || !objectRoot)
  throw new Error('Usage: pnpm replay:m2 <bundle.json> <object-root>');
const bundle = EconomicReplayBundle.parse(
  JSON.parse(await readFile(bundlePath, 'utf8')),
);
const replay = await replayEconomicBundle(
  new FileObjectArchive(objectRoot),
  bundle,
);
process.stdout.write(`${replay.finalPortfolioHash}\n`);
