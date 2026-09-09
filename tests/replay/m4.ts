import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPortfolio } from '@poa/accounting';
import { contentHash } from '@poa/domain';
import { replayM4 } from '@poa/evaluation';
import {
  checkpointPortfolio,
  createScenarioCheckpoint,
  makeReferences,
} from '@poa/valuation';

if (process.argv[2] === '--child') {
  const result = replayM4(JSON.parse(readFileSync(process.argv[3]!, 'utf8')));
  console.log(
    JSON.stringify({
      checkpointHash: result.checkpoint.checkpointHash,
      evaluationHash: result.evaluation.evaluationHash,
    }),
  );
} else {
  const at0 = '2026-09-09T00:00:00.000Z';
  const at1 = '2026-09-09T00:05:00.000Z';
  const source = contentHash('m4-replay-source');
  const portfolio = createPortfolio({
    experimentId: 'm4-replay',
    scenarioId: 'capital-1k',
    portfolioId: 'm4-replay-capital-1k',
    resultProvenance: 'SYNTHETIC_TEST',
    initialValueUsdcMinor: '1000000000',
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
    initialCash: [{ viewId: 'eth-usdc-view', amountUsdcMinor: '1000000000' }],
  });
  const [cash, conservative] = makeReferences(
    portfolio,
    at0,
    '2026-10-09T00:00:00.000Z',
  );
  const agent = checkpointPortfolio({
    checkpointId: 'm4-replay-checkpoint',
    role: 'AGENT',
    referenceStatus: null,
    comparisonAvailable: true,
    portfolio,
    accruals: [],
    valuations: [],
  });
  const cashCp = checkpointPortfolio({
    checkpointId: 'm4-replay-checkpoint',
    role: 'CASH_REFERENCE',
    referenceStatus: 'ACTIVE',
    comparisonAvailable: true,
    portfolio: cash.portfolio,
    accruals: [],
    valuations: [],
  });
  const yieldCp = checkpointPortfolio({
    checkpointId: 'm4-replay-checkpoint',
    role: 'CONSERVATIVE_YIELD_REFERENCE',
    referenceStatus: 'ENTRY_FAILED',
    comparisonAvailable: false,
    portfolio: conservative.portfolio,
    accruals: [],
    valuations: [],
  });
  const checkpoint = createScenarioCheckpoint({
    checkpointId: 'm4-replay-checkpoint',
    sequence: '1',
    checkpointAt: at1,
    observationSetHash: source,
    amountQuoteHash: source,
    agent,
    cashReference: cashCp,
    conservativeYieldReference: yieldCp,
  });
  const direct = replayM4({
    schemaVersion: 'proof-of-alpha/m4-replay-bundle/v1',
    checkpoint: (({ checkpointHash: _ignored, ...body }) => body)(checkpoint),
    priorAgentMarksUsdcMinor: ['1100000000'],
    rawObjects: [],
    checkpointInputs: null,
    expectedCheckpointHash: checkpoint.checkpointHash,
    expectedEvaluation: (await import('@poa/evaluation')).evaluateScenario(
      checkpoint,
      ['1100000000'],
    ),
  });
  const root = mkdtempSync(join(tmpdir(), 'poa-m4-replay-'));
  try {
    const file = join(root, 'bundle.json');
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 'proof-of-alpha/m4-replay-bundle/v1',
        checkpoint: (({ checkpointHash: _ignored, ...body }) => body)(
          checkpoint,
        ),
        priorAgentMarksUsdcMinor: ['1100000000'],
        rawObjects: [],
        checkpointInputs: null,
        expectedCheckpointHash: checkpoint.checkpointHash,
        expectedEvaluation: direct.evaluation,
      }),
    );
    const child = JSON.parse(
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'tests/replay/m4.ts', '--child', file],
        { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
      ).trim(),
    );
    assert.equal(child.checkpointHash, direct.checkpoint.checkpointHash);
    assert.equal(child.evaluationHash, direct.evaluation.evaluationHash);
    console.log(`M4 cross-process replay verified: ${child.evaluationHash}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
