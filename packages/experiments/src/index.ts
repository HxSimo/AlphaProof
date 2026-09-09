import { applyReceipt } from '@poa/accounting';
import { aaveSupply, type ReceiptContext } from '@poa/adapters';
import { contentHash, PoaError } from '@poa/domain';
import type { ObjectArchive } from '@poa/market-data';
import {
  EconomicReplayBundle,
  type EconomicReplayBundleData,
  type ArchivedObservationData,
} from '@poa/schemas';

export * from './m3.js';
export * from './m4.js';

function field(input: Record<string, string | boolean>, key: string) {
  const value = input[key];
  if (typeof value !== 'string')
    throw new PoaError(
      'INVALID_SCHEMA',
      `Replay input ${key} must be a string`,
    );
  return value;
}

function observation(
  map: Map<string, ArchivedObservationData>,
  id: string | undefined,
) {
  const value = id ? map.get(id) : undefined;
  if (!value)
    throw new PoaError(
      'DATA_UNAVAILABLE',
      `Replay observation missing: ${id ?? '<unset>'}`,
    );
  return value;
}

export async function replayEconomicBundle(
  archive: ObjectArchive,
  input: EconomicReplayBundleData,
  verifyExpected = true,
) {
  const bundle = EconomicReplayBundle.parse(input);
  const observations = new Map(
    bundle.observations.map((item) => [item.observationId, item]),
  );
  let state = bundle.initialPortfolio;
  for (const step of bundle.steps) {
    const context: ReceiptContext = {
      experimentId: state.experimentId,
      scenarioId: state.scenarioId,
      expectedPortfolioVersion: state.version,
      observedAt: field(step.input, 'observedAt'),
      evaluationTime: field(step.input, 'evaluationTime'),
      resultProvenance: state.resultProvenance,
      cashViewId: field(step.input, 'cashViewId'),
      cashBalanceFamilyId: field(step.input, 'cashBalanceFamilyId'),
    };
    if (step.operation !== 'AAVE_SUPPLY')
      throw new PoaError(
        'INVALID_SCHEMA',
        `Replay operation is not implemented: ${step.operation}`,
      );
    const result = await aaveSupply(archive, context, {
      amountMinor: field(step.input, 'amountMinor'),
      instrumentId: field(step.input, 'instrumentId'),
      positionId: field(step.input, 'positionId'),
      allowanceId: field(step.input, 'allowanceId'),
      currentAllowanceMinor: field(step.input, 'currentAllowanceMinor'),
      reserve: observation(observations, step.observationIds[0]),
      approvalGas: observation(observations, step.observationIds[1]),
      supplyGas: observation(observations, step.observationIds[2]),
      conversion: observation(observations, step.observationIds[3]),
    });
    for (const receipt of result.receipts) state = applyReceipt(state, receipt);
  }
  const finalPortfolioHash = contentHash(state);
  if (
    verifyExpected &&
    finalPortfolioHash !== bundle.expectedFinalPortfolioHash
  )
    throw new PoaError(
      'REPLAY_MISMATCH',
      `Replay hash ${finalPortfolioHash} differs from ${bundle.expectedFinalPortfolioHash}`,
    );
  return { state, finalPortfolioHash };
}
