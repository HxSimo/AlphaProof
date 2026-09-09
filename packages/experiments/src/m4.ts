import { mulDiv } from '@poa/accounting';
import { aaveSupply } from '@poa/adapters';
import { contentHash, PoaError } from '@poa/domain';
import {
  archiveJson,
  createObservation,
  MemoryObjectArchive,
} from '@poa/market-data';
import {
  AaveReservePayload,
  EthUsdcConversionPayload,
  GasPayload,
  type AccountingReceiptData,
  type ArchivedObservationData,
  type ReferencePortfolioData,
  type ShadowPortfolioData,
} from '@poa/schemas';
import { checkpointPortfolio, createScenarioCheckpoint } from '@poa/valuation';

const address = (digit: string) => `0x${digit.repeat(40)}`;
const expiry = (at: string) =>
  new Date(Date.parse(at) + 600_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
const rawObjects = (archive: MemoryObjectArchive) =>
  [...archive.objects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([objectKey, bytes]) => ({
      objectKey,
      bytesHex: Buffer.from(bytes).toString('hex'),
    }));

async function capture(
  archive: MemoryObjectArchive,
  id: string,
  payload: unknown,
  at: string,
): Promise<ArchivedObservationData> {
  const rawObject = await archiveJson(archive, payload, at);
  return createObservation({
    observationId: id,
    sourceId: `synthetic-m4-${id}`,
    sourceVersion: '1.0.0',
    parserVersion: '1.0.0',
    adapterVersion: '1.0.0',
    requestedAt: at,
    observedAt: at,
    expiresAt: expiry(at),
    block: null,
    rawObject,
    resultProvenance: 'SYNTHETIC_TEST',
  });
}

export async function prepareSyntheticReferenceEntry(
  reference: ReferencePortfolioData,
  observedAt: string,
  failAfterApproval = false,
) {
  if (
    reference.kind !== 'CONSERVATIVE_YIELD' ||
    reference.frozenInstrumentId !== 'eth-aave-usdc'
  )
    throw new PoaError(
      'UNSUPPORTED_INSTRUMENT',
      'Only the frozen Aave USDC reference is implemented',
    );
  if (reference.portfolio.resultProvenance !== 'SYNTHETIC_TEST')
    throw new PoaError(
      'ENVIRONMENT_MISMATCH',
      'Synthetic reference executor refuses external provenance',
    );
  const amount = reference.portfolio.initialValueUsdcMinor;
  const prefix = `${reference.referenceId}-entry`;
  const archive = new MemoryObjectArchive();
  const reserve = await capture(
    archive,
    `${prefix}-reserve`,
    AaveReservePayload.parse({
      schemaVersion: 'proof-of-alpha/aave-v3-reserve/v1',
      chainId: '1',
      pool: address('1'),
      underlying: address('2'),
      aToken: address('3'),
      assetId: 'usdc',
      decimals: 6,
      active: true,
      frozen: false,
      paused: false,
      supplyCapMinor: '1000000000000000',
      totalSuppliedMinor: '500000000000000',
      availableLiquidityMinor: '500000000000000',
      liquidityIndexRay: '1000000000000000000000000000',
    }),
    observedAt,
  );
  const size = BigInt(amount);
  const approvalGas = await capture(
    archive,
    `${prefix}-approval-gas`,
    GasPayload.parse({
      schemaVersion: 'proof-of-alpha/gas-input/v1',
      operation: 'APPROVE',
      amountInMinor: amount,
      gasUnits: (50_000n + size / 100_000_000n).toString(),
      effectiveGasPriceWei: '20000000000',
    }),
    observedAt,
  );
  const supplyGas = await capture(
    archive,
    `${prefix}-supply-gas`,
    GasPayload.parse({
      schemaVersion: 'proof-of-alpha/gas-input/v1',
      operation: 'SUPPLY',
      amountInMinor: amount,
      gasUnits: (140_000n + size / 10_000_000n).toString(),
      effectiveGasPriceWei: '20000000000',
    }),
    observedAt,
  );
  const conversion = await capture(
    archive,
    `${prefix}-conversion`,
    EthUsdcConversionPayload.parse({
      schemaVersion: 'proof-of-alpha/eth-usdc-conversion/v1',
      usdcMinorNumerator: '3000000000',
      weiDenominator: '1000000000000000000',
      roundId: `${prefix}-round`,
      answerUpdatedAt: observedAt,
      heartbeatSeconds: '3600',
    }),
    observedAt,
  );
  const result = await aaveSupply(
    archive,
    {
      experimentId: reference.experimentId,
      scenarioId: reference.scenarioId,
      expectedPortfolioVersion: reference.portfolio.version,
      observedAt,
      evaluationTime: observedAt,
      resultProvenance: 'SYNTHETIC_TEST',
      cashViewId: 'eth-usdc-view',
      cashBalanceFamilyId: 'eth-usdc-family',
    },
    {
      amountMinor: amount,
      instrumentId: reference.frozenInstrumentId,
      positionId: `${reference.referenceId}-position`,
      allowanceId: `${reference.referenceId}-allowance`,
      currentAllowanceMinor: '0',
      reserve,
      approvalGas,
      supplyGas,
      conversion,
      operationPrefix: prefix,
    },
  );
  let receipts = result.receipts;
  if (failAfterApproval) {
    const approval = receipts[0]!;
    const deposit = receipts[1]!;
    if (deposit.kind !== 'DEPOSIT')
      throw new PoaError(
        'ACCOUNTING_INVARIANT',
        'Expected reference deposit receipt',
      );
    const failure: AccountingReceiptData = {
      schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
      accountingVersion: '1.0.0',
      operationId: `${prefix}-failed-attempt`,
      experimentId: reference.experimentId,
      scenarioId: reference.scenarioId,
      expectedPortfolioVersion: (
        BigInt(reference.portfolio.version) + 1n
      ).toString(),
      observedAt,
      resultProvenance: 'SYNTHETIC_TEST',
      sourceHashes: deposit.sourceHashes,
      kind: 'COST',
      status: 'FAILED_AFTER_ATTEMPT',
      reasonCode: 'REFERENCE_ENTRY_FAILED',
      costs: deposit.costs,
    };
    receipts = [approval, failure];
  }
  return {
    receipts,
    status: failAfterApproval ? ('ENTRY_FAILED' as const) : ('ACTIVE' as const),
    reasonCodes: failAfterApproval ? ['REFERENCE_ENTRY_FAILED'] : [],
    bundle: {
      schemaVersion: 'proof-of-alpha/m4-reference-entry-bundle/v1',
      referenceId: reference.referenceId,
      reference,
      amountUsdcMinor: amount,
      observations: [reserve, approvalGas, supplyGas, conversion],
      rawObjects: rawObjects(archive),
      receiptsHash: contentHash(receipts),
      failAfterApproval,
      resultProvenance: 'SYNTHETIC_TEST' as const,
    },
  };
}

export async function replaySyntheticReferenceEntryBundle(bundle: any) {
  if (
    bundle?.schemaVersion !== 'proof-of-alpha/m4-reference-entry-bundle/v1' ||
    bundle?.resultProvenance !== 'SYNTHETIC_TEST'
  )
    throw new PoaError('INVALID_SCHEMA', 'Not an M4 reference entry bundle');
  const reference = bundle.reference as ReferencePortfolioData;
  const replayed = await prepareSyntheticReferenceEntry(
    reference,
    bundle.observations[0].observedAt,
    bundle.failAfterApproval,
  );
  for (const object of bundle.rawObjects) {
    const expected = replayed.bundle.rawObjects.find(
      (candidate) => candidate.objectKey === object.objectKey,
    );
    if (!expected || expected.bytesHex !== object.bytesHex)
      throw new PoaError(
        'ARCHIVE_INTEGRITY',
        'Reference entry raw input differs during replay',
      );
  }
  if (replayed.bundle.receiptsHash !== bundle.receiptsHash)
    throw new PoaError(
      'REPLAY_MISMATCH',
      'Reference entry receipts differ during replay',
    );
  return replayed;
}

export async function prepareSyntheticScenarioCheckpoint(input: {
  checkpointId: string;
  sequence: string;
  checkpointAt: string;
  agent: ShadowPortfolioData;
  cashReference: ReferencePortfolioData;
  conservativeYieldReference: ReferencePortfolioData;
}) {
  const archive = new MemoryObjectArchive();
  const amount = input.agent.initialValueUsdcMinor;
  const build = async (
    portfolio: ShadowPortfolioData,
    role: 'AGENT' | 'CASH_REFERENCE' | 'CONSERVATIVE_YIELD_REFERENCE',
    status: 'ACTIVE' | 'ENTRY_FAILED' | null,
    comparisonAvailable: boolean,
  ) => {
    const accruals = [];
    const valuations = [];
    for (const position of portfolio.positions) {
      const factorNumerator = 10_000n + 1n + BigInt(amount) / 10_000_000_000n;
      const nextNumerator = BigInt(position.indexNumerator) * factorNumerator;
      const nextDenominator = BigInt(position.indexDenominator) * 10_000n;
      const payload = {
        schemaVersion: 'proof-of-alpha/m4-position-observation/v1',
        checkpointId: input.checkpointId,
        scenarioId: portfolio.scenarioId,
        portfolioId: portfolio.portfolioId,
        positionId: position.positionId,
        amountUsdcMinor: amount,
        nextIndexNumerator: nextNumerator.toString(),
        nextIndexDenominator: nextDenominator.toString(),
        parserVersion: '1.0.0',
        adapterVersion: '1.0.0',
      };
      const descriptor = await archiveJson(
        archive,
        payload,
        input.checkpointAt,
      );
      const mark = mulDiv(
        position.sharesMinor,
        nextNumerator.toString(),
        nextDenominator.toString(),
        'FLOOR',
      ).valueMinor;
      const impact = BigInt(mark) / 100_000n + 1n;
      const recoverable = BigInt(mark) > impact ? BigInt(mark) - impact : 0n;
      const exitCost = BigInt(amount) / 1_000_000n + 1n;
      accruals.push({
        positionId: position.positionId,
        nextIndexNumerator: nextNumerator.toString(),
        nextIndexDenominator: nextDenominator.toString(),
        sourceHash: descriptor.objectHash as `0x${string}`,
        observedAt: input.checkpointAt,
      });
      valuations.push({
        positionId: position.positionId,
        markValueUsdcMinor: mark,
        recoverableUsdcMinor: recoverable.toString(),
        exitCostUsdcMinor:
          exitCost <= recoverable
            ? exitCost.toString()
            : recoverable.toString(),
        dataQuality: 'FRESH' as const,
        sourceHash: descriptor.objectHash,
        observedAt: input.checkpointAt,
      });
    }
    const replayInput = {
      role,
      referenceStatus: status,
      comparisonAvailable,
      portfolio,
      accruals,
      valuations,
    };
    return {
      output: checkpointPortfolio({
        checkpointId: input.checkpointId,
        ...replayInput,
      }),
      replayInput,
    };
  };
  const agent = await build(input.agent, 'AGENT', null, true);
  const cash = await build(
    input.cashReference.portfolio,
    'CASH_REFERENCE',
    input.cashReference.status,
    true,
  );
  const conservative = await build(
    input.conservativeYieldReference.portfolio,
    'CONSERVATIVE_YIELD_REFERENCE',
    input.conservativeYieldReference.status,
    input.conservativeYieldReference.comparisonAvailable,
  );
  const objects = rawObjects(archive);
  const amountQuoteHash = contentHash({
    scenarioId: input.agent.scenarioId,
    amountUsdcMinor: amount,
    objectKeys: objects.map((x) => x.objectKey),
  });
  const checkpoint = createScenarioCheckpoint({
    checkpointId: input.checkpointId,
    sequence: input.sequence,
    checkpointAt: input.checkpointAt,
    observationSetHash: contentHash(objects),
    amountQuoteHash,
    agent: agent.output,
    cashReference: cash.output,
    conservativeYieldReference: conservative.output,
  });
  return {
    checkpoint,
    rawObjects: objects,
    amountQuoteHash,
    checkpointInputs: {
      agent: agent.replayInput,
      cashReference: cash.replayInput,
      conservativeYieldReference: conservative.replayInput,
    },
  };
}
