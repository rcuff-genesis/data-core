CREATE TABLE IF NOT EXISTS ai_learning_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_text TEXT NOT NULL,
  source_command TEXT NOT NULL DEFAULT 'teach',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_rules_active_updated
  ON ai_learning_rules (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_feedback_events (
  id BIGSERIAL PRIMARY KEY,
  feedback_type TEXT NOT NULL,
  note TEXT NULL,
  user_message TEXT NULL,
  assistant_message TEXT NULL,
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_call_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_type_created
  ON ai_feedback_events (feedback_type, created_at DESC);
