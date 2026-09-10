CREATE TABLE operation_incidents (
  incident_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  scenario_id text,
  resolves_incident_id text REFERENCES operation_incidents(incident_id),
  input_hash text NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER operation_incidents_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON operation_incidents
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_status text NOT NULL
);
-- Security telemetry has no experiment or economic journal identity.
CREATE TABLE request_windows (
  client_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count bigint NOT NULL,
  rejected_count bigint NOT NULL DEFAULT 0
);
CREATE TABLE experiment_profile_snapshots (
  experiment_id text PRIMARY KEY REFERENCES experiments(experiment_id),
  profile_hash text NOT NULL,
  payload jsonb NOT NULL
);
CREATE TRIGGER experiment_profile_snapshots_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON experiment_profile_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
CREATE TABLE experiment_stops (
  experiment_id text PRIMARY KEY REFERENCES experiments(experiment_id),
  reason text NOT NULL,
  stopped_at timestamptz NOT NULL,
  portfolio_hashes jsonb NOT NULL
);
CREATE TRIGGER experiment_stops_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON experiment_stops
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();

CREATE TABLE demo_session_exports (
  session_hash text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES experiments(experiment_id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER demo_session_exports_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON demo_session_exports
FOR EACH STATEMENT EXECUTE FUNCTION reject_m3_append_only_mutation();
