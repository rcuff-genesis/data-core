import "server-only";

import { isDatabaseConfigured, query } from "../db/client";
import type { ChartSpec, ToolCallLogEntry } from "./types";

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCallLog?: ToolCallLogEntry[];
  chart?: ChartSpec;
  createdAt: string;
}

interface ChatMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  tool_call_log: ToolCallLogEntry[] | null;
  chart: ChartSpec | null;
  created_at: string;
}

interface SessionRow {
  session_id: string;
  summary_text: string | null;
}

const DEFAULT_RECENT_CONTEXT_LIMIT = 12;
const DEFAULT_UI_MESSAGE_LIMIT = 120;
const SUMMARY_TRIGGER_COUNT = 28;
const SUMMARY_KEEP_RECENT_COUNT = 12;
const MAX_SUMMARY_LENGTH = 6000;

let ensureTablesPromise: Promise<void> | null = null;

export async function ensureChatSession(sessionId: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  await ensureChatMemoryTables();

  await query(
    `
      INSERT INTO ai_chat_sessions (session_id)
      VALUES ($1::uuid)
      ON CONFLICT (session_id) DO UPDATE
      SET updated_at = NOW()
    `,
    [sessionId],
  );
}

export async function appendChatMessage(
  sessionId: string,
  input: {
    role: "user" | "assistant";
    content: string;
    toolCallLog?: ToolCallLogEntry[];
    chart?: ChartSpec;
  },
): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  await ensureChatMemoryTables();
  await ensureChatSession(sessionId);

  await query(
    `
      INSERT INTO ai_chat_messages (
        session_id,
        role,
        content,
        tool_call_log,
        chart
      )
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb)
    `,
    [
      sessionId,
      input.role,
      input.content,
      JSON.stringify(input.toolCallLog ?? []),
      input.chart ? JSON.stringify(input.chart) : null,
    ],
  );

  await query(
    `
      UPDATE ai_chat_sessions
      SET updated_at = NOW(),
          title = COALESCE(
            title,
            CASE
              WHEN $2 = 'user' THEN LEFT($3, 120)
              ELSE title
            END
          )
      WHERE session_id = $1::uuid
    `,
    [sessionId, input.role, input.content],
  );
}

export async function getChatSessionMessages(
  sessionId: string,
  limit = DEFAULT_UI_MESSAGE_LIMIT,
): Promise<StoredChatMessage[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureChatMemoryTables();

  const result = await query<ChatMessageRow>(
    `
      SELECT id, role, content, tool_call_log, chart, created_at
      FROM ai_chat_messages
      WHERE session_id = $1::uuid
      ORDER BY id DESC
      LIMIT $2
    `,
    [sessionId, Math.max(1, Math.min(limit, 300))],
  );

  return result.rows.reverse().map(mapStoredMessageRow);
}

export async function getChatSessionContext(
  sessionId: string,
  limit = DEFAULT_RECENT_CONTEXT_LIMIT,
): Promise<{
  summary: string | null;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    toolCallLog?: ToolCallLogEntry[];
  }>;
}> {
  if (!isDatabaseConfigured()) {
    return { summary: null, messages: [] };
  }

  await ensureChatMemoryTables();

  const [sessionResult, messageResult] = await Promise.all([
    query<SessionRow>(
      `
        SELECT session_id, summary_text
        FROM ai_chat_sessions
        WHERE session_id = $1::uuid
        LIMIT 1
      `,
      [sessionId],
    ),
    query<ChatMessageRow>(
      `
        SELECT id, role, content, tool_call_log, chart, created_at
        FROM ai_chat_messages
        WHERE session_id = $1::uuid
          AND summarized_at IS NULL
        ORDER BY id DESC
        LIMIT $2
      `,
      [sessionId, Math.max(1, Math.min(limit, 50))],
    ),
  ]);

  const summary = sessionResult.rows[0]?.summary_text ?? null;
  const messages = messageResult.rows.reverse().map((row) => ({
    role: row.role,
    content: row.content,
    toolCallLog: row.tool_call_log ?? [],
  }));

  return { summary, messages };
}

export async function compactChatSession(
  sessionId: string,
): Promise<{ summarized: boolean; summarizedMessages: number }> {
  if (!isDatabaseConfigured()) {
    return { summarized: false, summarizedMessages: 0 };
  }

  await ensureChatMemoryTables();

  const unsummarizedResult = await query<ChatMessageRow>(
    `
      SELECT id, role, content, tool_call_log, chart, created_at
      FROM ai_chat_messages
      WHERE session_id = $1::uuid
        AND summarized_at IS NULL
      ORDER BY id ASC
    `,
    [sessionId],
  );

  if (unsummarizedResult.rows.length <= SUMMARY_TRIGGER_COUNT) {
    return { summarized: false, summarizedMessages: 0 };
  }

  const messagesToSummarize = unsummarizedResult.rows.slice(
    0,
    Math.max(0, unsummarizedResult.rows.length - SUMMARY_KEEP_RECENT_COUNT),
  );

  if (messagesToSummarize.length === 0) {
    return { summarized: false, summarizedMessages: 0 };
  }

  const existingSummaryResult = await query<SessionRow>(
    `
      SELECT session_id, summary_text
      FROM ai_chat_sessions
      WHERE session_id = $1::uuid
      LIMIT 1
    `,
    [sessionId],
  );

  const existingSummary = existingSummaryResult.rows[0]?.summary_text ?? "";
  const nextSummary = mergeSessionSummary(
    existingSummary,
    summarizeMessages(messagesToSummarize),
  );
  const summarizedIds = messagesToSummarize.map((message) => message.id);

  await query(
    `
      UPDATE ai_chat_sessions
      SET summary_text = $2,
          updated_at = NOW()
      WHERE session_id = $1::uuid
    `,
    [sessionId, nextSummary],
  );

  await query(
    `
      UPDATE ai_chat_messages
      SET summarized_at = NOW()
      WHERE session_id = $1::uuid
        AND id = ANY($2::bigint[])
    `,
    [sessionId, summarizedIds],
  );

  return {
    summarized: true,
    summarizedMessages: summarizedIds.length,
  };
}

async function ensureChatMemoryTables(): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  if (!ensureTablesPromise) {
    ensureTablesPromise = createChatMemoryTables();
  }

  return ensureTablesPromise;
}

async function createChatMemoryTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      session_id UUID PRIMARY KEY,
      title TEXT NULL,
      summary_text TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES ai_chat_sessions(session_id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tool_call_log JSONB NOT NULL DEFAULT '[]'::jsonb,
      chart JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      summarized_at TIMESTAMPTZ NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id
      ON ai_chat_messages (session_id, id DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_summary_state
      ON ai_chat_messages (session_id, summarized_at, id DESC)
  `);
}

function summarizeMessages(messages: ChatMessageRow[]): string {
  const userHighlights = summarizeMessageGroup(
    messages.filter((message) => message.role === "user").map((message) => message.content),
    8,
  );
  const assistantHighlights = summarizeMessageGroup(
    messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.content),
    6,
  );
  const learnedActions = summarizeMessageGroup(
    messages
      .filter(
        (message) =>
          message.role === "user" && message.content.trim().startsWith("/"),
      )
      .map((message) => message.content),
    6,
  );

  const parts = ["Earlier conversation summary:"];

  if (userHighlights.length > 0) {
    parts.push("User requests:");
    parts.push(...userHighlights.map((line) => `- ${line}`));
  }

  if (assistantHighlights.length > 0) {
    parts.push("Assistant conclusions:");
    parts.push(...assistantHighlights.map((line) => `- ${line}`));
  }

  if (learnedActions.length > 0) {
    parts.push("Learning commands:");
    parts.push(...learnedActions.map((line) => `- ${line}`));
  }

  return parts.join("\n");
}

function summarizeMessageGroup(messages: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const message of messages) {
    const normalized = normalizeSummaryText(message);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeSummaryText(message: string): string {
  const singleLine = message.trim().replace(/\s+/g, " ");

  if (!singleLine) {
    return "";
  }

  return singleLine.length > 220 ? `${singleLine.slice(0, 217)}...` : singleLine;
}

function mergeSessionSummary(existingSummary: string, nextSummary: string): string {
  const merged = [existingSummary.trim(), nextSummary.trim()]
    .filter(Boolean)
    .join("\n\n");

  if (merged.length <= MAX_SUMMARY_LENGTH) {
    return merged;
  }

  return merged.slice(merged.length - MAX_SUMMARY_LENGTH);
}

function mapStoredMessageRow(row: ChatMessageRow): StoredChatMessage {
  return {
    id: String(row.id),
    role: row.role,
    content: row.content,
    toolCallLog: row.tool_call_log ?? [],
    chart: row.chart ?? undefined,
    createdAt: row.created_at,
  };
}
