import assert from 'node:assert/strict';
import { contentHash, privateKeyToAccount, type Hex } from '@poa/domain';
import { signAction } from '@poa/sdk';
import {
  account,
  bootstrap,
  envelopeFor,
  isolatedRepository,
} from '../helpers/m3.js';

const test = await isolatedRepository('poa_m3_db');
try {
  const externalAgent = await test.repository.createAgent({
    agentId: 'external-agent',
    displayName: 'External gate case',
  });
  assert.equal(externalAgent.agentId, 'external-agent');
  await test.repository.createAgentVersion('external-agent', {
    versionId: 'external-v1',
    declaredVersionHash: contentHash('external-v1'),
    decisionKeys: ['0x' + '22'.repeat(20)],
    declaredHashes: {
      code: null,
      prompt: null,
      model: null,
      parameters: null,
      memory: null,
      data: null,
    },
  });
  await test.repository.createExperiment({
    experimentId: 'external-exp',
    agentId: 'external-agent',
    versionId: 'external-v1',
    profileId: 'ethereum-forward',
  });
  await assert.rejects(
    test.repository.startExperiment('external-exp'),
    (error: any) => error.code === 'DEPENDENCY_UNVERIFIED',
  );

  const started = await bootstrap(test.repository);
  assert.equal(started.policy.resultProvenance, 'SYNTHETIC_TEST');
  assert.equal(
    started.policy.signingDomain.verifyingContract,
    '0x' + '00'.repeat(20),
  );
  assert.ok(
    started.experiment.configurationHash &&
      started.experiment.adapterSetHash &&
      started.experiment.parserSetHash,
  );
  await assert.rejects(
    test.repository.startExperiment(started.experimentId),
    (error: any) => error.code === 'EXPERIMENT_LOCKED',
  );
  await assert.rejects(
    test.pool.query(
      "UPDATE experiments SET profile_id='changed' WHERE experiment_id=$1",
      [started.experimentId],
    ),
    /immutable/,
  );
  const originalPolicyHash = contentHash(
    await test.repository.getPolicy(started.experimentId),
  );
  const correction = await test.repository.createCorrection(
    started.experimentId,
    'correction-one',
    originalPolicyHash,
    { diagnostic: true },
    'Versioned diagnostic only',
  );
  assert.equal(correction.originalContentHash, originalPolicyHash);
  assert.equal(
    contentHash(await test.repository.getPolicy(started.experimentId)),
    originalPolicyHash,
  );

  const acceptedEnvelope = await envelopeFor(test.repository, started);
  const accepted = await test.repository.acceptAction(
    started.experimentId,
    acceptedEnvelope,
  );
  const repeat = await test.repository.acceptAction(
    started.experimentId,
    acceptedEnvelope,
  );
  assert.equal(repeat.record.actionId, accepted.record.actionId);
  assert.equal(
    (await test.pool.query('SELECT count(*)::int AS n FROM jobs')).rows[0].n,
    1,
  );
  assert.equal(
    (
      await test.pool.query(
        "SELECT count(*)::int AS n FROM economic_journal WHERE event_type='ACTION_ACCEPTED'",
      )
    ).rows[0].n,
    1,
  );

  const changedSameKey = await envelopeFor(
    test.repository,
    started,
    { nonce: '2' },
    'm3-idempotency-0001',
  );
  await assert.rejects(
    test.repository.acceptAction(started.experimentId, changedSameKey),
    (error: any) => error.code === 'IDEMPOTENCY_CONFLICT',
  );
  const sameNonce = await envelopeFor(
    test.repository,
    started,
    { maxCostUsdcMinor: '9999999' },
    'm3-idempotency-0002',
  );
  await assert.rejects(
    test.repository.acceptAction(started.experimentId, sameNonce),
    (error: any) => error.code === 'NONCE_USED',
  );
  await test.repository.completeAction(accepted.record.actionId, 'SUCCEEDED');
  await test.pool.query(
    `INSERT INTO action_intents(action_id,experiment_id,scenario_id,nonce,idempotency_key,request_hash,intent_hash,typed_data_hash,signed_bytes_hash,signer,payload,signed_bytes,received_at,sequence,status)
     SELECT 'quota-'||g,experiment_id,scenario_id,100+g,'quota-key-'||g,request_hash,intent_hash,typed_data_hash,signed_bytes_hash,signer,payload,signed_bytes,clock_timestamp(),100+g,'SUCCEEDED'
     FROM action_intents CROSS JOIN generate_series(1,59) g WHERE action_id=$1`,
    [accepted.record.actionId],
  );
  const overQuota = await envelopeFor(
    test.repository,
    started,
    { nonce: '999' },
    'm3-quota-request-01',
  );
  await assert.rejects(
    test.repository.acceptAction(started.experimentId, overQuota),
    (error: any) => error.code === 'QUOTA_EXCEEDED',
  );

  const second = await bootstrap(test.repository, 'two');
  const stale = await envelopeFor(
    test.repository,
    second,
    { expectedPortfolioVersion: '1' },
    'm3-stale-request-01',
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, stale),
    (error: any) => error.code === 'STALE_PORTFOLIO',
  );
  const expired = await envelopeFor(
    test.repository,
    second,
    { validUntil: String(Math.floor(Date.now() / 1000) - 1) },
    'm3-expired-request-1',
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, expired),
    (error: any) => error.code === 'EXPIRED',
  );
  const wrongProfile = await envelopeFor(
    test.repository,
    second,
    { networkProfile: 'CROSS_CHAIN_TESTNET' },
    'm3-profile-request-1',
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, wrongProfile),
    (error: any) => error.code === 'POLICY_VIOLATION',
  );
  const wrongScenario = await envelopeFor(
    test.repository,
    second,
    { capitalScenarioId: 'unknown-scenario' },
    'm3-scenario-request-1',
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, wrongScenario),
    (error: any) => error.code === 'POLICY_VIOLATION',
  );
  const wrongPolicy = await envelopeFor(
    test.repository,
    second,
    { policyHash: contentHash('wrong') },
    'm3-policy-request-01',
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, wrongPolicy),
    (error: any) => error.code === 'POLICY_VIOLATION',
  );

  const policy = await test.repository.getPolicy(second.experimentId);
  const unauthorized = privateKeyToAccount(`0x${'33'.repeat(32)}` as Hex);
  const valid = await envelopeFor(
    test.repository,
    second,
    { nonce: '9' },
    'm3-invalid-key-0001',
  );
  const invalidKey = await signAction(
    valid.request.intent,
    policy,
    valid.request.idempotencyKey,
    {
      getAddress: async () => unauthorized.address,
      signTypedData: (data) => unauthorized.signTypedData(data),
    },
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, invalidKey),
    (error: any) => error.code === 'INVALID_SIGNATURE',
  );
  const wrongDomain = await signAction(
    valid.request.intent,
    {
      ...policy,
      signingDomain: { ...policy.signingDomain, chainId: '31338' },
    },
    'm3-wrong-domain-001',
    {
      getAddress: async () => account.address,
      signTypedData: (data) => account.signTypedData(data),
    },
  );
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, wrongDomain),
    (error: any) => error.code === 'INVALID_SIGNATURE',
  );
  const tamperedBytes = {
    ...valid,
    signedBytes: `${valid.signedBytes.slice(0, -2)}00`,
  };
  await assert.rejects(
    test.repository.acceptAction(second.experimentId, tamperedBytes),
    (error: any) => error.code === 'INVALID_SIGNATURE',
  );

  const concurrencyEnvelope1 = await envelopeFor(
    test.repository,
    second,
    { nonce: '10' },
    'm3-concurrent-0001',
  );
  const concurrencyEnvelope2 = await envelopeFor(
    test.repository,
    second,
    { nonce: '11' },
    'm3-concurrent-0002',
  );
  const concurrent = await Promise.allSettled([
    test.repository.acceptAction(second.experimentId, concurrencyEnvelope1),
    test.repository.acceptAction(second.experimentId, concurrencyEnvelope2),
  ]);
  assert.equal(concurrent.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(
    (concurrent.find((x) => x.status === 'rejected') as PromiseRejectedResult)
      .reason.code,
    'SCENARIO_BUSY',
  );
  await assert.rejects(
    test.pool.query(
      "UPDATE economic_journal SET payload='{}'::jsonb WHERE experiment_id=$1",
      [second.experimentId],
    ),
    /append-only/,
  );
  const third = await bootstrap(test.repository, 'three');
  await test.repository.revokeAgentVersion(
    third.versionId,
    'Compromised test key',
  );
  const afterRevocation = await envelopeFor(
    test.repository,
    third,
    { nonce: '7' },
    'm3-revoked-key-001',
  );
  await assert.rejects(
    test.repository.acceptAction(third.experimentId, afterRevocation),
    (error: any) => error.code === 'KEY_REVOKED',
  );
  console.log(
    'PASS: M3 external gate, immutable snapshot hashes, correction preservation, domain/signature/key/expiry/profile/scenario/version validation, nonce/idempotency/concurrency, atomic journal/job',
  );
} finally {
  await test.cleanup();
}
