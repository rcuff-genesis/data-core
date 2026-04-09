import "server-only";

import { isDatabaseConfigured, query } from "../db/client";
import type { ToolCallLogEntry } from "./types";

export interface LearnedRule {
  id: number;
  ruleText: string;
  createdAt: string;
}

export interface FeedbackRecordInput {
  feedbackType: "good" | "bad" | "teach" | "tool_request";
  note?: string;
  userMessage?: string;
  assistantMessage?: string;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  toolCallLog?: ToolCallLogEntry[];
}

let ensureTablesPromise: Promise<void> | null = null;

export async function getActiveLearningRules(limit = 8): Promise<LearnedRule[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureChatLearningTables();

  type RuleRow = {
    id: number;
    rule_text: string;
    created_at: string;
  };

  const result = await query<RuleRow>(
    `
      SELECT id, rule_text, created_at
      FROM ai_learning_rules
      WHERE is_active = TRUE
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 25))],
  );

  return result.rows.map((row) => ({
    id: row.id,
    ruleText: row.rule_text,
    createdAt: row.created_at,
  }));
}

export async function listLearningRules(limit = 20): Promise<LearnedRule[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureChatLearningTables();

  type RuleRow = {
    id: number;
    rule_text: string;
    created_at: string;
  };

  const result = await query<RuleRow>(
    `
      SELECT id, rule_text, created_at
      FROM ai_learning_rules
      WHERE is_active = TRUE
      ORDER BY id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 50))],
  );

  return result.rows.map((row) => ({
    id: row.id,
    ruleText: row.rule_text,
    createdAt: row.created_at,
  }));
}

export async function addLearningRule(ruleText: string): Promise<LearnedRule> {
  if (!isDatabaseConfigured()) {
    throw new Error("Database is not configured, so learning rules cannot be saved.");
  }

  await ensureChatLearningTables();

  const normalized = normalizeRuleText(ruleText);

  if (!normalized) {
    throw new Error("Teaching text cannot be empty.");
  }

  type RuleRow = {
    id: number;
    rule_text: string;
    created_at: string;
  };

  const existing = await query<RuleRow>(
    `
      SELECT id, rule_text, created_at
      FROM ai_learning_rules
      WHERE LOWER(rule_text) = LOWER($1)
        AND is_active = TRUE
      LIMIT 1
    `,
    [normalized],
  );

  const existingRow = existing.rows[0];

  if (existingRow) {
    await query(
      `
        UPDATE ai_learning_rules
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [existingRow.id],
    );

    return {
      id: existingRow.id,
      ruleText: existingRow.rule_text,
      createdAt: existingRow.created_at,
    };
  }

  const inserted = await query<RuleRow>(
    `
      INSERT INTO ai_learning_rules (
        rule_text,
        source_command,
        is_active
      )
      VALUES ($1, 'teach', TRUE)
      RETURNING id, rule_text, created_at
    `,
    [normalized],
  );

  const row = inserted.rows[0];

  return {
    id: row.id,
    ruleText: row.rule_text,
    createdAt: row.created_at,
  };
}

export async function deactivateLearningRule(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return false;
  }

  await ensureChatLearningTables();

  const result = await query(
    `
      UPDATE ai_learning_rules
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND is_active = TRUE
    `,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function recordFeedback(input: FeedbackRecordInput): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  await ensureChatLearningTables();

  await query(
    `
      INSERT INTO ai_feedback_events (
        feedback_type,
        note,
        user_message,
        assistant_message,
        conversation,
        tool_call_log
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      input.feedbackType,
      normalizeOptionalText(input.note),
      normalizeOptionalText(input.userMessage),
      normalizeOptionalText(input.assistantMessage),
      JSON.stringify(input.conversation),
      JSON.stringify(input.toolCallLog ?? []),
    ],
  );
}

async function ensureChatLearningTables(): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  if (!ensureTablesPromise) {
    ensureTablesPromise = createChatLearningTables();
  }

  return ensureTablesPromise;
}

async function createChatLearningTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_learning_rules (
      id BIGSERIAL PRIMARY KEY,
      rule_text TEXT NOT NULL,
      source_command TEXT NOT NULL DEFAULT 'teach',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ai_feedback_events (
      id BIGSERIAL PRIMARY KEY,
      feedback_type TEXT NOT NULL,
      note TEXT NULL,
      user_message TEXT NULL,
      assistant_message TEXT NULL,
      conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
      tool_call_log JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_ai_learning_rules_active_updated
      ON ai_learning_rules (is_active, updated_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_type_created
      ON ai_feedback_events (feedback_type, created_at DESC)
  `);
}

function normalizeRuleText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptionalText(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
