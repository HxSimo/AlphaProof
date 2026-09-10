import { contentHash, PoaError } from '@poa/domain';
import { applyReceipt } from '@poa/accounting';
import { buildBatch, verifyPublication } from '@poa/commitments';
import {
  replaySyntheticM3Bundle,
  replaySyntheticReferenceEntryBundle,
} from '@poa/experiments';
import { evaluateEligibility, replayM4 } from '@poa/evaluation';
import { recoverActionSigner, verifySignedBytes } from '@poa/sdk';
import { DemoSession } from '@poa/schemas';
import { makeReferences } from '@poa/valuation';
import { planAllocation } from '@poa/execution';

export async function replayDemoSession(input: unknown) {
  const session = DemoSession.parse(input);
  const fail = (message: string): never => {
    throw new PoaError('REPLAY_MISMATCH', message);
  };
  if (
    session.resultProvenance !== 'SYNTHETIC_TEST' ||
    session.policy.resultProvenance !== 'SYNTHETIC_TEST'
  )
    throw new PoaError(
      'PROVENANCE_SPLICE',
      'Demo session cannot enter a forward series',
    );
  if (
    contentHash(session.profile) !== session.policy.profileHash ||
    contentHash(session.policy) !== session.policyHash
  )
    fail('Frozen policy/profile changed');
  const objects = new Map(
    session.objects.map((object) => [object.contentHash, object]),
  );
  if (objects.size !== session.objects.length) fail('Duplicate export object');
  const configuration = session.objects.find(
    (o) =>
      o.objectType === 'FROZEN_CONFIGURATION' && (o.payload as any)?.manifest,
  )?.payload as any;
  if (
    !configuration ||
    contentHash(configuration.sourceFiles) !==
      contentHash(session.sourceFiles) ||
    contentHash({
      manifestBundleHash: configuration.seal.bundleHash,
      profileHash: session.policy.profileHash,
      adapterSetHash: session.policy.adapterSetHash,
      parserSetHash: session.policy.parserSetHash,
    }) !== session.policy.configurationHash
  )
    fail('Frozen configuration or source inventory differs');
  const files = Object.fromEntries(
    Object.entries(configuration.manifest).map(([key, value]) => [
      key + '.json',
      contentHash(value),
    ]),
  );
  if (
    contentHash(files) !== configuration.seal.bundleHash ||
    contentHash(files) !== session.policy.manifestBundleHash
  )
    fail('Manifest seal differs');
  if (
    session.agentVersion.agentId !== session.policy.agentId ||
    session.agentVersion.declaredVersionHash !==
      session.policy.declaredVersionHash
  )
    fail('Agent version differs');
  const scenarioIds = session.initialPortfolios.map((p) => p.scenarioId);
  if (
    new Set(scenarioIds).size !== 3 ||
    contentHash(
      session.initialPortfolios.map((p) => p.initialValueUsdcMinor).sort(),
    ) !== contentHash(['1000000000', '10000000000', '100000000000'])
  )
    fail('Three independent capital scenarios are required');
  for (const records of [
    session.actions.map((a) => a.record.request.intent.capitalScenarioId),
    session.checkpoints.map((c) => c.checkpoint.scenarioId),
    session.eligibility.map((e) => e.scenarioId),
  ])
    if (
      contentHash([...records].sort()) !== contentHash([...scenarioIds].sort())
    )
      fail('Scenario stream missing or duplicated');
  for (const event of session.auditEvents) {
    if (
      event.experimentId !== session.policy.experimentId ||
      event.resultProvenance !== session.resultProvenance ||
      !objects.has(event.contentHash)
    )
      throw new PoaError(
        'PROVENANCE_SPLICE',
        'Audit contains an unbound object or provenance',
      );
  }
  const built = buildBatch({
    experimentId: session.policy.experimentId,
    batchId: session.commitment.batch.batchId,
    events: session.auditEvents,
  });
  if (
    contentHash(built.batch) !== contentHash(session.commitment.batch) ||
    contentHash(built.leafSet) !== contentHash(session.commitment.leafSet) ||
    contentHash(built.proofs) !== contentHash(session.commitment.proofs) ||
    built.batchHash !== session.commitment.batchHash
  )
    fail('Proof, sequence or leaf changed');
  if (session.commitment.registryReceipt)
    verifyPublication(built.batch, session.commitment.registryReceipt);
  const finalHashes = [];
  for (const action of session.actions) {
    const intent = action.envelope.request.intent;
    if (
      contentHash(action.record.request) !==
        contentHash(action.envelope.request) ||
      intent.experimentId !== session.policy.experimentId ||
      intent.policyHash !== session.policyHash ||
      intent.agentId !== session.policy.agentId ||
      BigInt(intent.validUntil) <=
        BigInt(Math.floor(Date.parse(action.record.receivedAt) / 1000))
    )
      fail('Intent, receipt time or experiment binding differs');
    verifySignedBytes(action.envelope, session.policy);
    const signer = await recoverActionSigner(
      action.envelope.request.intent,
      session.policy,
      action.envelope.request.signature,
    );
    if (!session.agentVersion.decisionKeys.includes(signer))
      throw new PoaError(
        'INVALID_SIGNATURE',
        'Demo decision key is not authorized',
      );
    {
      // Canonical acknowledgment bindings use the EIP-712 SDK hashes.
      const hashes = verifySignedBytes(action.envelope, session.policy);
      if (
        action.record.signedBytesHash !== hashes.signedBytesHash ||
        action.record.typedDataHash !== hashes.typedDataHash ||
        action.record.intentHash !== hashes.intentHash
      )
        fail('Signed acknowledgment mismatch');
    }
    const reconstructed = await replaySyntheticM3Bundle(action.inputBundle);
    if (reconstructed.receiptsHash !== contentHash(action.receipts))
      fail('Archived execution receipts differ');
    let portfolio = session.initialPortfolios.find(
      (p) => p.scenarioId === action.record.request.intent.capitalScenarioId,
    )!;
    if (!portfolio) fail('Initial scenario is absent');
    if (
      contentHash(portfolio) !== action.record.beforePortfolioHash ||
      portfolio.experimentId !== session.policy.experimentId ||
      portfolio.resultProvenance !== 'SYNTHETIC_TEST'
    )
      fail('Initial portfolio differs from durable action');
    const usdcAddress = configuration.manifest.networks.networks
      .find((n: any) => n.networkId === 'ethereum-mainnet')
      .assets.find((a: any) => a.assetId === 'usdc').address;
    const plan = planAllocation(session.policy, portfolio, intent, {
      actionId: action.record.actionId,
      receivedAt: action.record.receivedAt,
      profile: session.profile,
      assetAddresses: { 'ethereum-mainnet/usdc': usdcAddress },
    });
    if (
      contentHash(plan) !== contentHash(action.plan) ||
      contentHash(plan) !== action.record.planHash
    )
      fail('Deterministic plan differs');
    for (const receipt of action.receipts) {
      if (
        Date.parse(receipt.observedAt) <= Date.parse(action.record.receivedAt)
      )
        fail('Execution is not after durable receipt');
      portfolio = applyReceipt(portfolio, receipt);
    }
    finalHashes.push(contentHash(portfolio));
    const checkpoint = session.checkpoints.find(
      (c) => c.checkpoint.scenarioId === portfolio.scenarioId,
    )!;
    if (
      contentHash(portfolio) !== action.record.afterPortfolioHash ||
      contentHash(portfolio) !==
        contentHash(checkpoint.checkpointInputs?.agent.portfolio)
    )
      fail('Execution does not lead to the evaluated portfolio');
  }
  for (const source of session.sourceFiles)
    if (contentHash(source.utf8) !== source.contentHash)
      throw new PoaError(
        'VERSION_DRIFT',
        'Archived engine source hash differs',
      );
  for (const initial of session.initialPortfolios) {
    const [cash, yieldRef] = makeReferences(
      initial,
      session.policy.startsAt,
      session.policy.endsAt,
    );
    const entries = session.referenceEntries.filter(
      (entry: any) => entry.referenceId === yieldRef.referenceId,
    ) as any[];
    if (
      entries.length !== 1 ||
      contentHash(entries[0].reference) !== contentHash(yieldRef)
    )
      fail('Reference was not initialized equally before execution');
    const entry = await replaySyntheticReferenceEntryBundle(entries[0]);
    const yieldPortfolio = entry.receipts.reduce(
      applyReceipt,
      yieldRef.portfolio,
    );
    const checkpoint = session.checkpoints.find(
      (c) => c.checkpoint.scenarioId === initial.scenarioId,
    )!;
    if (
      contentHash(cash.portfolio) !==
        contentHash(checkpoint.checkpointInputs?.cashReference.portfolio) ||
      contentHash(yieldPortfolio) !==
        contentHash(
          checkpoint.checkpointInputs?.conservativeYieldReference.portfolio,
        )
    )
      fail('Reference receipts do not lead to checkpoint');
  }
  const outputs = session.checkpoints.map((bundle) => replayM4(bundle));
  for (const receipt of session.eligibility) {
    const checkpoint = outputs.find(
      (o) => o.checkpoint.scenarioId === receipt.scenarioId,
    )!.checkpoint;
    if (checkpoint.checkpointHash !== receipt.checkpointHash)
      fail('Eligibility checkpoint differs');
    const reproduced = evaluateEligibility({
      experimentId: receipt.experimentId,
      scenarioId: receipt.scenarioId,
      policyHash: session.policyHash as `0x${string}`,
      checkpointHash: receipt.checkpointHash as `0x${string}`,
      resultProvenance: receipt.resultProvenance,
      networkProfile: receipt.networkProfile,
      operationalStatus: receipt.operationalStatus,
      economicStatus: receipt.economicStatus,
      statisticalStatus: receipt.statisticalStatus,
      statisticalMethodVersion: receipt.statisticalMethodVersion,
    });
    if (contentHash(reproduced) !== contentHash(receipt))
      fail('Eligibility output differs');
  }
  // Bind the semantic replay to objects actually committed, not parallel fields.
  for (const payload of [
    session.policy,
    session.profile,
    session.agentVersion,
    ...session.actions.map((a) => a),
    ...session.referenceEntries,
    ...session.checkpoints,
    ...session.eligibility,
    ...session.incidents,
  ]) {
    if (!objects.has(contentHash(payload)))
      fail('Replayed input/result is not in the commitment');
  }
  return {
    sessionHash: contentHash(session),
    root: built.batch.root,
    batchHash: built.batchHash,
    publication: session.commitment.registryReceipt?.transactionHash ?? null,
    publicationStatus: session.commitment.registryReceipt
      ? 'RETAINED_VERIFIED_TESTNET_RECEIPT'
      : 'UNPUBLISHED',
    resultProvenance: session.resultProvenance,
    finalHashes,
    evaluationHashes: outputs.map((o) => o.evaluation.evaluationHash),
    automaticFundingEnabled: false,
  };
}
