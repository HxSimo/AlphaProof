CREATE TABLE eligibility_evaluations (
  evaluation_hash text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text NOT NULL,
  checkpoint_hash text NOT NULL,
  supersedes_hash text REFERENCES eligibility_evaluations(evaluation_hash),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id)
);

CREATE TABLE audit_events (
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  sequence numeric(78,0) NOT NULL,
  event_hash text NOT NULL UNIQUE,
  object_type text NOT NULL,
  object_content_hash text NOT NULL,
  previous_event_hash text,
  supersedes_content_hash text,
  payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(experiment_id, sequence),
  UNIQUE(experiment_id, object_type, object_content_hash)
);

CREATE TABLE commitment_batches (
  batch_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  first_sequence numeric(78,0) NOT NULL,
  last_sequence numeric(78,0) NOT NULL,
  batch_hash text NOT NULL UNIQUE,
  previous_batch_hash text,
  root text NOT NULL,
  leaves_object_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(experiment_id, first_sequence),
  UNIQUE(experiment_id, last_sequence)
);

CREATE TABLE commitment_proofs (
  batch_id text NOT NULL REFERENCES commitment_batches(batch_id),
  leaf_hash text NOT NULL,
  leaf_index integer NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(batch_id, leaf_hash),
  UNIQUE(batch_id, leaf_index)
);

CREATE TABLE registry_publication_receipts (
  transaction_hash text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES commitment_batches(batch_id),
  status text NOT NULL CHECK(status IN ('CONFIRMED','REORGED')),
  block_hash text NOT NULL,
  payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(batch_id, status, block_hash)
);

CREATE TABLE reproducible_exports (
  export_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  export_hash text NOT NULL UNIQUE,
  selected_object_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER eligibility_evaluations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON eligibility_evaluations
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER commitment_batches_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON commitment_batches
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER commitment_proofs_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON commitment_proofs
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER registry_publication_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON registry_publication_receipts
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER reproducible_exports_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON reproducible_exports
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
