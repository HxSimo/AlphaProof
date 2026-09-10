import type { Pool, PoolClient } from 'pg';
import { contentHash, PoaError, type Hex } from '@poa/domain';
import {
  AuditEvent,
  CommitmentBatch,
  DashboardResponse,
  EvaluationReceipt,
  MerkleProof,
  RegistryPublicationReceipt,
  ReproducibleExport,
  ScenarioCheckpoint,
  ScenarioEvaluation,
  type AuditEventData,
  type DashboardResponseData,
  type EvaluationReceiptData,
  type RegistryPublicationReceiptData,
  type ReproducibleExportData,
} from '@poa/schemas';
import {
  auditEventHash,
  buildBatch,
  createAuditEvent,
  verifyExport,
  verifyProof,
  verifyPublication,
} from '@poa/commitments';

const json = (value: unknown) => JSON.stringify(value);
const iso = (value: Date | string) =>
  new Date(value).toISOString().replace(/\.\d{3}Z$/, '.000Z');

export class M6Repository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>) {
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

  private async appendAuditObjectWith(
    client: PoolClient,
    input: {
      experimentId: string;
      objectType: AuditEventData['objectType'];
      occurredAt: string;
      resultProvenance: AuditEventData['resultProvenance'];
      objectSchemaVersion: string;
      objectContentHash: Hex;
      supersedesContentHash?: Hex | null;
    },
  ) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `audit:${input.experimentId}`,
    ]);
    const duplicate = (
      await client.query<{ payload: unknown }>(
        'SELECT payload FROM audit_events WHERE experiment_id=$1 AND object_type=$2 AND object_content_hash=$3',
        [input.experimentId, input.objectType, input.objectContentHash],
      )
    ).rows[0];
    if (duplicate) return AuditEvent.parse(duplicate.payload);
    const prior = (
      await client.query<{ payload: unknown }>(
        'SELECT payload FROM audit_events WHERE experiment_id=$1 ORDER BY sequence DESC LIMIT 1',
        [input.experimentId],
      )
    ).rows[0];
    const previous = prior ? AuditEvent.parse(prior.payload) : null;
    const event = createAuditEvent({
      experimentId: input.experimentId,
      sequence: (BigInt(previous?.sequence ?? '0') + 1n).toString(),
      objectType: input.objectType,
      occurredAt: input.occurredAt,
      resultProvenance: input.resultProvenance,
      objectSchemaVersion: input.objectSchemaVersion,
      contentHash: input.objectContentHash,
      previousEvent: previous,
      ...(input.supersedesContentHash !== undefined
        ? { supersedesContentHash: input.supersedesContentHash }
        : {}),
    });
    await client.query(
      'INSERT INTO audit_events(experiment_id,sequence,event_hash,object_type,object_content_hash,previous_event_hash,supersedes_content_hash,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
      [
        event.experimentId,
        event.sequence,
        auditEventHash(event),
        event.objectType,
        event.contentHash,
        event.previousEventHash,
        event.supersedesContentHash,
        json(event),
      ],
    );
    return event;
  }

  appendAuditObject(
    input: Parameters<M6Repository['appendAuditObjectWith']>[1],
  ) {
    return this.transaction((client) =>
      this.appendAuditObjectWith(client, input),
    );
  }

  async saveEligibility(receiptInput: EvaluationReceiptData) {
    const receipt = EvaluationReceipt.parse(receiptInput);
    const hash = contentHash(receipt);
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `eligibility:${hash}`,
      ]);
      const duplicate = (
        await client.query<{ payload: unknown }>(
          'SELECT payload FROM eligibility_evaluations WHERE evaluation_hash=$1',
          [hash],
        )
      ).rows[0];
      if (duplicate) return EvaluationReceipt.parse(duplicate.payload);
      if (receipt.supersedesHash) {
        const prior = (
          await client.query<{ experiment_id: string; scenario_id: string }>(
            'SELECT experiment_id,scenario_id FROM eligibility_evaluations WHERE evaluation_hash=$1',
            [receipt.supersedesHash],
          )
        ).rows[0];
        if (
          !prior ||
          prior.experiment_id !== receipt.experimentId ||
          prior.scenario_id !== receipt.scenarioId
        )
          throw new PoaError(
            'PROVENANCE_SPLICE',
            'Correction does not supersede a report in this scenario',
          );
      }
      await client.query(
        'INSERT INTO eligibility_evaluations(evaluation_hash,experiment_id,scenario_id,checkpoint_hash,supersedes_hash,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [
          hash,
          receipt.experimentId,
          receipt.scenarioId,
          receipt.checkpointHash,
          receipt.supersedesHash,
          json(receipt),
        ],
      );
      const occurredAt = iso(
        (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
          .rows[0]!.now,
      );
      await this.appendAuditObjectWith(client, {
        experimentId: receipt.experimentId,
        objectType: 'EVALUATION',
        occurredAt,
        resultProvenance: receipt.resultProvenance,
        objectSchemaVersion: receipt.schemaVersion,
        objectContentHash: hash,
        supersedesContentHash: receipt.supersedesHash as Hex | null,
      });
      return receipt;
    });
  }

  async getEligibility(experimentId: string) {
    const rows = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM eligibility_evaluations WHERE experiment_id=$1 ORDER BY created_at,evaluation_hash',
      [experimentId],
    );
    return rows.rows.map((row) => EvaluationReceipt.parse(row.payload));
  }

  async auditEvents(experimentId: string) {
    const rows = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM audit_events WHERE experiment_id=$1 ORDER BY sequence',
      [experimentId],
    );
    return rows.rows.map((row) => AuditEvent.parse(row.payload));
  }

  async createBatch(
    experimentId: string,
    batchId: string,
    lastSequence: string,
  ) {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `batch:${experimentId}`,
      ]);
      const duplicate = (
        await client.query<{ payload: unknown; batch_hash: string }>(
          'SELECT payload,batch_hash FROM commitment_batches WHERE batch_id=$1',
          [batchId],
        )
      ).rows[0];
      if (duplicate) {
        const batch = CommitmentBatch.parse(duplicate.payload);
        const rows = await client.query<{ payload: unknown }>(
          'SELECT payload FROM audit_events WHERE experiment_id=$1 AND sequence BETWEEN $2 AND $3 ORDER BY sequence',
          [experimentId, batch.firstSequence, batch.lastSequence],
        );
        const rebuilt = buildBatch({
          experimentId,
          batchId,
          events: rows.rows.map((row) => AuditEvent.parse(row.payload)),
          previousBatchHash: batch.previousBatchHash as Hex | null,
        });
        if (rebuilt.batchHash !== duplicate.batch_hash)
          throw new PoaError(
            'OPERATION_CONFLICT',
            'Batch ID has different audit contents',
          );
        return rebuilt;
      }
      const prior = (
        await client.query<{ last_sequence: string; batch_hash: string }>(
          'SELECT last_sequence::text,batch_hash FROM commitment_batches WHERE experiment_id=$1 ORDER BY last_sequence DESC LIMIT 1',
          [experimentId],
        )
      ).rows[0];
      const firstSequence = (
        BigInt(prior?.last_sequence ?? '0') + 1n
      ).toString();
      if (BigInt(lastSequence) < BigInt(firstSequence))
        throw new PoaError(
          'BATCH_CONTINUITY',
          'Batch range overlaps a prior batch',
        );
      const rows = await client.query<{ payload: unknown }>(
        'SELECT payload FROM audit_events WHERE experiment_id=$1 AND sequence BETWEEN $2 AND $3 ORDER BY sequence',
        [experimentId, firstSequence, lastSequence],
      );
      const expected = BigInt(lastSequence) - BigInt(firstSequence) + 1n;
      if (BigInt(rows.rowCount ?? 0) !== expected)
        throw new PoaError(
          'BATCH_CONTINUITY',
          'Audit batch has a sequence gap',
        );
      const built = buildBatch({
        experimentId,
        batchId,
        events: rows.rows.map((row) => AuditEvent.parse(row.payload)),
        previousBatchHash: (prior?.batch_hash as Hex | undefined) ?? null,
      });
      await client.query(
        'INSERT INTO commitment_batches(batch_id,experiment_id,first_sequence,last_sequence,batch_hash,previous_batch_hash,root,leaves_object_hash,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
        [
          batchId,
          experimentId,
          built.batch.firstSequence,
          built.batch.lastSequence,
          built.batchHash,
          built.batch.previousBatchHash,
          built.batch.root,
          built.batch.leavesObjectHash,
          json(built.batch),
        ],
      );
      for (const proof of built.proofs)
        await client.query(
          'INSERT INTO commitment_proofs(batch_id,leaf_hash,leaf_index,payload) VALUES($1,$2,$3,$4::jsonb)',
          [batchId, proof.leafHash, proof.leafIndex, json(proof)],
        );
      return built;
    });
  }

  async recordPublication(receiptInput: RegistryPublicationReceiptData) {
    const receipt = RegistryPublicationReceipt.parse(receiptInput);
    const row = (
      await this.pool.query<{ payload: unknown }>(
        'SELECT payload FROM commitment_batches WHERE batch_id=$1',
        [receipt.batchId],
      )
    ).rows[0];
    if (!row)
      throw new PoaError('EXPORT_INCOMPLETE', 'Publication batch is absent');
    verifyPublication(CommitmentBatch.parse(row.payload), receipt);
    const prior = (
      await this.pool.query<{ payload: unknown }>(
        "SELECT payload FROM registry_publication_receipts WHERE batch_id=$1 AND status='CONFIRMED'",
        [receipt.batchId],
      )
    ).rows[0];
    if (prior) {
      const existing = RegistryPublicationReceipt.parse(prior.payload);
      if (contentHash(existing) !== contentHash(receipt))
        throw new PoaError(
          'OPERATION_CONFLICT',
          'Batch already has a different confirmed publication',
        );
      return existing;
    }
    await this.pool.query(
      'INSERT INTO registry_publication_receipts(transaction_hash,batch_id,status,block_hash,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(transaction_hash) DO NOTHING',
      [
        receipt.transactionHash,
        receipt.batchId,
        receipt.status,
        receipt.block.hash,
        json(receipt),
      ],
    );
    return receipt;
  }

  async getBatches(experimentId: string) {
    const rows = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM commitment_batches WHERE experiment_id=$1 ORDER BY first_sequence',
      [experimentId],
    );
    return rows.rows.map((row) => CommitmentBatch.parse(row.payload));
  }

  async getProof(batchId: string, leafHash: string) {
    const row = (
      await this.pool.query<{ payload: unknown }>(
        'SELECT payload FROM commitment_proofs WHERE batch_id=$1 AND leaf_hash=$2',
        [batchId, leafHash],
      )
    ).rows[0];
    if (!row) throw new PoaError('EXPORT_INCOMPLETE', 'Merkle proof is absent');
    const proof = MerkleProof.parse(row.payload);
    verifyProof(proof);
    return proof;
  }

  async saveExport(input: ReproducibleExportData) {
    const bundle = ReproducibleExport.parse(input);
    verifyExport(bundle);
    const hash = contentHash(bundle);
    await this.pool.query(
      'INSERT INTO reproducible_exports(export_id,experiment_id,export_hash,selected_object_hash,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(export_id) DO NOTHING',
      [
        bundle.exportId,
        bundle.experimentId,
        hash,
        bundle.selectedResult.objectContentHash,
        json(bundle),
      ],
    );
    const stored = await this.getExport(bundle.exportId);
    if (contentHash(stored) !== hash)
      throw new PoaError(
        'OPERATION_CONFLICT',
        'Export ID has different content',
      );
    return stored;
  }

  async getExport(exportId: string) {
    const row = (
      await this.pool.query<{ payload: unknown }>(
        'SELECT payload FROM reproducible_exports WHERE export_id=$1',
        [exportId],
      )
    ).rows[0];
    if (!row) throw new PoaError('EXPORT_INCOMPLETE', 'Export is absent');
    return ReproducibleExport.parse(row.payload);
  }

  async dashboard(experimentId: string): Promise<DashboardResponseData> {
    const policyRow = (
      await this.pool.query<{ policy: any; policy_hash: string }>(
        'SELECT policy,policy_hash FROM experiments WHERE experiment_id=$1',
        [experimentId],
      )
    ).rows[0];
    if (!policyRow?.policy)
      throw new PoaError('EXPERIMENT_NOT_STARTED', 'Experiment is not started');
    const scenarios = await this.pool.query<{
      scenario_id: string;
      initial_amount_usdc_minor: string;
      checkpoint: unknown;
      evaluation: unknown;
      eligibility: unknown;
    }>(
      `SELECT s.scenario_id,s.initial_amount_usdc_minor::text,
        c.payload checkpoint,e.payload evaluation,ee.payload eligibility
       FROM capital_scenarios s
       JOIN LATERAL (SELECT * FROM valuation_checkpoints vc WHERE vc.experiment_id=s.experiment_id AND vc.scenario_id=s.scenario_id ORDER BY sequence DESC LIMIT 1) c ON true
       JOIN scenario_evaluations e ON e.checkpoint_id=c.checkpoint_id
       JOIN LATERAL (SELECT * FROM eligibility_evaluations x WHERE x.experiment_id=s.experiment_id AND x.scenario_id=s.scenario_id ORDER BY created_at DESC,evaluation_hash DESC LIMIT 1) ee ON true
       WHERE s.experiment_id=$1 ORDER BY s.initial_amount_usdc_minor`,
      [experimentId],
    );
    const commitment = (
      await this.pool.query<{
        batch: unknown;
        proof: unknown;
        receipt: unknown;
      }>(
        `SELECT b.payload batch,p.payload proof,r.payload receipt
         FROM commitment_batches b
         JOIN commitment_proofs p USING(batch_id)
         JOIN registry_publication_receipts r USING(batch_id)
         WHERE b.experiment_id=$1 AND r.status='CONFIRMED'
         ORDER BY b.last_sequence DESC,p.leaf_index DESC LIMIT 1`,
        [experimentId],
      )
    ).rows[0];
    if (!commitment)
      throw new PoaError('EXPORT_INCOMPLETE', 'Dashboard commitment is absent');
    const pendingBatch = CommitmentBatch.parse(commitment.batch);
    const receipt = RegistryPublicationReceipt.parse(commitment.receipt);
    const batch = CommitmentBatch.parse({
      ...pendingBatch,
      status: 'CONFIRMED',
      transactionHash: receipt.transactionHash,
      block: receipt.block,
    });
    const proof = MerkleProof.parse(commitment.proof);
    verifyProof(proof);
    verifyPublication(pendingBatch, receipt);
    return DashboardResponse.parse({
      schemaVersion: 'proof-of-alpha/dashboard/v1',
      experimentId,
      policyHash: policyRow.policy_hash,
      networkProfile: policyRow.policy.networkProfile,
      resultProvenance: policyRow.policy.resultProvenance,
      capitalScenarioRelationship: 'CORRELATED_POLICY_VIEWS',
      effectiveIndependentSampleCount: '1',
      scenarios: scenarios.rows.map((row) => ({
        scenarioId: row.scenario_id,
        initialAmountUsdcMinor: row.initial_amount_usdc_minor,
        checkpoint: ScenarioCheckpoint.parse(row.checkpoint),
        descriptiveEvaluation: ScenarioEvaluation.parse(row.evaluation),
        eligibility: EvaluationReceipt.parse(row.eligibility),
      })),
      incidents: [],
      commitment: {
        batch,
        proof,
        registryReceipt: receipt,
        verified: true,
        timingClaim: 'POST_EXECUTION_INTEGRITY_ONLY',
      },
      limitations: [
        'Three capital sizes are correlated views of one policy and one independent statistical sample.',
        'Periodic Arc anchoring proves integrity after publication, not public receipt before execution.',
        'Automatic funding is disabled.',
      ],
      automaticFundingEnabled: false,
    });
  }
}
