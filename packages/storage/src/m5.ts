import type { Pool, PoolClient } from 'pg';
import { applyReceipt } from '@poa/accounting';
import { contentHash, PoaError } from '@poa/domain';
import {
  CctpTransfer,
  TransferLifecycleEvent,
  type AccountingCostData,
  type CctpTransferData,
  type TransferLifecycleEventData,
} from '@poa/schemas';
import {
  accountingReceiptForTransferEvent,
  applyTransferEvent,
} from '@poa/transfers';

const json = (value: unknown) => JSON.stringify(value);

export class TransferRepository {
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

  async create(transferInput: CctpTransferData) {
    const transfer = CctpTransfer.parse(transferInput);
    await this.pool.query(
      'INSERT INTO cctp_transfers(transfer_id,experiment_id,scenario_id,route_id,lifecycle_state,evidence_mode,message_identity,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)',
      [
        transfer.transferId,
        transfer.experimentId,
        transfer.scenarioId,
        transfer.routeId,
        transfer.state,
        transfer.evidenceMode,
        transfer.messageIdentity,
        json(transfer),
        transfer.createdAt,
        transfer.updatedAt,
      ],
    );
    await this.pool.query(
      "INSERT INTO cctp_transfer_jobs(transfer_id,state) VALUES($1,'READY')",
      [transfer.transferId],
    );
    return transfer;
  }

  async load(transferId: string) {
    const row = (
      await this.pool.query<{ payload: unknown }>(
        'SELECT payload FROM cctp_transfers WHERE transfer_id=$1',
        [transferId],
      )
    ).rows[0];
    if (!row) throw new PoaError('DATA_UNAVAILABLE', 'CCTP transfer not found');
    return CctpTransfer.parse(row.payload);
  }

  async appendEvent(
    transferId: string,
    eventInput: TransferLifecycleEventData,
    costs: AccountingCostData[] = [],
  ) {
    const event = TransferLifecycleEvent.parse(eventInput);
    return this.transaction(async (client) => {
      const row = (
        await client.query<{ payload: unknown }>(
          'SELECT payload FROM cctp_transfers WHERE transfer_id=$1 FOR UPDATE',
          [transferId],
        )
      ).rows[0];
      if (!row)
        throw new PoaError('DATA_UNAVAILABLE', 'CCTP transfer not found');
      const before = CctpTransfer.parse(row.payload);
      const prior = (
        await client.query<{ event_hash: string }>(
          'SELECT event_hash FROM cctp_transfer_events WHERE event_id=$1',
          [event.eventId],
        )
      ).rows[0];
      if (prior) {
        if (prior.event_hash !== contentHash(event))
          throw new PoaError(
            'OPERATION_CONFLICT',
            'Transfer event ID has different content',
          );
        return before;
      }
      const after = applyTransferEvent(before, event);
      const scenario = (
        await client.query<{ portfolio: any }>(
          'SELECT portfolio FROM capital_scenarios WHERE experiment_id=$1 AND scenario_id=$2 FOR UPDATE',
          [before.experimentId, before.scenarioId],
        )
      ).rows[0];
      if (!scenario)
        throw new PoaError('DATA_UNAVAILABLE', 'Transfer scenario not found');
      const receipt = accountingReceiptForTransferEvent({
        before,
        after,
        event,
        expectedPortfolioVersion: scenario.portfolio.version as string,
        costs,
      });
      let portfolio = scenario.portfolio;
      if (receipt) {
        portfolio = applyReceipt(portfolio, receipt);
        await client.query(
          'INSERT INTO cctp_transfer_accounting_receipts(transfer_id,operation_id,receipt_hash,payload,applied_portfolio_version) VALUES($1,$2,$3,$4::jsonb,$5)',
          [
            transferId,
            receipt.operationId,
            contentHash(receipt),
            json(receipt),
            portfolio.version,
          ],
        );
        await client.query(
          'UPDATE capital_scenarios SET portfolio=$3::jsonb,portfolio_version=$4 WHERE experiment_id=$1 AND scenario_id=$2',
          [
            before.experimentId,
            before.scenarioId,
            json(portfolio),
            portfolio.version,
          ],
        );
      }
      await client.query(
        'INSERT INTO cctp_transfer_events(transfer_id,sequence,event_id,event_hash,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
        [
          transferId,
          event.sequence,
          event.eventId,
          contentHash(event),
          json(event),
        ],
      );
      await client.query(
        'UPDATE cctp_transfers SET lifecycle_state=$2,message_identity=$3,payload=$4::jsonb,updated_at=$5 WHERE transfer_id=$1',
        [
          transferId,
          after.state,
          after.messageIdentity,
          json(after),
          after.updatedAt,
        ],
      );
      await client.query(
        "UPDATE cctp_transfer_jobs SET state=CASE WHEN $2 IN ('SETTLED','SOURCE_FAILED','INVALIDATED') THEN 'COMPLETED' ELSE 'READY' END,available_at=clock_timestamp(),leased_until=NULL,updated_at=clock_timestamp() WHERE transfer_id=$1",
        [transferId, after.state],
      );
      return after;
    });
  }

  async claim(workerId: string, leaseSeconds = 30) {
    return this.transaction(async (client) => {
      const row = (
        await client.query<{ transfer_id: string; attempt: number }>(
          "SELECT transfer_id,attempt FROM cctp_transfer_jobs WHERE (state IN ('READY','RETRY') AND available_at<=clock_timestamp()) OR (state='RUNNING' AND leased_until<clock_timestamp()) ORDER BY available_at,transfer_id FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!row) return null;
      await client.query(
        "UPDATE cctp_transfer_jobs SET state='RUNNING',attempt=attempt+1,worker_id=$2,leased_until=clock_timestamp()+($3*interval '1 second'),updated_at=clock_timestamp() WHERE transfer_id=$1",
        [row.transfer_id, workerId, leaseSeconds],
      );
      return { transferId: row.transfer_id, attempt: row.attempt + 1 };
    });
  }

  async retry(transferId: string, code: string, delaySeconds = 0) {
    await this.pool.query(
      "UPDATE cctp_transfer_jobs SET state='RETRY',last_error_code=$2,available_at=clock_timestamp()+($3*interval '1 second'),leased_until=NULL,updated_at=clock_timestamp() WHERE transfer_id=$1",
      [transferId, code, delaySeconds],
    );
  }

  async wakeWaiting(transferId: string) {
    await this.pool.query(
      "UPDATE cctp_transfer_jobs SET state='READY',available_at=clock_timestamp(),updated_at=clock_timestamp() WHERE transfer_id=$1 AND state='WAITING'",
      [transferId],
    );
  }

  async events(transferId: string) {
    return (
      await this.pool.query<{ payload: unknown }>(
        'SELECT payload FROM cctp_transfer_events WHERE transfer_id=$1 ORDER BY sequence',
        [transferId],
      )
    ).rows.map((row) => TransferLifecycleEvent.parse(row.payload));
  }
}
