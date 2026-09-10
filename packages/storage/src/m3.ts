import type { Pool, PoolClient } from 'pg';
import { createPortfolio, applyReceipt } from '@poa/accounting';
import type { ConfigBundle } from '@poa/config';
import { profileReadiness, loadOperationsPolicy } from '@poa/config';
import { OperationsRepository } from './operations.js';
import { contentHash, PoaError } from '@poa/domain';
import { planAllocation } from '@poa/execution';
import {
  Profile,
  SyntheticProfile,
  ActionEnvelope,
  ActionRecord,
  AgentRecord,
  AgentRegistration,
  AgentVersionRecord,
  AgentVersionRegistration,
  CorrectionRecord,
  ExperimentCreateRequest,
  ExperimentPolicy,
  ExperimentPortfolios,
  ExperimentRecord,
  type AccountingReceiptData,
  type ActionEnvelopeData,
  type AgentRegistrationData,
  type AgentVersionRegistrationData,
  type ExperimentCreateRequestData,
  type ProfileData,
  type ShadowPortfolioData,
} from '@poa/schemas';
import { recoverActionSigner, verifySignedBytes } from '@poa/sdk';
import { makeReferences } from '@poa/valuation';
import { evaluateScenario, replayM4 } from '@poa/evaluation';
import {
  M4ReplayBundle,
  ReferencePortfolio,
  ScenarioCheckpoint,
  ScenarioEvaluation,
  type M4ReplayBundleData,
  type CheckpointReplayInputsData,
  type ScenarioCheckpointData,
} from '@poa/schemas';

const SYNTHETIC_PROFILE_ID = 'synthetic-m3-local';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const iso = (value: Date | string) =>
  new Date(value).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const json = (value: unknown) => JSON.stringify(value);
const first = <T>(
  rows: T[],
  code: ConstructorParameters<typeof PoaError>[0],
  message: string,
) => {
  if (!rows[0]) throw new PoaError(code, message);
  return rows[0];
};

export interface ExperimentRepositoryOptions {
  bundle: ConfigBundle;
  bundleHash: `0x${string}`;
  allowSynthetic?: boolean;
}

export class ExperimentRepository {
  constructor(
    readonly pool: Pool,
    private readonly options: ExperimentRepositoryOptions,
  ) {}

  private async transaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    existing?: PoolClient,
  ) {
    if (existing) return fn(existing);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createAgent(input: AgentRegistrationData) {
    const parsed = AgentRegistration.parse(input);
    const row = first(
      (
        await this.pool.query<{ created_at: Date }>(
          'INSERT INTO agents(agent_id, display_name, payload) VALUES ($1,$2,$3::jsonb) RETURNING created_at',
          [parsed.agentId, parsed.displayName, json(parsed)],
        )
      ).rows,
      'AGENT_NOT_FOUND',
      'Agent insert failed',
    );
    return AgentRecord.parse({
      schemaVersion: 'proof-of-alpha/agent/v1',
      ...parsed,
      createdAt: iso(row.created_at),
    });
  }

  async createAgentVersion(
    agentId: string,
    input: AgentVersionRegistrationData,
  ) {
    const parsed = AgentVersionRegistration.parse(input);
    const createdAt = iso(
      first(
        (
          await this.pool.query<{ now: Date }>(
            'SELECT clock_timestamp() AS now',
          )
        ).rows,
        'DATABASE_UNAVAILABLE',
        'Database clock unavailable',
      ).now,
    );
    const payload = AgentVersionRecord.parse({
      schemaVersion: 'proof-of-alpha/agent-version/v1',
      agentId,
      ...parsed,
      runtimeProvenance: 'SELF_REPORTED',
      createdAt,
      revokedAt: null,
      revocationReason: null,
    });
    await this.pool.query(
      'INSERT INTO agent_versions(version_id,agent_id,declared_version_hash,decision_keys,payload,created_at) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [
        parsed.versionId,
        agentId,
        parsed.declaredVersionHash,
        json(parsed.decisionKeys),
        json(payload),
        createdAt,
      ],
    );
    return payload;
  }

  async revokeAgentVersion(versionId: string, reason: string) {
    const row = first(
      (
        await this.pool.query<{ payload: unknown; revoked_at: Date }>(
          'UPDATE agent_versions SET revoked_at=COALESCE(revoked_at,clock_timestamp()), revocation_reason=COALESCE(revocation_reason,$2) WHERE version_id=$1 RETURNING payload,revoked_at',
          [versionId, reason],
        )
      ).rows,
      'AGENT_VERSION_NOT_FOUND',
      'Agent version not found',
    );
    return AgentVersionRecord.parse({
      ...(row.payload as object),
      revokedAt: iso(row.revoked_at),
      revocationReason: reason,
    });
  }

  async createExperiment(input: ExperimentCreateRequestData) {
    const parsed = ExperimentCreateRequest.parse(input);
    const row = first(
      (
        await this.pool.query<{ created_at: Date }>(
          "INSERT INTO experiments(experiment_id,agent_id,version_id,profile_id,state) VALUES ($1,$2,$3,$4,'DRAFT') RETURNING created_at",
          [
            parsed.experimentId,
            parsed.agentId,
            parsed.versionId,
            parsed.profileId,
          ],
        )
      ).rows,
      'EXPERIMENT_NOT_FOUND',
      'Experiment insert failed',
    );
    return ExperimentRecord.parse({
      schemaVersion: 'proof-of-alpha/experiment/v1',
      ...parsed,
      state: 'DRAFT',
      createdAt: iso(row.created_at),
      policy: null,
      policyHash: null,
      configurationHash: null,
      profileHash: null,
      adapterSetHash: null,
      parserSetHash: null,
    });
  }

  private resolveProfile(profileId: string): ProfileData {
    if (profileId === SYNTHETIC_PROFILE_ID) {
      if (!this.options.allowSynthetic)
        throw new PoaError(
          'PROFILE_DISABLED',
          'Synthetic M3 profile is disabled',
        );
      const base = this.options.bundle.profiles.profiles.find(
        (profile) => profile.profileId === 'ethereum-forward',
      )!;
      return {
        ...structuredClone(base),
        profileId: SYNTHETIC_PROFILE_ID,
        profileVersion: '0.7.0',
        enabled: true,
        resultProvenance: 'SYNTHETIC_TEST',
        requiredDependencyIds: [],
        limitations: [
          'Local deterministic M3 fixture; excluded from real-capital eligibility.',
          'Synthetic clock maps one declared block offset to one second; compressed software timing is not a chain observation.',
          'Uses archived synthetic observations and a zero-address EIP-712 domain; no deployment is claimed.',
        ],
      };
    }
    const profile = this.options.bundle.profiles.profiles.find(
      (candidate) => candidate.profileId === profileId,
    );
    if (!profile) throw new PoaError('PROFILE_DISABLED', 'Unknown profile');
    const readiness = profileReadiness(profile, this.options.bundle);
    if (!profile.enabled || readiness.blockers.length)
      throw new PoaError(
        'DEPENDENCY_UNVERIFIED',
        `Profile activation blocked: ${readiness.blockers.join(', ')}`,
      );
    return profile;
  }

  async startExperiment(experimentId: string) {
    return this.transaction(async (client) => {
      const experiment = first(
        (
          await client.query<{
            agent_id: string;
            version_id: string;
            profile_id: string;
            state: string;
            created_at: Date;
          }>('SELECT * FROM experiments WHERE experiment_id=$1 FOR UPDATE', [
            experimentId,
          ])
        ).rows,
        'EXPERIMENT_NOT_FOUND',
        'Experiment not found',
      );
      if (experiment.state !== 'DRAFT')
        throw new PoaError('EXPERIMENT_LOCKED', 'Experiment already started');
      const version = first(
        (
          await client.query<{
            declared_version_hash: string;
            revoked_at: Date | null;
          }>(
            'SELECT * FROM agent_versions WHERE version_id=$1 AND agent_id=$2',
            [experiment.version_id, experiment.agent_id],
          )
        ).rows,
        'AGENT_VERSION_NOT_FOUND',
        'Agent version not found',
      );
      if (version.revoked_at)
        throw new PoaError('KEY_REVOKED', 'Agent version was revoked');
      const profile = this.resolveProfile(experiment.profile_id);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'active-experiment-quota',
      ]);
      const quota = loadOperationsPolicy();
      const active = (
        await client.query(
          "SELECT agent_id,profile_id FROM experiments WHERE state='STARTED'",
        )
      ).rows;
      if (
        active.some(
          (row) =>
            row.agent_id === experiment.agent_id &&
            row.profile_id === experiment.profile_id,
        ) ||
        (!active.some((row) => row.agent_id === experiment.agent_id) &&
          new Set(active.map((row) => row.agent_id)).size >=
            quota.maxActiveAgents)
      )
        throw new PoaError(
          'QUOTA_EXCEEDED',
          'Active agent or agent/profile experiment quota reached',
        );
      const lockedAt = iso(
        first(
          (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
            .rows,
          'DATABASE_UNAVAILABLE',
          'Database clock unavailable',
        ).now,
      );
      const profileHash = contentHash(profile);
      const adapters = this.options.bundle.instruments.instruments
        .filter((instrument) =>
          profile.instrumentAllowlist.includes(instrument.instrumentId),
        )
        .map((instrument) => ({
          adapterId: instrument.adapterId,
          version: instrument.adapterVersion,
          sourceHash: contentHash({
            adapterId: instrument.adapterId,
            version: instrument.adapterVersion,
          }),
        }))
        .filter(
          (entry, index, all) =>
            all.findIndex((x) => x.adapterId === entry.adapterId) === index,
        )
        .sort((a, b) => a.adapterId.localeCompare(b.adapterId));
      const parserSet = [
        {
          parserId: 'm2-economic-inputs',
          version: '1.0.0',
          sourceHash: contentHash('packages/schemas/src/economic.ts@1.0.0'),
        },
      ];
      const adapterSetHash = contentHash(adapters);
      const parserSetHash = contentHash(parserSet);
      const registryNetwork = this.options.bundle.networks.networks.find(
        (network) => network.networkId === profile.registryNetworkId,
      );
      const signingDomain =
        profile.profileId === SYNTHETIC_PROFILE_ID
          ? {
              name: 'Proof of Alpha' as const,
              version: '1' as const,
              chainId: '31337',
              verifyingContract: ZERO_ADDRESS,
            }
          : {
              name: 'Proof of Alpha' as const,
              version: '1' as const,
              chainId: registryNetwork!.chainId,
              verifyingContract: registryNetwork!.contracts.commitmentRegistry!,
            };
      const configurationHash = contentHash({
        manifestBundleHash: this.options.bundleHash,
        profileHash,
        adapterSetHash,
        parserSetHash,
      });
      const policy = ExperimentPolicy.parse({
        schemaVersion: 'proof-of-alpha/experiment-policy/v1',
        experimentId,
        agentId: experiment.agent_id,
        declaredVersionHash: version.declared_version_hash,
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
        profileHash,
        manifestBundleHash: this.options.bundleHash,
        configurationHash,
        adapterSetHash,
        parserSetHash,
        transferPolicyHash: contentHash(profile.transfer),
        startsAt: lockedAt,
        endsAt: iso(
          new Date(Date.parse(lockedAt) + profile.durationSeconds * 1000),
        ),
        lockedAt,
        networkProfile: profile.networkProfile,
        resultProvenance: profile.resultProvenance,
        engineVersions: {
          accounting: '1.0.0',
          planner: '1.0.0',
          execution: '1.0.0',
          valuation: '1.0.0',
          evaluation: '1.0.0',
        },
        engineSourceHash: contentHash('poa-m3-engines@1.0.0'),
        adapterVersions: adapters.length
          ? adapters
          : [
              {
                adapterId: 'synthetic-m3',
                version: '1.0.0',
                sourceHash: contentHash('synthetic-m3@1.0.0'),
              },
            ],
        signingDomain,
        automaticFundingEnabled: false,
      });
      const policyHash = contentHash(policy);
      await client.query(
        'INSERT INTO experiment_profile_snapshots(experiment_id,profile_hash,payload) VALUES($1,$2,$3::jsonb)',
        [experimentId, profileHash, json(profile)],
      );
      await client.query(
        "UPDATE experiments SET state='STARTED',locked_at=$2,policy=$3::jsonb,policy_hash=$4,configuration_hash=$5,profile_hash=$6,adapter_set_hash=$7,parser_set_hash=$8 WHERE experiment_id=$1",
        [
          experimentId,
          lockedAt,
          json(policy),
          policyHash,
          configurationHash,
          profileHash,
          adapterSetHash,
          parserSetHash,
        ],
      );
      const network = this.options.bundle.networks.networks.find(
        (x) => x.networkId === 'ethereum-mainnet',
      )!;
      const usdc = network.assets.find((x) => x.assetId === 'usdc')!;
      for (const scenario of profile.capitalScenarios) {
        const portfolio = createPortfolio({
          experimentId,
          scenarioId: scenario.id,
          portfolioId: `${experimentId}-${scenario.id}`,
          resultProvenance: profile.resultProvenance,
          initialValueUsdcMinor: scenario.initialAmountUsdcMinor,
          maxDestinationAttempts: String(
            profile.transfer.maxDestinationAttempts,
          ),
          balanceViews: [
            {
              viewId: 'eth-usdc-view',
              networkId: network.networkId,
              assetId: 'usdc',
              balanceFamilyId: 'eth-usdc-family',
              decimals: usdc.decimals!,
              canonicalDecimals: 6,
            },
          ],
          initialCash: [
            {
              viewId: 'eth-usdc-view',
              amountUsdcMinor: scenario.initialAmountUsdcMinor,
            },
          ],
        });
        await client.query(
          'INSERT INTO capital_scenarios(experiment_id,scenario_id,initial_amount_usdc_minor,portfolio,portfolio_version) VALUES ($1,$2,$3,$4::jsonb,0)',
          [
            experimentId,
            scenario.id,
            scenario.initialAmountUsdcMinor,
            json(portfolio),
          ],
        );
        for (const reference of makeReferences(
          portfolio,
          policy.startsAt,
          policy.endsAt,
        )) {
          await client.query(
            'INSERT INTO reference_portfolios(experiment_id,scenario_id,reference_id,reference_kind,frozen_instrument_id,status,comparison_available,replacement_allowed,portfolio,portfolio_version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8::jsonb,0,$9::jsonb)',
            [
              experimentId,
              scenario.id,
              reference.referenceId,
              reference.kind,
              reference.frozenInstrumentId,
              reference.status,
              reference.comparisonAvailable,
              json(reference.portfolio),
              json(reference),
            ],
          );
        }
      }
      await this.appendEvent(
        client,
        experimentId,
        'POLICY_LOCKED',
        lockedAt,
        policy,
        profile.resultProvenance,
      );
      return {
        experiment: ExperimentRecord.parse({
          schemaVersion: 'proof-of-alpha/experiment/v1',
          experimentId,
          agentId: experiment.agent_id,
          versionId: experiment.version_id,
          profileId: experiment.profile_id,
          state: 'STARTED',
          createdAt: iso(experiment.created_at),
          policy,
          policyHash,
          configurationHash,
          profileHash,
          adapterSetHash,
          parserSetHash,
        }),
        policy,
        policyHash,
      };
    });
  }

  private async appendEvent(
    client: PoolClient,
    experimentId: string,
    type: string,
    occurredAt: string,
    payload: unknown,
    provenance: string,
  ) {
    const prior = (
      await client.query<{ sequence: string; content_hash: string }>(
        'SELECT sequence::text,content_hash FROM economic_journal WHERE experiment_id=$1 ORDER BY sequence DESC LIMIT 1 FOR UPDATE',
        [experimentId],
      )
    ).rows[0];
    const sequence = (BigInt(prior?.sequence ?? '0') + 1n).toString();
    const event = {
      experimentId,
      sequence,
      type,
      occurredAt,
      resultProvenance: provenance,
      payload,
      previousEventHash: prior?.content_hash ?? null,
    };
    const hash = contentHash(event);
    await client.query(
      'INSERT INTO economic_journal(experiment_id,sequence,event_type,occurred_at,content_hash,previous_event_hash,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [
        experimentId,
        sequence,
        type,
        occurredAt,
        hash,
        prior?.content_hash ?? null,
        json(event),
      ],
    );
    return { sequence, hash };
  }

  async getPolicy(experimentId: string) {
    const row = first(
      (
        await this.pool.query<{ policy: unknown }>(
          'SELECT policy FROM experiments WHERE experiment_id=$1',
          [experimentId],
        )
      ).rows,
      'EXPERIMENT_NOT_FOUND',
      'Experiment not found',
    );
    if (!row.policy)
      throw new PoaError('EXPERIMENT_NOT_STARTED', 'Experiment not started');
    return ExperimentPolicy.parse(row.policy);
  }

  async getPortfolios(experimentId: string) {
    const policy = await this.getPolicy(experimentId);
    const rows = (
      await this.pool.query<{
        scenario_id: string;
        initial_amount_usdc_minor: string;
        portfolio: unknown;
      }>(
        'SELECT scenario_id,initial_amount_usdc_minor::text,portfolio FROM capital_scenarios WHERE experiment_id=$1 ORDER BY initial_amount_usdc_minor',
        [experimentId],
      )
    ).rows;
    return ExperimentPortfolios.parse({
      experimentId,
      resultProvenance: policy.resultProvenance,
      scenarios: rows.map((row) => ({
        scenarioId: row.scenario_id,
        initialAmountUsdcMinor: row.initial_amount_usdc_minor,
        portfolio: row.portfolio,
      })),
    });
  }

  async getInstruments(experimentId: string) {
    const policy = await this.getPolicy(experimentId);
    const source =
      policy.profileId === SYNTHETIC_PROFILE_ID
        ? 'ethereum-forward'
        : policy.profileId;
    const profile = this.options.bundle.profiles.profiles.find(
      (x) => x.profileId === source,
    )!;
    return {
      experimentId,
      policyHash: contentHash(policy),
      instruments: this.options.bundle.instruments.instruments.filter((x) =>
        profile.instrumentAllowlist.includes(x.instrumentId),
      ),
    };
  }

  async frozenProfile(
    experimentId: string,
    client: Pool | PoolClient = this.pool,
  ): Promise<ProfileData> {
    const exp = (
      await client.query(
        'SELECT profile_id,profile_hash FROM experiments WHERE experiment_id=$1',
        [experimentId],
      )
    ).rows[0];
    if (!exp)
      throw new PoaError('EXPERIMENT_NOT_FOUND', 'Experiment not found');
    const snapshot = (
      await client.query(
        'SELECT payload FROM experiment_profile_snapshots WHERE experiment_id=$1',
        [experimentId],
      )
    ).rows[0];
    const profile = snapshot
      ? (exp.profile_id === SYNTHETIC_PROFILE_ID
          ? SyntheticProfile
          : Profile
        ).parse(snapshot.payload)
      : this.resolveProfile(exp.profile_id);
    if (contentHash(profile) !== exp.profile_hash)
      throw new PoaError(
        'VERSION_DRIFT',
        'Frozen profile is unavailable; restore its exact archived version',
      );
    return profile;
  }

  async acceptAction(experimentId: string, input: ActionEnvelopeData) {
    const envelope = ActionEnvelope.parse(input);
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
        [experimentId, envelope.request.intent.capitalScenarioId],
      );
      const exp = first(
        (
          await client.query<{
            policy: unknown;
            policy_hash: string;
            version_id: string;
            state: string;
            profile_id: string;
          }>(
            'SELECT policy,policy_hash,version_id,state,profile_id FROM experiments WHERE experiment_id=$1 FOR SHARE',
            [experimentId],
          )
        ).rows,
        'EXPERIMENT_NOT_FOUND',
        'Experiment not found',
      );
      const requestHash = contentHash(envelope);
      const priorKey = (
        await client.query<{ action_id: string; request_hash: string }>(
          'SELECT action_id,request_hash FROM action_intents WHERE experiment_id=$1 AND idempotency_key=$2',
          [experimentId, envelope.request.idempotencyKey],
        )
      ).rows[0];
      if (priorKey) {
        if (priorKey.request_hash !== requestHash)
          throw new PoaError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused with different content',
          );
        return this.getActionWith(client, experimentId, priorKey.action_id);
      }
      if (exp.state !== 'STARTED' || !exp.policy)
        throw new PoaError(
          'EXPERIMENT_NOT_STARTED',
          'Experiment is not accepting actions',
        );
      const policy = ExperimentPolicy.parse(exp.policy);
      const receivedAt = iso(
        first(
          (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
            .rows,
          'DATABASE_UNAVAILABLE',
          'Database clock unavailable',
        ).now,
      );
      const intent = envelope.request.intent;
      if (
        intent.experimentId !== experimentId ||
        intent.agentId !== policy.agentId ||
        intent.declaredVersionHash !== policy.declaredVersionHash ||
        intent.policyHash !== exp.policy_hash ||
        intent.transferPolicyHash !== policy.transferPolicyHash ||
        intent.networkProfile !== policy.networkProfile
      )
        throw new PoaError(
          'POLICY_VIOLATION',
          'Signed intent binding differs from frozen policy',
        );
      if (
        BigInt(intent.validUntil) <=
        BigInt(Math.floor(Date.parse(receivedAt) / 1000))
      )
        throw new PoaError(
          'EXPIRED',
          'Intent arrived after its validity deadline',
        );
      const version = first(
        (
          await client.query<{
            decision_keys: unknown;
            revoked_at: Date | null;
          }>(
            'SELECT decision_keys,revoked_at FROM agent_versions WHERE version_id=$1',
            [exp.version_id],
          )
        ).rows,
        'AGENT_VERSION_NOT_FOUND',
        'Agent version not found',
      );
      if (version.revoked_at)
        throw new PoaError('KEY_REVOKED', 'Agent version was revoked');
      const hashes = verifySignedBytes(envelope, policy);
      const signer = await recoverActionSigner(
        intent,
        policy,
        envelope.request.signature,
      );
      const keys = version.decision_keys as string[];
      if (!keys.map((x) => x.toLowerCase()).includes(signer))
        throw new PoaError(
          'INVALID_SIGNATURE',
          'Signer is not an authorized decision key',
        );
      if (
        (
          await client.query(
            'SELECT 1 FROM action_intents WHERE experiment_id=$1 AND scenario_id=$2 AND nonce=$3',
            [experimentId, intent.capitalScenarioId, intent.nonce],
          )
        ).rowCount
      )
        throw new PoaError(
          'NONCE_USED',
          'Nonce was already used in this scenario',
        );
      const scenario = first(
        (
          await client.query<{
            portfolio: unknown;
            portfolio_version: string;
            active_action_id: string | null;
          }>(
            'SELECT portfolio,portfolio_version::text,active_action_id FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2 FOR UPDATE',
            [experimentId, intent.capitalScenarioId],
          )
        ).rows,
        'POLICY_VIOLATION',
        'Scenario is outside experiment',
      );
      if (scenario.portfolio_version !== intent.expectedPortfolioVersion)
        throw new PoaError(
          'STALE_PORTFOLIO',
          `Expected portfolio ${intent.expectedPortfolioVersion}, current ${scenario.portfolio_version}`,
        );
      if (scenario.active_action_id)
        throw new PoaError(
          'SCENARIO_BUSY',
          'Scenario already has an active action',
        );
      const profile = await this.frozenProfile(experimentId, client);
      if (Date.parse(receivedAt) >= Date.parse(policy.endsAt))
        throw new PoaError('EXPIRED', 'Experiment deadline has passed');
      const count = Number(
        first(
          (
            await client.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM action_intents WHERE experiment_id=$1 AND scenario_id=$2 AND received_at >= $3::timestamptz - interval '24 hours'",
              [experimentId, intent.capitalScenarioId, receivedAt],
            )
          ).rows,
          'DATABASE_UNAVAILABLE',
          'Quota query failed',
        ).count,
      );
      if (count >= profile.quotas.acceptedIntentsPerDayPerScenario)
        throw new PoaError(
          'QUOTA_EXCEEDED',
          'Scenario daily accepted-intent quota reached',
        );
      const actionId = `act-${hashes.intentHash.slice(2, 26)}`;
      const network = this.options.bundle.networks.networks.find(
        (x) => x.networkId === 'ethereum-mainnet',
      )!;
      planAllocation(
        policy,
        scenario.portfolio as ShadowPortfolioData,
        intent,
        {
          actionId,
          receivedAt,
          profile:
            policy.profileId === SYNTHETIC_PROFILE_ID
              ? {
                  ...profile,
                  profileId: SYNTHETIC_PROFILE_ID,
                  enabled: true,
                  resultProvenance: 'SYNTHETIC_TEST',
                  requiredDependencyIds: [],
                }
              : profile,
          assetAddresses: {
            'ethereum-mainnet/usdc': network.assets.find(
              (x) => x.assetId === 'usdc',
            )!.address!,
          },
        },
      );
      const event = await this.appendEvent(
        client,
        experimentId,
        'ACTION_ACCEPTED',
        receivedAt,
        { actionId, requestHash, ...hashes },
        policy.resultProvenance,
      );
      await client.query(
        "INSERT INTO action_intents(action_id,experiment_id,scenario_id,nonce,idempotency_key,request_hash,intent_hash,typed_data_hash,signed_bytes_hash,signer,payload,signed_bytes,received_at,sequence,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,'ACCEPTED')",
        [
          actionId,
          experimentId,
          intent.capitalScenarioId,
          intent.nonce,
          envelope.request.idempotencyKey,
          requestHash,
          hashes.intentHash,
          hashes.typedDataHash,
          hashes.signedBytesHash,
          signer,
          json(envelope),
          envelope.signedBytes,
          receivedAt,
          event.sequence,
        ],
      );
      await client.query(
        'UPDATE capital_scenarios SET active_action_id=$3 WHERE experiment_id=$1 AND scenario_id=$2',
        [experimentId, intent.capitalScenarioId, actionId],
      );
      await client.query(
        "INSERT INTO jobs(job_id,job_type,financial_identity,payload,state) VALUES ($1,'EXECUTE_ACTION',$2,$3::jsonb,'READY')",
        [`job-${actionId}`, actionId, json({ actionId })],
      );
      return this.getActionWith(client, experimentId, actionId);
    });
  }

  private async getActionWith(
    client: Pool | PoolClient,
    experimentId: string,
    actionId: string,
  ) {
    const row = first(
      (
        await client.query<{ payload: any; [key: string]: any }>(
          'SELECT * FROM action_intents WHERE experiment_id=$1 AND action_id=$2',
          [experimentId, actionId],
        )
      ).rows,
      'DATA_UNAVAILABLE',
      'Action not found',
    );
    const record = ActionRecord.parse({
      schemaVersion: 'proof-of-alpha/action-record/v1',
      actionId,
      request: row.payload.request,
      intentHash: row.intent_hash,
      typedDataHash: row.typed_data_hash,
      signedBytesHash: row.signed_bytes_hash,
      signer: row.signer,
      receivedAt: iso(row.received_at),
      sequence: String(row.sequence),
      status: row.status,
      reasonCodes: row.reason_codes,
      planHash: row.plan_hash,
      beforePortfolioHash: row.before_portfolio_hash,
      afterPortfolioHash: row.after_portfolio_hash,
      completedAt: row.completed_at ? iso(row.completed_at) : null,
    });
    return {
      record,
      acknowledgment: {
        actionId,
        receivedAt: record.receivedAt,
        sequence: record.sequence,
        policyHash: row.payload.request.intent.policyHash,
        portfolioVersion: row.payload.request.intent.expectedPortfolioVersion,
        status: record.status,
        reasonCodes: record.reasonCodes,
      },
      intentHash: record.intentHash,
      typedDataHash: record.typedDataHash,
      signedBytesHash: record.signedBytesHash,
    };
  }

  getAction(experimentId: string, actionId: string) {
    return this.getActionWith(this.pool, experimentId, actionId);
  }

  async createCorrection(
    experimentId: string,
    correctionId: string,
    originalContentHash: string,
    corrected: unknown,
    reason: string,
  ) {
    const correctedContentHash = contentHash(corrected);
    return this.transaction(async (client) => {
      const now = iso(
        first(
          (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
            .rows,
          'DATABASE_UNAVAILABLE',
          'Database clock unavailable',
        ).now,
      );
      const record = CorrectionRecord.parse({
        schemaVersion: 'proof-of-alpha/correction/v1',
        correctionId,
        experimentId,
        originalContentHash,
        correctedContentHash,
        reason,
        createdAt: now,
      });
      await client.query(
        'INSERT INTO experiment_corrections(correction_id,experiment_id,original_content_hash,corrected_content_hash,reason,payload,created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)',
        [
          correctionId,
          experimentId,
          originalContentHash,
          correctedContentHash,
          reason,
          json({ record, corrected }),
          now,
        ],
      );
      const policy = await this.getPolicy(experimentId);
      await this.appendEvent(
        client,
        experimentId,
        'CORRECTION',
        now,
        { record, corrected },
        policy.resultProvenance,
      );
      return record;
    });
  }

  async claimJob(workerId: string, leaseSeconds = 30) {
    return this.transaction(async (client) => {
      const row = (
        await client.query<{
          job_id: string;
          payload: any;
          attempt: number;
          max_attempts: number;
          state: string;
        }>(
          "SELECT job_id,payload,attempt,max_attempts,state FROM jobs WHERE (state IN ('READY','RETRY') AND available_at <= clock_timestamp()) OR (state='RUNNING' AND leased_until < clock_timestamp()) ORDER BY available_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!row) return null;
      await client.query(
        "UPDATE jobs SET state='RUNNING',attempt=least(attempt+1,max_attempts),worker_id=$2,leased_until=clock_timestamp()+($3 * interval '1 second'),updated_at=clock_timestamp() WHERE job_id=$1",
        [row.job_id, workerId, leaseSeconds],
      );
      return {
        jobId: row.job_id,
        actionId: row.payload.actionId as string,
        attempt: Math.min(row.attempt + 1, row.max_attempts),
        exhausted: row.attempt >= row.max_attempts,
        recoveredLease: row.state === 'RUNNING',
      };
    });
  }

  async loadExecution(actionId: string) {
    const row = first(
      (
        await this.pool.query<any>(
          'SELECT a.*,e.policy,s.portfolio FROM action_intents a JOIN experiments e USING(experiment_id) JOIN capital_scenarios s ON s.experiment_id=a.experiment_id AND s.scenario_id=a.scenario_id WHERE a.action_id=$1',
          [actionId],
        )
      ).rows,
      'DATA_UNAVAILABLE',
      'Execution action not found',
    );
    return {
      actionId,
      experimentId: row.experiment_id as string,
      scenarioId: row.scenario_id as string,
      envelope: ActionEnvelope.parse(row.payload),
      policy: ExperimentPolicy.parse(row.policy),
      portfolio: row.portfolio as ShadowPortfolioData,
      receivedAt: iso(row.received_at),
      status: row.status as string,
      profile: await this.frozenProfile(row.experiment_id),
    };
  }

  async savePlan(
    actionId: string,
    plan: unknown,
    syntheticInputBundle: unknown,
  ) {
    return this.transaction(async (client) => {
      const hash = contentHash(plan);
      const action = first(
        (
          await client.query(
            'SELECT a.status,s.portfolio FROM action_intents a JOIN capital_scenarios s ON s.experiment_id=a.experiment_id AND s.scenario_id=a.scenario_id WHERE a.action_id=$1 FOR UPDATE OF a,s',
            [actionId],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Action not found',
      );
      const prior = (
        await client.query(
          'SELECT plan_hash,synthetic_input_bundle FROM execution_plans WHERE action_id=$1',
          [actionId],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.plan_hash !== hash ||
          contentHash(prior.synthetic_input_bundle) !==
            contentHash(syntheticInputBundle)
        )
          throw new PoaError(
            'OPERATION_CONFLICT',
            'Durable plan or archived inputs differ on retry',
          );
        return hash;
      }
      if (action.status !== 'ACCEPTED')
        throw new PoaError(
          'OPERATION_CONFLICT',
          'Only an accepted action can acquire its first plan',
        );
      await client.query(
        'INSERT INTO execution_plans(action_id,plan_hash,payload,synthetic_input_bundle) VALUES($1,$2,$3::jsonb,$4::jsonb)',
        [actionId, hash, json(plan), json(syntheticInputBundle)],
      );
      await client.query(
        "UPDATE action_intents SET status='IN_PROGRESS',plan_hash=$2,before_portfolio_hash=$3 WHERE action_id=$1",
        [actionId, hash, contentHash(action.portfolio)],
      );
      return hash;
    });
  }

  async loadPlan(actionId: string) {
    return (
      (
        await this.pool.query<any>(
          'SELECT payload,synthetic_input_bundle FROM execution_plans WHERE action_id=$1',
          [actionId],
        )
      ).rows[0] ?? null
    );
  }

  async applyActionReceipt(actionId: string, receipt: AccountingReceiptData) {
    return this.transaction(async (client) => {
      const action = first(
        (
          await client.query<any>(
            'SELECT experiment_id,scenario_id,status FROM action_intents WHERE action_id=$1 FOR UPDATE',
            [actionId],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Action not found',
      );
      const scenario = first(
        (
          await client.query<any>(
            'SELECT portfolio FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2 FOR UPDATE',
            [action.experiment_id, action.scenario_id],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Scenario not found',
      );
      const prior = (
        await client.query(
          'SELECT receipt_hash FROM accounting_receipts WHERE action_id=$1 AND operation_id=$2',
          [actionId, receipt.operationId],
        )
      ).rows[0];
      if (prior) {
        if (prior.receipt_hash !== contentHash(receipt))
          throw new PoaError(
            'OPERATION_CONFLICT',
            'Persisted receipt differs on retry',
          );
        return scenario.portfolio as ShadowPortfolioData;
      }
      if (
        ['SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'EXPIRED'].includes(
          action.status,
        )
      )
        throw new PoaError(
          'OPERATION_CONFLICT',
          'Terminal action cannot gain another financial effect',
        );
      const next = applyReceipt(
        scenario.portfolio as ShadowPortfolioData,
        receipt,
      );
      await client.query(
        'INSERT INTO accounting_receipts(action_id,operation_id,receipt_hash,payload,applied_portfolio_version) VALUES ($1,$2,$3,$4::jsonb,$5)',
        [
          actionId,
          receipt.operationId,
          contentHash(receipt),
          json(receipt),
          next.version,
        ],
      );
      await client.query(
        'UPDATE capital_scenarios SET portfolio=$3::jsonb,portfolio_version=$4 WHERE experiment_id=$1 AND scenario_id=$2',
        [action.experiment_id, action.scenario_id, json(next), next.version],
      );
      return next;
    });
  }

  async completeAction(
    actionId: string,
    status: 'SUCCEEDED' | 'PARTIALLY_SUCCEEDED' | 'FAILED' | 'EXPIRED',
    reasonCodes: string[] = [],
    transaction?: PoolClient,
  ) {
    return this.transaction(async (client) => {
      const row = first(
        (
          await client.query<any>(
            'SELECT a.status,a.experiment_id,a.scenario_id,e.policy,s.portfolio FROM action_intents a JOIN experiments e USING(experiment_id) JOIN capital_scenarios s ON s.experiment_id=a.experiment_id AND s.scenario_id=a.scenario_id WHERE action_id=$1 FOR UPDATE',
            [actionId],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Action not found',
      );
      if (
        ['SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'EXPIRED'].includes(
          row.status,
        )
      )
        return;
      const now = iso(
        first(
          (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
            .rows,
          'DATABASE_UNAVAILABLE',
          'Database clock unavailable',
        ).now,
      );
      await client.query(
        'UPDATE action_intents SET status=$2,reason_codes=$3::jsonb,after_portfolio_hash=$4,completed_at=$5 WHERE action_id=$1',
        [actionId, status, json(reasonCodes), contentHash(row.portfolio), now],
      );
      await client.query(
        'UPDATE capital_scenarios SET active_action_id=NULL WHERE experiment_id=$1 AND scenario_id=$2 AND active_action_id=$3',
        [row.experiment_id, row.scenario_id, actionId],
      );
      await client.query(
        "UPDATE jobs SET state=CASE WHEN $2='FAILED' THEN 'FAILED' ELSE 'COMPLETED' END,leased_until=NULL,updated_at=clock_timestamp() WHERE financial_identity=$1",
        [actionId, status],
      );
      if (status !== 'SUCCEEDED')
        await new OperationsRepository(this.pool).recordIncident(
          {
            incidentId: actionId + '-terminal',
            experimentId: row.experiment_id,
            scenarioId: row.scenario_id,
            code:
              status === 'PARTIALLY_SUCCEEDED'
                ? 'PARTIAL_EXECUTION'
                : status === 'EXPIRED'
                  ? 'INTENT_EXPIRED'
                  : 'EXECUTION_FAILED',
            severity: 'WARNING',
            message: `Action ${status}; reasons: ${reasonCodes.join(', ') || 'none'}. Successful prior effects and incurred costs are retained.`,
            evidenceHashes: [contentHash(row.portfolio)],
            resolvesIncidentId: null,
          },
          client,
        );
      await this.appendEvent(
        client,
        row.experiment_id,
        'EXECUTION',
        now,
        {
          actionId,
          status,
          reasonCodes,
          afterPortfolioHash: contentHash(row.portfolio),
        },
        ExperimentPolicy.parse(row.policy).resultProvenance,
      );
    }, transaction);
  }

  async retryJob(actionId: string, code: string) {
    return this.transaction(async (client) => {
      const action = (
        await client.query(
          'SELECT experiment_id,scenario_id FROM action_intents WHERE action_id=$1 FOR UPDATE',
          [actionId],
        )
      ).rows[0];
      const job = (
        await client.query(
          "UPDATE jobs SET state=CASE WHEN attempt>=max_attempts THEN 'FAILED' ELSE 'RETRY' END,last_error_code=$2,available_at=clock_timestamp(),leased_until=NULL,updated_at=clock_timestamp() WHERE financial_identity=$1 AND state NOT IN ('COMPLETED','FAILED') RETURNING attempt,state",
          [actionId, code],
        )
      ).rows[0];
      if (!job) return;
      const exhausted = job.state === 'FAILED';
      if (exhausted) {
        const n = (
          await client.query(
            'SELECT count(*)::int AS n FROM accounting_receipts WHERE action_id=$1',
            [actionId],
          )
        ).rows[0].n;
        await this.completeAction(
          actionId,
          n ? 'PARTIALLY_SUCCEEDED' : 'FAILED',
          ['RETRY_EXHAUSTED', code],
          client,
        );
        await client.query(
          "UPDATE jobs SET state='FAILED' WHERE financial_identity=$1",
          [actionId],
        );
      }
      await new OperationsRepository(this.pool).recordIncident(
        {
          incidentId: actionId + '-retry-' + job.attempt,
          experimentId: action.experiment_id,
          scenarioId: action.scenario_id,
          code: exhausted ? 'RETRY_EXHAUSTED' : 'WORKER_INTERRUPTED',
          severity: exhausted ? 'ERROR' : 'WARNING',
          message: exhausted
            ? 'Worker retry bound reached; prior financial effects retained and scenario released.'
            : 'Worker interrupted; the same durable plan will resume.',
          evidenceHashes: [
            contentHash({ actionId, attempt: job.attempt, code }),
          ],
          resolvesIncidentId: null,
        },
        client,
      );
    });
  }

  async receiptCount(actionId: string) {
    return Number(
      (
        await this.pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM accounting_receipts WHERE action_id=$1',
          [actionId],
        )
      ).rows[0]!.count,
    );
  }

  async getReferences(experimentId: string) {
    const rows = (
      await this.pool.query<{
        payload: unknown;
        portfolio: unknown;
        status: string;
        comparison_available: boolean;
      }>(
        'SELECT payload,portfolio,status,comparison_available FROM reference_portfolios WHERE experiment_id=$1 ORDER BY scenario_id,reference_kind',
        [experimentId],
      )
    ).rows;
    return rows.map((row) =>
      ReferencePortfolio.parse({
        ...(row.payload as object),
        portfolio: row.portfolio,
        status: row.status,
        comparisonAvailable: row.comparison_available,
      }),
    );
  }

  async applyReferenceEntry(
    referenceId: string,
    receipts: AccountingReceiptData[],
    result: {
      status: 'ACTIVE' | 'ENTRY_FAILED';
      reasonCodes?: string[];
      bundle?: unknown;
    },
  ) {
    return this.transaction(async (client) => {
      const row = first(
        (
          await client.query<any>(
            'SELECT * FROM reference_portfolios WHERE reference_id=$1 FOR UPDATE',
            [referenceId],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Reference not found',
      );
      if (
        row.entry_replay_bundle &&
        result.bundle !== undefined &&
        contentHash(row.entry_replay_bundle) !== contentHash(result.bundle)
      )
        throw new PoaError(
          'OPERATION_CONFLICT',
          'Reference entry identity has different replay evidence',
        );
      if (row.status === 'ENTRY_FAILED' || row.portfolio_version !== '0') {
        if (result.status !== row.status)
          throw new PoaError(
            'EXPERIMENT_LOCKED',
            'Completed reference entry cannot be replaced after experiment start',
          );
        for (const receipt of receipts) {
          const prior = first(
            (
              await client.query<{ receipt_hash: string }>(
                'SELECT receipt_hash FROM reference_receipts WHERE reference_id=$1 AND operation_id=$2',
                [referenceId, receipt.operationId],
              )
            ).rows,
            'OPERATION_CONFLICT',
            'Reference entry retry contains a new operation',
          );
          if (prior.receipt_hash !== contentHash(receipt))
            throw new PoaError(
              'OPERATION_CONFLICT',
              'Reference receipt identity has different content',
            );
        }
        return ReferencePortfolio.parse({
          ...(row.payload as object),
          portfolio: row.portfolio,
          status: row.status,
          comparisonAvailable: row.comparison_available,
        });
      }
      let portfolio = row.portfolio as ShadowPortfolioData;
      for (const receipt of receipts) {
        const prior = await client.query(
          'SELECT receipt_hash FROM reference_receipts WHERE reference_id=$1 AND operation_id=$2',
          [referenceId, receipt.operationId],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].receipt_hash !== contentHash(receipt))
            throw new PoaError(
              'OPERATION_CONFLICT',
              'Reference receipt identity has different content',
            );
          continue;
        }
        portfolio = applyReceipt(portfolio, receipt);
        await client.query(
          'INSERT INTO reference_receipts(reference_id,operation_id,receipt_hash,payload,applied_portfolio_version) VALUES ($1,$2,$3,$4::jsonb,$5)',
          [
            referenceId,
            receipt.operationId,
            contentHash(receipt),
            json(receipt),
            portfolio.version,
          ],
        );
      }
      const payload = ReferencePortfolio.parse({
        ...(row.payload as object),
        portfolio,
        status: result.status,
        comparisonAvailable: result.status === 'ACTIVE',
        failureReasonCodes:
          result.status === 'ENTRY_FAILED'
            ? (result.reasonCodes ?? ['REFERENCE_ENTRY_FAILED'])
            : [],
      });
      await client.query(
        'UPDATE reference_portfolios SET status=$2,comparison_available=$3,portfolio=$4::jsonb,portfolio_version=$5,payload=$6::jsonb,entry_replay_bundle=COALESCE(entry_replay_bundle,$7::jsonb) WHERE reference_id=$1',
        [
          referenceId,
          payload.status,
          payload.comparisonAvailable,
          json(portfolio),
          portfolio.version,
          json(payload),
          result.bundle === undefined ? null : json(result.bundle),
        ],
      );
      return payload;
    });
  }

  async saveScenarioCheckpoint(
    checkpointInput: ScenarioCheckpointData,
    priorAgentMarksUsdcMinor: string[] = [],
    rawObjects: { objectKey: string; bytesHex: string }[] = [],
    checkpointInputs: CheckpointReplayInputsData | null = null,
  ) {
    const checkpoint = ScenarioCheckpoint.parse(checkpointInput);
    if (
      [
        checkpoint.agent,
        checkpoint.cashReference,
        checkpoint.conservativeYieldReference,
      ].some((item) => item.portfolio.positions.length > 0) &&
      (rawObjects.length === 0 || checkpointInputs === null)
    )
      throw new PoaError(
        'DATA_UNAVAILABLE',
        'Position checkpoint requires archived raw inputs and replay inputs',
      );
    const evaluation = evaluateScenario(checkpoint, priorAgentMarksUsdcMinor);
    const replay = M4ReplayBundle.parse({
      schemaVersion: 'proof-of-alpha/m4-replay-bundle/v1',
      checkpoint: (({ checkpointHash: _ignored, ...body }) => body)(checkpoint),
      priorAgentMarksUsdcMinor,
      rawObjects,
      checkpointInputs,
      expectedCheckpointHash: checkpoint.checkpointHash,
      expectedEvaluation: evaluation,
    });
    replayM4(replay);
    return this.transaction(async (client) => {
      const prior = (
        await client.query<{ payload: unknown }>(
          'SELECT payload FROM valuation_checkpoints WHERE checkpoint_id=$1',
          [checkpoint.checkpointId],
        )
      ).rows[0];
      if (prior) {
        const existing = ScenarioCheckpoint.parse(prior.payload);
        if (existing.checkpointHash !== checkpoint.checkpointHash)
          throw new PoaError(
            'OPERATION_CONFLICT',
            'Checkpoint identity has different content',
          );
        return { checkpoint: existing, evaluation };
      }
      const current = first(
        (
          await client.query<any>(
            'SELECT portfolio FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2 FOR UPDATE',
            [checkpoint.experimentId, checkpoint.scenarioId],
          )
        ).rows,
        'DATA_UNAVAILABLE',
        'Scenario not found',
      );
      const accruedCount = BigInt(checkpoint.agent.accruedReceiptHashes.length);
      if (
        BigInt((current.portfolio as ShadowPortfolioData).version) +
          accruedCount !==
        BigInt(checkpoint.agent.portfolio.version)
      )
        throw new PoaError(
          'STALE_PORTFOLIO',
          'Checkpoint agent portfolio version is stale',
        );
      await client.query(
        'UPDATE capital_scenarios SET portfolio=$3::jsonb,portfolio_version=$4 WHERE experiment_id=$1 AND scenario_id=$2',
        [
          checkpoint.experimentId,
          checkpoint.scenarioId,
          json(checkpoint.agent.portfolio),
          checkpoint.agent.portfolio.version,
        ],
      );
      for (const reference of [
        checkpoint.cashReference,
        checkpoint.conservativeYieldReference,
      ]) {
        const currentReference = first(
          (
            await client.query<{
              portfolio: ShadowPortfolioData;
              status: string;
              comparison_available: boolean;
            }>(
              'SELECT portfolio,status,comparison_available FROM reference_portfolios WHERE reference_id=$1 FOR UPDATE',
              [reference.portfolioId],
            )
          ).rows,
          'DATA_UNAVAILABLE',
          'Reference not found',
        );
        if (
          BigInt(currentReference.portfolio.version) +
            BigInt(reference.accruedReceiptHashes.length) !==
            BigInt(reference.portfolio.version) ||
          currentReference.status !== reference.referenceStatus ||
          currentReference.comparison_available !==
            reference.comparisonAvailable
        )
          throw new PoaError(
            'STALE_PORTFOLIO',
            'Checkpoint reference portfolio is stale',
          );
        await client.query(
          "UPDATE reference_portfolios SET portfolio=$2::jsonb,portfolio_version=$3,payload=jsonb_set(payload,'{portfolio}',$2::jsonb) WHERE reference_id=$1",
          [
            reference.portfolioId,
            json(reference.portfolio),
            reference.portfolio.version,
          ],
        );
      }
      await client.query(
        'INSERT INTO valuation_checkpoints(checkpoint_id,experiment_id,scenario_id,sequence,checkpoint_at,checkpoint_hash,payload,replay_bundle) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
        [
          checkpoint.checkpointId,
          checkpoint.experimentId,
          checkpoint.scenarioId,
          checkpoint.sequence,
          checkpoint.checkpointAt,
          checkpoint.checkpointHash,
          json(checkpoint),
          json(replay),
        ],
      );
      await client.query(
        'INSERT INTO scenario_evaluations(evaluation_id,checkpoint_id,experiment_id,scenario_id,evaluation_hash,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
        [
          evaluation.evaluationId,
          checkpoint.checkpointId,
          checkpoint.experimentId,
          checkpoint.scenarioId,
          evaluation.evaluationHash,
          json(evaluation),
        ],
      );
      await this.appendEvent(
        client,
        checkpoint.experimentId,
        'VALUATION_CHECKPOINT',
        checkpoint.checkpointAt,
        {
          checkpointHash: checkpoint.checkpointHash,
          evaluationHash: evaluation.evaluationHash,
        },
        checkpoint.resultProvenance,
      );
      return { checkpoint, evaluation, replay };
    });
  }

  async getValuations(experimentId: string) {
    const rows = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM valuation_checkpoints WHERE experiment_id=$1 ORDER BY checkpoint_at,scenario_id',
      [experimentId],
    );
    return rows.rows.map((row) => ScenarioCheckpoint.parse(row.payload));
  }

  async getEvaluations(experimentId: string) {
    const rows = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM scenario_evaluations WHERE experiment_id=$1 ORDER BY created_at,scenario_id',
      [experimentId],
    );
    return rows.rows.map((row) => ScenarioEvaluation.parse(row.payload));
  }

  async getReplayBundle(checkpointId: string): Promise<M4ReplayBundleData> {
    const row = first(
      (
        await this.pool.query<{ replay_bundle: unknown }>(
          'SELECT replay_bundle FROM valuation_checkpoints WHERE checkpoint_id=$1',
          [checkpointId],
        )
      ).rows,
      'DATA_UNAVAILABLE',
      'Checkpoint not found',
    );
    return M4ReplayBundle.parse(row.replay_bundle);
  }

  async getReferenceEntryBundle(referenceId: string) {
    const row = first(
      (
        await this.pool.query<{ entry_replay_bundle: unknown }>(
          'SELECT entry_replay_bundle FROM reference_portfolios WHERE reference_id=$1',
          [referenceId],
        )
      ).rows,
      'DATA_UNAVAILABLE',
      'Reference not found',
    );
    if (!row.entry_replay_bundle)
      throw new PoaError(
        'DATA_UNAVAILABLE',
        'Reference entry has no replay bundle',
      );
    return row.entry_replay_bundle;
  }
}

export { SYNTHETIC_PROFILE_ID };
