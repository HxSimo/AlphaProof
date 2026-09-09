import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReceipt, createPortfolio } from '@poa/accounting';
import { aaveSupply } from '@poa/adapters';
import { contentHash } from '@poa/domain';
import {
  archiveJson,
  createObservation,
  FileObjectArchive,
} from '@poa/market-data';
import {
  AaveReservePayload,
  EconomicReplayBundle,
  EthUsdcConversionPayload,
  GasPayload,
  type ArchivedObservationData,
} from '@poa/schemas';

const root = await mkdtemp(join(tmpdir(), 'poa-m2-replay-'));
const archive = new FileObjectArchive(root);
const time = '2026-01-01T00:00:00.000Z';
async function capture(
  id: string,
  payload: unknown,
): Promise<ArchivedObservationData> {
  return createObservation({
    observationId: id,
    sourceId: `${id}-source`,
    sourceVersion: '1.0.0',
    parserVersion: '1.0.0',
    adapterVersion: '1.0.0',
    requestedAt: time,
    observedAt: time,
    expiresAt: '2026-01-01T00:10:00.000Z',
    block: null,
    rawObject: await archiveJson(archive, payload, time),
    resultProvenance: 'SYNTHETIC_TEST',
  });
}
const amount = '1000000000';
const reserve = await capture(
  'replay-reserve',
  AaveReservePayload.parse({
    schemaVersion: 'proof-of-alpha/aave-v3-reserve/v1',
    chainId: '1',
    pool: `0x${'1'.repeat(40)}`,
    underlying: `0x${'2'.repeat(40)}`,
    aToken: `0x${'3'.repeat(40)}`,
    assetId: 'usdc',
    decimals: 6,
    active: true,
    frozen: false,
    paused: false,
    supplyCapMinor: '2000000000000000',
    totalSuppliedMinor: '1000000000000000',
    availableLiquidityMinor: '1000000000000000',
    liquidityIndexRay: '1000000000000000000000000000',
  }),
);
const approve = await capture(
  'replay-approve-gas',
  GasPayload.parse({
    schemaVersion: 'proof-of-alpha/gas-input/v1',
    operation: 'APPROVE',
    amountInMinor: amount,
    gasUnits: '50000',
    effectiveGasPriceWei: '20000000000',
  }),
);
const supply = await capture(
  'replay-supply-gas',
  GasPayload.parse({
    schemaVersion: 'proof-of-alpha/gas-input/v1',
    operation: 'SUPPLY',
    amountInMinor: amount,
    gasUnits: '140000',
    effectiveGasPriceWei: '20000000000',
  }),
);
const conversion = await capture(
  'replay-conversion',
  EthUsdcConversionPayload.parse({
    schemaVersion: 'proof-of-alpha/eth-usdc-conversion/v1',
    usdcMinorNumerator: '3000000000',
    weiDenominator: '1000000000000000000',
    roundId: 'synthetic-round-1',
    answerUpdatedAt: time,
    heartbeatSeconds: '3600',
  }),
);
let state = createPortfolio({
  experimentId: 'm2-replay',
  scenarioId: 'capital-1k',
  portfolioId: 'capital-1k-portfolio',
  resultProvenance: 'SYNTHETIC_TEST',
  initialValueUsdcMinor: amount,
  maxDestinationAttempts: '3',
  balanceViews: [
    {
      viewId: 'eth-usdc-view',
      networkId: 'ethereum-mainnet',
      assetId: 'usdc',
      balanceFamilyId: 'eth-usdc-family',
      decimals: 6,
      canonicalDecimals: 6,
    },
  ],
  initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: amount }],
});
const context = {
  experimentId: state.experimentId,
  scenarioId: state.scenarioId,
  expectedPortfolioVersion: state.version,
  observedAt: time,
  evaluationTime: time,
  resultProvenance: state.resultProvenance,
  cashViewId: 'eth-usdc-view',
  cashBalanceFamilyId: 'eth-usdc-family',
};
const direct = await aaveSupply(archive, context, {
  amountMinor: amount,
  instrumentId: 'eth-aave-usdc',
  positionId: 'capital-1k-aave-position',
  allowanceId: 'capital-1k-aave-allowance',
  currentAllowanceMinor: '0',
  reserve,
  approvalGas: approve,
  supplyGas: supply,
  conversion,
});
for (const receipt of direct.receipts) state = applyReceipt(state, receipt);
const expectedFinalPortfolioHash = contentHash(state);
const bundle = EconomicReplayBundle.parse({
  schemaVersion: 'proof-of-alpha/economic-replay/v1',
  bundleVersion: '1.0.0',
  createdAt: time,
  resultProvenance: 'SYNTHETIC_TEST',
  initialPortfolio: createPortfolio({
    experimentId: 'm2-replay',
    scenarioId: 'capital-1k',
    portfolioId: 'capital-1k-portfolio',
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: amount,
    maxDestinationAttempts: '3',
    balanceViews: [
      {
        viewId: 'eth-usdc-view',
        networkId: 'ethereum-mainnet',
        assetId: 'usdc',
        balanceFamilyId: 'eth-usdc-family',
        decimals: 6,
        canonicalDecimals: 6,
      },
    ],
    initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: amount }],
  }),
  observations: [reserve, approve, supply, conversion],
  steps: [
    {
      stepId: 'aave-supply-step',
      adapterId: 'aave-v3-ethereum',
      operation: 'AAVE_SUPPLY',
      input: {
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: 'capital-1k-aave-position',
        allowanceId: 'capital-1k-aave-allowance',
        currentAllowanceMinor: '0',
        observedAt: time,
        evaluationTime: time,
        cashViewId: 'eth-usdc-view',
        cashBalanceFamilyId: 'eth-usdc-family',
      },
      observationIds: [
        reserve.observationId,
        approve.observationId,
        supply.observationId,
        conversion.observationId,
      ],
    },
  ],
  expectedFinalPortfolioHash,
});
const bundlePath = join(root, 'bundle.json');
await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
const child = execFileSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/replay-m2.ts', bundlePath, root],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  },
).trim();
if (child !== expectedFinalPortfolioHash)
  throw new Error(
    `Cross-process replay mismatch: ${child} != ${expectedFinalPortfolioHash}`,
  );
console.log(`M2 replay verified: ${child}`);
