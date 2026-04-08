import "server-only";

import { chatWithOllamaToolLoop } from "./ollama";
import {
  AGENT_TOOLS,
  createAgentExecutor,
  type AgentRequestContext,
} from "./agentTools";
import { OntologyQueryService } from "../ontology/queryService";
import type { ChartSpec, ToolCallLogEntry } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  answer: string;
  toolCallLog: ToolCallLogEntry[];
  chart?: ChartSpec;
}

const ontologyQueryService = new OntologyQueryService();

export async function answerDataQuestion(
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const conversation = messages.filter((message) => message.content.trim());

  if (conversation.length === 0) {
    throw new Error("At least one chat message is required.");
  }

  const latestUserMessage = [...conversation]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUserMessage) {
    throw new Error("A user message is required.");
  }

  const statusSummary = await ontologyQueryService.getStatusSummary();
  const entityCounts = statusSummary.entityCounts
    .map((entry) => `${entry.entityType}: ${entry.count}`)
    .join(", ");

  const systemPrompt = buildSystemPrompt(entityCounts);
  const ollamaMessages = [
    { role: "system" as const, content: systemPrompt },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const agentCtx: AgentRequestContext = {};
  const { answer, toolCallLog } = await chatWithOllamaToolLoop(
    ollamaMessages,
    AGENT_TOOLS,
    createAgentExecutor(agentCtx),
  );

  const chart =
    agentCtx.chart ??
    buildFallbackChart(latestUserMessage.content, agentCtx.lastCountByField);

  return { answer, toolCallLog, chart };
}

function buildSystemPrompt(entityCounts: string): string {
  const today = new Date().toISOString().slice(0, 10);

  return [
    `You are Data Core AI. Today is ${today}.`,
    "You have tools to query a business ontology database (Zoho CRM data synced to Postgres).",
    "Entity types: lead, contact, account, deal, sales_order, activity, campaign, document.",
    "The database supports this_month filtering for lists and grouped counts using stored entity timestamps.",
    "",
    `Approximate entity counts: ${entityCounts || "unknown - run get_ontology_status"}`,
    "",
    "## Rules - follow these exactly:",
    "1. ALWAYS call a tool before answering. Never answer from memory or guesses.",
    "2. After getting tool results, answer in plain English. Do NOT repeat JSON or code.",
    "3. State exact numbers from the tool results. Do not estimate or approximate.",
    "4. If data is not in the tool result, say 'I don't have that data' and do not invent it.",
    "5. For broad business or pipeline questions, start with get_funnel_summary.",
    "6. For counts or totals use get_ontology_status or count_by_field.",
    "7. For lists use list_leads, list_deals, list_accounts, list_contacts, list_activities, or list_sales_orders.",
    "8. For name lookups use search_entities. If a result matters, follow up with get_lead, get_account, get_deal, get_sales_order, or explore_entity_graph.",
    "9. For open-ended relationship questions, use explore_entity_graph to traverse the ontology relations.",
    "10. For breakdowns (X by Y) use count_by_field and pass filters when needed.",
    "11. If the user asks for a chart, graph, visual, breakdown, or distribution, call generate_chart after you have numeric results.",
    "12. For sales-order questions about this month, use list_sales_orders or count_by_field with period='this_month'.",
    "13. The database does not support arbitrary natural-language time ranges like 'past week' unless a tool explicitly supports them.",
    "14. If the user asks for closed leads, interpret that as terminal lead stages and be explicit about the filter you chose.",
    "15. Keep answers short and direct.",
  ].join("\n");
}

function buildFallbackChart(
  userMessage: string,
  groupedResult?: AgentRequestContext["lastCountByField"],
): ChartSpec | undefined {
  if (!groupedResult || groupedResult.rows.length === 0) {
    return undefined;
  }

  if (!hasChartIntent(userMessage)) {
    return undefined;
  }

  return {
    type: inferChartType(userMessage),
    title: buildChartTitle(groupedResult),
    labels: groupedResult.rows.map((row) => row.value),
    values: groupedResult.rows.map((row) => row.count),
  };
}

function hasChartIntent(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();

  return [
    "chart",
    "graph",
    "visual",
    "pie",
    "bar",
    "line",
    "distribution",
    "breakdown",
  ].some((term) => normalized.includes(term));
}

function inferChartType(userMessage: string): ChartSpec["type"] {
  const normalized = userMessage.toLowerCase();

  if (
    normalized.includes("pie") ||
    normalized.includes("distribution") ||
    normalized.includes("share")
  ) {
    return "pie";
  }

  if (
    normalized.includes("line") ||
    normalized.includes("trend") ||
    normalized.includes("over time")
  ) {
    return "line";
  }

  return "bar";
}

function buildChartTitle(
  groupedResult: NonNullable<AgentRequestContext["lastCountByField"]>,
): string {
  const qualifiers = [
    groupedResult.options.stage ? `stage ${groupedResult.options.stage}` : null,
    groupedResult.options.status ? `status ${groupedResult.options.status}` : null,
    groupedResult.options.period === "this_month" ? "this month" : null,
  ].filter(Boolean);

  return qualifiers.length > 0
    ? `${groupedResult.entityType} by ${groupedResult.field} (${qualifiers.join(", ")})`
    : `${groupedResult.entityType} by ${groupedResult.field}`;
}
