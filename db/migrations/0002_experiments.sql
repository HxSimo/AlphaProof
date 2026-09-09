CREATE TABLE agents (
  agent_id text PRIMARY KEY,
  display_name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE agent_versions (
  version_id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(agent_id),
  declared_version_hash text NOT NULL CHECK (declared_version_hash ~ '^0x[0-9a-f]{64}$'),
  decision_keys jsonb NOT NULL CHECK (jsonb_typeof(decision_keys) = 'array'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revocation_reason text,
  UNIQUE(agent_id, declared_version_hash)
);

CREATE TABLE experiments (
  experiment_id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(agent_id),
  version_id text NOT NULL REFERENCES agent_versions(version_id),
  profile_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT','STARTED','CLOSED','INVALIDATED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_at timestamptz,
  policy jsonb,
  policy_hash text CHECK (policy_hash IS NULL OR policy_hash ~ '^0x[0-9a-f]{64}$'),
  configuration_hash text,
  profile_hash text,
  adapter_set_hash text,
  parser_set_hash text,
  CHECK ((state = 'DRAFT') = (policy IS NULL))
);

CREATE TABLE capital_scenarios (
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text NOT NULL,
  initial_amount_usdc_minor numeric(78,0) NOT NULL CHECK (initial_amount_usdc_minor > 0),
  portfolio jsonb NOT NULL,
  portfolio_version numeric(78,0) NOT NULL DEFAULT 0,
  active_action_id text,
  PRIMARY KEY(experiment_id, scenario_id)
);

CREATE TABLE action_intents (
  action_id text PRIMARY KEY,
  experiment_id text NOT NULL,
  scenario_id text NOT NULL,
  nonce numeric(78,0) NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  intent_hash text NOT NULL,
  typed_data_hash text NOT NULL,
  signed_bytes_hash text NOT NULL,
  signer text NOT NULL,
  payload jsonb NOT NULL,
  signed_bytes text NOT NULL,
  received_at timestamptz NOT NULL,
  sequence numeric(78,0) NOT NULL,
  status text NOT NULL CHECK (status IN ('ACCEPTED','IN_PROGRESS','SUCCEEDED','PARTIALLY_SUCCEEDED','FAILED','EXPIRED')),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_hash text,
  before_portfolio_hash text,
  after_portfolio_hash text,
  completed_at timestamptz,
  FOREIGN KEY(experiment_id, scenario_id) REFERENCES capital_scenarios(experiment_id, scenario_id),
  UNIQUE(experiment_id, idempotency_key),
  UNIQUE(experiment_id, scenario_id, nonce)
);

ALTER TABLE capital_scenarios
  ADD CONSTRAINT capital_scenarios_active_action_fk
  FOREIGN KEY(active_action_id) REFERENCES action_intents(action_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE execution_plans (
  action_id text PRIMARY KEY REFERENCES action_intents(action_id),
  plan_hash text NOT NULL,
  payload jsonb NOT NULL,
  synthetic_input_bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE accounting_receipts (
  action_id text NOT NULL REFERENCES action_intents(action_id),
  operation_id text NOT NULL,
  receipt_hash text NOT NULL,
  payload jsonb NOT NULL,
  applied_portfolio_version numeric(78,0) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(action_id, operation_id)
);

CREATE TABLE economic_journal (
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  sequence numeric(78,0) NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  previous_event_hash text,
  payload jsonb NOT NULL,
  PRIMARY KEY(experiment_id, sequence)
);

CREATE TABLE experiment_corrections (
  correction_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  original_content_hash text NOT NULL,
  corrected_content_hash text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE jobs (
  job_id text PRIMARY KEY,
  job_type text NOT NULL CHECK (job_type = 'EXECUTE_ACTION'),
  financial_identity text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('READY','RUNNING','RETRY','COMPLETED','FAILED')),
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  leased_until timestamptz,
  worker_id text,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX jobs_claim_idx ON jobs(state, available_at, leased_until);

CREATE FUNCTION reject_m3_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER execution_plans_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_plans
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER accounting_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON accounting_receipts
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER economic_journal_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON economic_journal
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TRIGGER experiment_corrections_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON experiment_corrections
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();

CREATE FUNCTION protect_started_experiment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'DRAFT' AND (
    NEW.agent_id IS DISTINCT FROM OLD.agent_id OR
    NEW.version_id IS DISTINCT FROM OLD.version_id OR
    NEW.profile_id IS DISTINCT FROM OLD.profile_id OR
    NEW.locked_at IS DISTINCT FROM OLD.locked_at OR
    NEW.policy IS DISTINCT FROM OLD.policy OR
    NEW.policy_hash IS DISTINCT FROM OLD.policy_hash OR
    NEW.configuration_hash IS DISTINCT FROM OLD.configuration_hash OR
    NEW.profile_hash IS DISTINCT FROM OLD.profile_hash OR
    NEW.adapter_set_hash IS DISTINCT FROM OLD.adapter_set_hash OR
    NEW.parser_set_hash IS DISTINCT FROM OLD.parser_set_hash
  ) THEN
    RAISE EXCEPTION 'Started experiment policy is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER experiments_lock_policy BEFORE UPDATE ON experiments
FOR EACH ROW EXECUTE FUNCTION protect_started_experiment();
