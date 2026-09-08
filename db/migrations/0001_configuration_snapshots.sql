-- M0 infrastructure only. Economic journal, queue and projections arrive in M3.
CREATE TABLE configuration_snapshots (
  content_hash text PRIMARY KEY CHECK (content_hash ~ '^0x[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION reject_configuration_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Configuration snapshots are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER configuration_snapshots_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON configuration_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION reject_configuration_mutation();
