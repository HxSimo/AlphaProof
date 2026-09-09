import { aaveSupply } from '@poa/adapters';
import { contentHash, PoaError } from '@poa/domain';
import { planAllocation } from '@poa/execution';
import {
  archiveJson,
  createObservation,
  MemoryObjectArchive,
} from '@poa/market-data';
import {
  AaveReservePayload,
  EthUsdcConversionPayload,
  GasPayload,
  type ActionEnvelopeData,
  type ArchivedObservationData,
  type ExperimentPolicyData,
  type ProfileData,
  type ShadowPortfolioData,
} from '@poa/schemas';

const address = (digit: string) => `0x${digit.repeat(40)}`;

export interface M3ExecutionInput {
  actionId: string;
  envelope: ActionEnvelopeData;
  policy: ExperimentPolicyData;
  portfolio: ShadowPortfolioData;
  receivedAt: string;
  profile: ProfileData;
  usdcAddress: string;
}

export async function prepareSyntheticM3Execution(input: M3ExecutionInput) {
  if (input.policy.resultProvenance !== 'SYNTHETIC_TEST')
    throw new Error('Synthetic M3 executor refuses non-synthetic provenance');
  const plan = planAllocation(
    input.policy,
    input.portfolio,
    input.envelope.request.intent,
    {
      actionId: input.actionId,
      receivedAt: input.receivedAt,
      profile: input.profile,
      assetAddresses: { 'ethereum-mainnet/usdc': input.usdcAddress },
    },
  );
  const amount = plan.steps.at(-1)!.input.minor;
  const amountSize = BigInt(amount);
  const archive = new MemoryObjectArchive();
  const expiresAt = new Date(Date.parse(input.receivedAt) + 600_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
  async function capture(
    id: string,
    payload: unknown,
  ): Promise<ArchivedObservationData> {
    const rawObject = await archiveJson(archive, payload, input.receivedAt);
    return createObservation({
      observationId: `${input.actionId}-${id}`,
      sourceId: `synthetic-m3-${id}`,
      sourceVersion: '1.0.0',
      parserVersion: '1.0.0',
      adapterVersion: '1.0.0',
      requestedAt: input.receivedAt,
      observedAt: input.receivedAt,
      expiresAt,
      block: null,
      rawObject,
      resultProvenance: 'SYNTHETIC_TEST',
    });
  }
  const reserve = await capture(
    'reserve',
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
  );
  const approvalGas = await capture(
    'approval-gas',
    GasPayload.parse({
      schemaVersion: 'proof-of-alpha/gas-input/v1',
      operation: 'APPROVE',
      amountInMinor: amount,
      gasUnits: (50_000n + amountSize / 100_000_000n).toString(),
      effectiveGasPriceWei: '20000000000',
    }),
  );
  const supplyGas = await capture(
    'supply-gas',
    GasPayload.parse({
      schemaVersion: 'proof-of-alpha/gas-input/v1',
      operation: 'SUPPLY',
      amountInMinor: amount,
      gasUnits: (140_000n + amountSize / 10_000_000n).toString(),
      effectiveGasPriceWei: '20000000000',
    }),
  );
  const conversion = await capture(
    'conversion',
    EthUsdcConversionPayload.parse({
      schemaVersion: 'proof-of-alpha/eth-usdc-conversion/v1',
      usdcMinorNumerator: '3000000000',
      weiDenominator: '1000000000000000000',
      roundId: `${input.actionId}-synthetic`,
      answerUpdatedAt: input.receivedAt,
      heartbeatSeconds: '3600',
    }),
  );
  const result = await aaveSupply(
    archive,
    {
      experimentId: input.policy.experimentId,
      scenarioId: input.portfolio.scenarioId,
      expectedPortfolioVersion: input.portfolio.version,
      observedAt: input.receivedAt,
      evaluationTime: input.receivedAt,
      resultProvenance: 'SYNTHETIC_TEST',
      cashViewId: 'eth-usdc-view',
      cashBalanceFamilyId: 'eth-usdc-family',
    },
    {
      amountMinor: amount,
      instrumentId: 'eth-aave-usdc',
      positionId: `${input.actionId}-position`,
      allowanceId: `${input.actionId}-allowance`,
      currentAllowanceMinor: '0',
      reserve,
      approvalGas,
      supplyGas,
      conversion,
      operationPrefix: input.actionId,
    },
  );
  const totalCost = result.receipts
    .flatMap((receipt) => ('costs' in receipt ? receipt.costs : []))
    .reduce((sum, cost) => sum + BigInt(cost.amountUsdcMinor), 0n);
  if (totalCost > BigInt(input.envelope.request.intent.maxCostUsdcMinor))
    throw new PoaError(
      'POLICY_VIOLATION',
      'Archived execution cost exceeds signed maximum',
    );
  const rawObjects = [...archive.objects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([objectKey, bytes]) => ({
      objectKey,
      bytesHex: Buffer.from(bytes).toString('hex'),
    }));
  return {
    plan,
    receipts: result.receipts,
    syntheticInputBundle: {
      schemaVersion: 'proof-of-alpha/m3-synthetic-input-bundle/v1',
      resultProvenance: 'SYNTHETIC_TEST',
      observations: [reserve, approvalGas, supplyGas, conversion],
      rawObjects,
      adapterResultHash: result.sourceHash,
      totalCostUsdcMinor: totalCost.toString(),
      expectedReceiptsHash: contentHash(result.receipts),
      replay: {
        experimentId: input.policy.experimentId,
        scenarioId: input.portfolio.scenarioId,
        expectedPortfolioVersion: input.portfolio.version,
        observedAt: input.receivedAt,
        amountMinor: amount,
        instrumentId: 'eth-aave-usdc',
        positionId: `${input.actionId}-position`,
        allowanceId: `${input.actionId}-allowance`,
        operationPrefix: input.actionId,
      },
    },
  };
}

export async function replaySyntheticM3Bundle(bundle: any) {
  if (
    bundle?.schemaVersion !== 'proof-of-alpha/m3-synthetic-input-bundle/v1' ||
    bundle.resultProvenance !== 'SYNTHETIC_TEST'
  )
    throw new PoaError('INVALID_SCHEMA', 'Not an M3 synthetic replay bundle');
  const archive = new MemoryObjectArchive();
  for (const object of bundle.rawObjects ?? [])
    await archive.putIfAbsent(
      object.objectKey,
      Uint8Array.from(Buffer.from(object.bytesHex, 'hex')),
    );
  const find = (suffix: string) => {
    const value = (bundle.observations as ArchivedObservationData[]).find((x) =>
      x.observationId.endsWith(suffix),
    );
    if (!value)
      throw new PoaError(
        'DATA_UNAVAILABLE',
        `Replay observation missing: ${suffix}`,
      );
    return value;
  };
  const replay = bundle.replay;
  const result = await aaveSupply(
    archive,
    {
      experimentId: replay.experimentId,
      scenarioId: replay.scenarioId,
      expectedPortfolioVersion: replay.expectedPortfolioVersion,
      observedAt: replay.observedAt,
      evaluationTime: replay.observedAt,
      resultProvenance: 'SYNTHETIC_TEST',
      cashViewId: 'eth-usdc-view',
      cashBalanceFamilyId: 'eth-usdc-family',
    },
    {
      amountMinor: replay.amountMinor,
      instrumentId: replay.instrumentId,
      positionId: replay.positionId,
      allowanceId: replay.allowanceId,
      currentAllowanceMinor: '0',
      reserve: find('-reserve'),
      approvalGas: find('-approval-gas'),
      supplyGas: find('-supply-gas'),
      conversion: find('-conversion'),
      operationPrefix: replay.operationPrefix,
    },
  );
  const receiptsHash = contentHash(result.receipts);
  if (receiptsHash !== bundle.expectedReceiptsHash)
    throw new PoaError(
      'REPLAY_MISMATCH',
      'M3 receipt replay differs from archived result',
    );
  return { receipts: result.receipts, receiptsHash };
}
