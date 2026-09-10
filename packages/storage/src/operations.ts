import type { Pool, PoolClient } from 'pg';
import { contentHash, PoaError } from '@poa/domain';
import { loadOperationsPolicy } from '@poa/config';
import {
  DemoSession,
  IncidentInput,
  IncidentRecord,
  OperationsSnapshot,
  type IncidentInputData,
  type OperationsPolicyData,
} from '@poa/schemas';
import { M6Repository } from './m6.js';

export class OperationsRepository {
  constructor(
    readonly pool: Pool,
    readonly policy: OperationsPolicyData = loadOperationsPolicy(),
  ) {}

  async recordIncident(input: IncidentInputData, transaction?: PoolClient) {
    const parsed = IncidentInput.parse(input);
    const client = transaction ?? (await this.pool.connect());
    try {
      if (!transaction) await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'incident:' + parsed.incidentId,
      ]);
      const prior = (
        await client.query(
          'SELECT input_hash,payload FROM operation_incidents WHERE incident_id=$1',
          [parsed.incidentId],
        )
      ).rows[0];
      if (prior) {
        if (prior.input_hash !== contentHash(parsed))
          throw new PoaError(
            'IDEMPOTENCY_CONFLICT',
            'Incident identity contains different evidence',
          );
        if (!transaction) await client.query('COMMIT');
        return IncidentRecord.parse(prior.payload);
      }
      const exp = (
        await client.query(
          'SELECT policy FROM experiments WHERE experiment_id=$1',
          [parsed.experimentId],
        )
      ).rows[0];
      if (!exp?.policy)
        throw new PoaError(
          'EXPERIMENT_NOT_STARTED',
          'Incident requires a frozen experiment',
        );
      if (
        parsed.scenarioId &&
        !(
          await client.query(
            'SELECT 1 FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2',
            [parsed.experimentId, parsed.scenarioId],
          )
        ).rowCount
      )
        throw new PoaError(
          'PROVENANCE_SPLICE',
          'Incident scenario is outside experiment',
        );
      if (parsed.resolvesIncidentId) {
        const resolved = (
          await client.query(
            'SELECT experiment_id FROM operation_incidents WHERE incident_id=$1',
            [parsed.resolvesIncidentId],
          )
        ).rows[0];
        if (resolved?.experiment_id !== parsed.experimentId)
          throw new PoaError(
            'PROVENANCE_SPLICE',
            'Recovery must reference an incident in the same experiment',
          );
      }
      const now = (
        await client.query('SELECT clock_timestamp() AS now')
      ).rows[0].now.toISOString();
      const incident = IncidentRecord.parse({
        ...parsed,
        schemaVersion: 'proof-of-alpha/incident/v1',
        occurredAt: now,
        resultProvenance: exp.policy.resultProvenance,
      });
      const hash = contentHash(incident);
      await client.query(
        'INSERT INTO operation_incidents(incident_id,experiment_id,scenario_id,resolves_incident_id,input_hash,content_hash,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
        [
          incident.incidentId,
          incident.experimentId,
          incident.scenarioId,
          incident.resolvesIncidentId,
          contentHash(parsed),
          hash,
          JSON.stringify(incident),
          now,
        ],
      );
      await new M6Repository(this.pool).appendAuditObjectWith(client, {
        experimentId: incident.experimentId,
        objectType: 'INCIDENT',
        occurredAt: now,
        resultProvenance: incident.resultProvenance,
        objectSchemaVersion: incident.schemaVersion,
        objectContentHash: hash,
      });
      if (!transaction) await client.query('COMMIT');
      return incident;
    } catch (error) {
      if (!transaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transaction) client.release();
    }
  }

  async incidents(experimentId: string) {
    return (
      await this.pool.query(
        'SELECT payload FROM operation_incidents WHERE experiment_id=$1 ORDER BY occurred_at,incident_id',
        [experimentId],
      )
    ).rows.map((row) => IncidentRecord.parse(row.payload));
  }

  async saveDemoSession(input: unknown) {
    const session = DemoSession.parse(input);
    await this.pool.query(
      'INSERT INTO demo_session_exports(session_hash,experiment_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(session_hash) DO NOTHING',
      [
        contentHash(session),
        session.policy.experimentId,
        JSON.stringify(session),
      ],
    );
    return contentHash(session);
  }

  async demoSession(experimentId: string) {
    const row = (
      await this.pool.query(
        'SELECT payload FROM demo_session_exports WHERE experiment_id=$1 ORDER BY created_at DESC,session_hash DESC LIMIT 1',
        [experimentId],
      )
    ).rows[0];
    if (!row)
      throw new PoaError(
        'EXPORT_INCOMPLETE',
        'Canonical demo export is unavailable',
      );
    return DemoSession.parse(row.payload);
  }

  async heartbeat(workerId: string, status: string) {
    await this.pool.query(
      'INSERT INTO worker_heartbeats(worker_id,last_status) VALUES($1,$2) ON CONFLICT(worker_id) DO UPDATE SET last_seen_at=clock_timestamp(),last_status=$2',
      [workerId, status],
    );
  }

  async stopExperiment(experimentId: string, reason: string) {
    if (!reason.trim() || reason.length > 1000)
      throw new PoaError('INVALID_SCHEMA', 'A bounded stop reason is required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const exp = (
        await client.query(
          'SELECT state FROM experiments WHERE experiment_id=$1 FOR UPDATE',
          [experimentId],
        )
      ).rows[0];
      if (!exp)
        throw new PoaError('EXPERIMENT_NOT_FOUND', 'Experiment not found');
      const prior = (
        await client.query(
          'SELECT * FROM experiment_stops WHERE experiment_id=$1',
          [experimentId],
        )
      ).rows[0];
      if (prior) {
        if (prior.reason !== reason)
          throw new PoaError(
            'IDEMPOTENCY_CONFLICT',
            'Stop already recorded with another reason',
          );
        await client.query('COMMIT');
        return prior;
      }
      if (exp.state !== 'STARTED')
        throw new PoaError(
          'EXPERIMENT_NOT_STARTED',
          'Experiment is not active',
        );
      const scenarios = (
        await client.query(
          'SELECT scenario_id,portfolio,active_action_id FROM capital_scenarios WHERE experiment_id=$1 ORDER BY scenario_id FOR UPDATE',
          [experimentId],
        )
      ).rows;
      if (scenarios.some((row) => row.active_action_id))
        throw new PoaError(
          'SCENARIO_BUSY',
          'Reconcile active action before stopping; no forced financial rollback',
        );
      const hashes = scenarios.map((row) => ({
        scenarioId: row.scenario_id,
        portfolioHash: contentHash(row.portfolio),
      }));
      const stopped = (
        await client.query(
          'INSERT INTO experiment_stops(experiment_id,reason,stopped_at,portfolio_hashes) VALUES($1,$2,clock_timestamp(),$3::jsonb) RETURNING *',
          [experimentId, reason, JSON.stringify(hashes)],
        )
      ).rows[0];
      await client.query(
        "UPDATE experiments SET state='CLOSED' WHERE experiment_id=$1",
        [experimentId],
      );
      await this.recordIncident(
        {
          incidentId: experimentId + '-stopped',
          experimentId,
          scenarioId: null,
          code: 'STOPPED_EARLY',
          severity: 'WARNING',
          message: reason,
          evidenceHashes: hashes.map((row) => row.portfolioHash),
          resolvesIncidentId: null,
        },
        client,
      );
      await client.query('COMMIT');
      return stopped;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeRequest(clientHash: string) {
    const row = (
      await this.pool.query(
        "INSERT INTO request_windows(client_hash,window_start,request_count) VALUES($1,clock_timestamp(),1) ON CONFLICT(client_hash) DO UPDATE SET request_count=CASE WHEN request_windows.window_start <= clock_timestamp()-($2 * interval '1 second') THEN 1 ELSE request_windows.request_count+1 END, rejected_count=request_windows.rejected_count + CASE WHEN request_windows.window_start > clock_timestamp()-($2 * interval '1 second') AND request_windows.request_count >= $3 THEN 1 ELSE 0 END, window_start=CASE WHEN request_windows.window_start <= clock_timestamp()-($2 * interval '1 second') THEN clock_timestamp() ELSE request_windows.window_start END RETURNING request_count::text",
        [
          clientHash,
          this.policy.requestWindowSeconds,
          this.policy.requestsPerWindowPerClient,
        ],
      )
    ).rows[0];
    return (
      BigInt(row.request_count) <=
      BigInt(this.policy.requestsPerWindowPerClient)
    );
  }

  async snapshot() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const observedAt = (
        await client.query('SELECT now() AS now')
      ).rows[0].now.toISOString();
      const jobs = (
        await client.query(
          'SELECT state,count(*)::text AS count,max(attempt)::text AS max_attempt FROM jobs GROUP BY state ORDER BY state',
        )
      ).rows;
      const age = (
        await client.query(
          "SELECT CASE WHEN min(available_at) IS NULL THEN NULL ELSE floor(greatest(0,extract(epoch FROM (now()-min(available_at)))))::text END AS age FROM jobs WHERE state IN ('READY','RETRY','RUNNING')",
        )
      ).rows[0].age;
      const workers = (
        await client.query(
          "SELECT worker_id,last_seen_at,last_status,last_seen_at < now()-($1 * interval '1 second') AS stale FROM worker_heartbeats ORDER BY worker_id",
          [this.policy.workerStaleSeconds],
        )
      ).rows;
      const incidents = (
        await client.query(
          'SELECT count(*)::text AS n FROM operation_incidents i WHERE i.resolves_incident_id IS NULL AND NOT EXISTS(SELECT 1 FROM operation_incidents r WHERE r.resolves_incident_id=i.incident_id)',
        )
      ).rows[0].n;
      const rejected = (
        await client.query(
          'SELECT coalesce(sum(rejected_count),0)::text AS n FROM request_windows',
        )
      ).rows[0].n;
      const alerts = [
        ...(!workers.some((w) => !w.stale) ? ['WORKER_STALE'] : []),
        ...(age !== null && BigInt(age) > BigInt(this.policy.queueAlertSeconds)
          ? ['QUEUE_LAG']
          : []),
        ...(jobs.some((j) => j.state === 'FAILED') ? ['FAILED_JOBS'] : []),
        ...(BigInt(incidents) > 0n ? ['OPEN_INCIDENTS'] : []),
      ];
      await client.query('COMMIT');
      return OperationsSnapshot.parse({
        schemaVersion: 'proof-of-alpha/operations-snapshot/v1',
        observedAt,
        policyHash: contentHash(this.policy),
        status: alerts.length ? 'DEGRADED' : 'HEALTHY',
        alerts,
        jobs: jobs.map((j) => ({
          state: j.state,
          count: j.count,
          maxAttempt: j.max_attempt,
        })),
        oldestRunnableAgeSeconds: age,
        workers: workers.map((w) => ({
          workerId: w.worker_id,
          lastSeenAt: w.last_seen_at.toISOString(),
          lastStatus: w.last_status,
          stale: w.stale,
        })),
        openIncidentCount: incidents,
        rejectedRequestCount: rejected,
        automaticFundingEnabled: false,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
