CREATE TABLE cctp_transfers (
  transfer_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text NOT NULL,
  route_id text NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('RESERVED','SOURCE_FAILED','ATTESTATION_PENDING','READY_TO_RECEIVE','DESTINATION_RETRY','SETTLED','INVALIDATED')),
  evidence_mode text NOT NULL CHECK (evidence_mode IN ('SYNTHETIC','LIVE_TESTNET')),
  message_identity text UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id)
);

CREATE TABLE cctp_transfer_events (
  transfer_id text NOT NULL REFERENCES cctp_transfers(transfer_id),
  sequence numeric(78,0) NOT NULL,
  event_id text NOT NULL UNIQUE,
  event_hash text NOT NULL,
  payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(transfer_id, sequence)
);

CREATE TABLE cctp_transfer_accounting_receipts (
  transfer_id text NOT NULL REFERENCES cctp_transfers(transfer_id),
  operation_id text NOT NULL,
  receipt_hash text NOT NULL,
  payload jsonb NOT NULL,
  applied_portfolio_version numeric(78,0) NOT NULL,
  PRIMARY KEY(transfer_id, operation_id)
);

CREATE TABLE cctp_transfer_jobs (
  transfer_id text PRIMARY KEY REFERENCES cctp_transfers(transfer_id),
  state text NOT NULL CHECK (state IN ('READY','RUNNING','RETRY','WAITING','COMPLETED','FAILED')),
  attempt integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  leased_until timestamptz,
  worker_id text,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX cctp_transfer_jobs_claim_idx ON cctp_transfer_jobs(state, available_at, leased_until);

CREATE FUNCTION protect_cctp_transfer_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transfer_id IS DISTINCT FROM OLD.transfer_id OR
     NEW.experiment_id IS DISTINCT FROM OLD.experiment_id OR
     NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR
     NEW.route_id IS DISTINCT FROM OLD.route_id OR
     NEW.evidence_mode IS DISTINCT FROM OLD.evidence_mode OR
     (OLD.message_identity IS NOT NULL AND NEW.message_identity IS DISTINCT FROM OLD.message_identity)
  THEN
    RAISE EXCEPTION 'CCTP transfer identity cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cctp_transfer_identity_frozen BEFORE UPDATE ON cctp_transfers
FOR EACH ROW EXECUTE FUNCTION protect_cctp_transfer_identity();
CREATE TRIGGER cctp_transfer_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cctp_transfer_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER cctp_transfer_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cctp_transfer_accounting_receipts
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
