CREATE TABLE IF NOT EXISTS source_records (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  modified_at TIMESTAMPTZ NULL,
  payload JSONB NOT NULL,
  last_sync_run_id BIGINT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_module, source_record_id)
);

CREATE TABLE IF NOT EXISTS ontology_entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_status TEXT NULL,
  entity_created_at TIMESTAMPTZ NULL,
  entity_updated_at TIMESTAMPTZ NULL,
  canonical_json JSONB NOT NULL,
  source_payload JSONB NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ontology_entities_type
  ON ontology_entities (entity_type);

CREATE INDEX IF NOT EXISTS idx_ontology_entities_source
  ON ontology_entities (source, source_id);

CREATE TABLE IF NOT EXISTS ontology_relations (
  relation_key TEXT PRIMARY KEY,
  relation_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  from_entity_type TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  to_entity_type TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata JSONB NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ontology_relations_from
  ON ontology_relations (from_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_ontology_relations_to
  ON ontology_relations (to_entity_id, relation_type);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  connector TEXT PRIMARY KEY,
  cursor_value TEXT NULL,
  cursor_updated_at TIMESTAMPTZ NULL,
  last_successful_sync_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  connector TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  records_fetched INTEGER NULL,
  records_mapped INTEGER NULL,
  source_records_persisted INTEGER NULL,
  entities_persisted INTEGER NULL,
  relations_persisted INTEGER NULL,
  warnings JSONB NULL,
  error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_connector_started_at
  ON sync_runs (connector, started_at DESC);
