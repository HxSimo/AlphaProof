CREATE TABLE reference_portfolios (
  experiment_id text NOT NULL,
  scenario_id text NOT NULL,
  reference_id text NOT NULL,
  reference_kind text NOT NULL CHECK (reference_kind IN ('CASH','CONSERVATIVE_YIELD')),
  frozen_instrument_id text,
  status text NOT NULL CHECK (status IN ('ACTIVE','ENTRY_FAILED')),
  comparison_available boolean NOT NULL,
  replacement_allowed boolean NOT NULL CHECK (replacement_allowed = false),
  portfolio jsonb NOT NULL,
  portfolio_version numeric(78,0) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  entry_replay_bundle jsonb,
  PRIMARY KEY(experiment_id, scenario_id, reference_kind),
  UNIQUE(reference_id),
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id)
);

CREATE TABLE reference_receipts (
  reference_id text NOT NULL REFERENCES reference_portfolios(reference_id),
  operation_id text NOT NULL,
  receipt_hash text NOT NULL,
  payload jsonb NOT NULL,
  applied_portfolio_version numeric(78,0) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(reference_id, operation_id)
);

CREATE TABLE valuation_checkpoints (
  checkpoint_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text NOT NULL,
  sequence numeric(78,0) NOT NULL,
  checkpoint_at timestamptz NOT NULL,
  checkpoint_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  replay_bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id),
  UNIQUE(experiment_id, scenario_id, sequence),
  UNIQUE(experiment_id, scenario_id, checkpoint_at)
);

CREATE TABLE scenario_evaluations (
  evaluation_id text PRIMARY KEY,
  checkpoint_id text NOT NULL UNIQUE REFERENCES valuation_checkpoints(checkpoint_id),
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text NOT NULL,
  evaluation_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id)
);

CREATE FUNCTION protect_frozen_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.experiment_id IS DISTINCT FROM OLD.experiment_id OR
     NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR
     NEW.reference_id IS DISTINCT FROM OLD.reference_id OR
     NEW.reference_kind IS DISTINCT FROM OLD.reference_kind OR
     NEW.frozen_instrument_id IS DISTINCT FROM OLD.frozen_instrument_id OR
     NEW.replacement_allowed IS DISTINCT FROM OLD.replacement_allowed OR
     (OLD.status = 'ENTRY_FAILED' AND NEW.status IS DISTINCT FROM OLD.status)
  THEN
    RAISE EXCEPTION 'Frozen reference definition cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reference_definition_frozen BEFORE UPDATE ON reference_portfolios
FOR EACH ROW EXECUTE FUNCTION protect_frozen_reference();
CREATE TRIGGER reference_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON reference_receipts
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER valuation_checkpoints_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON valuation_checkpoints
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER scenario_evaluations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON scenario_evaluations
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
