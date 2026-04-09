import "server-only";

import { chatWithOllamaToolLoop } from "./ollama";
import {
  AGENT_TOOLS,
  createAgentExecutor,
  type AgentRequestContext,
} from "./agentTools";
import {
  addLearningRule,
  deactivateLearningRule,
  getActiveLearningRules,
  listLearningRules,
  recordFeedback,
} from "./learningStore";
import { OntologyQueryService } from "../ontology/queryService";
import type { ChartSpec, ToolCallLogEntry } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCallLog?: ToolCallLogEntry[];
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

  const commandResponse = await handleLearningCommand(
    conversation,
    latestUserMessage,
  );

  if (commandResponse) {
    return commandResponse;
  }

  const clarificationQuestion = buildClarificationQuestion(
    conversation,
    latestUserMessage.content,
  );

  if (clarificationQuestion) {
    return {
      answer: clarificationQuestion,
      toolCallLog: [],
    };
  }

  const statusSummary = await ontologyQueryService.getStatusSummary();
  const entityCounts = statusSummary.entityCounts
    .map((entry) => `${entry.entityType}: ${entry.count}`)
    .join(", ");
  const learnedRules = await getActiveLearningRules();

  const systemPrompt = buildSystemPrompt(entityCounts, learnedRules);
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

  if (/i don't have that data/i.test(answer)) {
    return {
      answer: `${answer}\n\nYou can help me learn with \`/teach ...\`, rate this with \`/good\` or \`/bad why...\`, or log a missing capability with \`/tool ...\`.`,
      toolCallLog,
      chart,
    };
  }

  return { answer, toolCallLog, chart };
}

function buildSystemPrompt(
  entityCounts: string,
  learnedRules: Awaited<ReturnType<typeof getActiveLearningRules>>,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const learnedRuleLines = learnedRules.map(
    (rule) => `- [rule ${rule.id}] ${rule.ruleText}`,
  );

  return [
    `You are Data Core AI. Today is ${today}.`,
    "You have tools to query a business ontology database (Zoho CRM data synced to Postgres).",
    "Entity types: lead, contact, account, deal, sales_order, build, product, inventory_item, activity, campaign, document.",
    "The database supports this_month filtering for lists and grouped counts using stored entity timestamps.",
    "",
    `Approximate entity counts: ${entityCounts || "unknown - run get_ontology_status"}`,
    "",
    "## Rules - follow these exactly:",
    "1. Call a tool before every data-backed answer. If the user's request is too ambiguous to choose the right tool or filter, ask one short clarifying question first.",
    "2. After getting tool results, answer in plain English. Do NOT repeat JSON or code.",
    "3. State exact numbers from the tool results. Do not estimate or approximate.",
    "4. If data is not in the tool result, say 'I don't have that data' and do not invent it.",
    "5. For broad business or pipeline questions, start with get_funnel_summary.",
    "6. For counts or totals use get_ontology_status or count_by_field.",
    "7. For lists use list_leads, list_deals, list_accounts, list_contacts, list_products, list_inventory_items, list_builds, list_activities, or list_sales_orders.",
    "8. For name lookups use search_entities. If there are multiple plausible matches, ask the user which one they mean. If a single result matters, follow up with get_lead, get_account, get_deal, get_sales_order, or explore_entity_graph.",
    "9. For open-ended relationship questions, use explore_entity_graph to traverse the ontology relations.",
    "10. For breakdowns (X by Y) use count_by_field and pass filters when needed.",
    "11. If the user asks for a chart, graph, visual, breakdown, or distribution, call generate_chart after you have numeric results.",
    "12. For sales-order questions about this month, use list_sales_orders or count_by_field with period='this_month'.",
    "13. For Walnut inventory-health or shortage questions, use get_inventory_health_summary or list_low_stock_parts.",
    "14. For Walnut forecasting, parts planning, or build-demand questions, use forecast_parts_for_active_builds.",
    "15. For one Walnut build's materials or shortages, use get_build_requirements.",
    "16. For questions about Walnut builds matched to Zoho sales orders, use summarize_zoho_walnut_alignment or explore_entity_graph.",
    "17. The database does not support arbitrary natural-language time ranges like 'past week' unless a tool explicitly supports them.",
    "18. If the user asks for a time range the tools do not support, ask them to choose between a supported filter or the full synced dataset.",
    "19. If the user asks for rankings like 'top' or 'best' and the metric is unclear, ask what metric they want.",
    "20. If the user asks for closed leads, interpret that as terminal lead stages and be explicit about the filter you chose.",
    "21. Keep clarifying questions short, ask only one at a time, and keep answers short and direct.",
    ...(learnedRuleLines.length
      ? [
          "",
          "## Learned Workspace Instructions:",
          "These were taught by the user. Follow them when they do not conflict with actual tool results or database truth.",
          ...learnedRuleLines,
        ]
      : []),
  ].join("\n");
}

async function handleLearningCommand(
  conversation: ChatMessage[],
  latestUserMessage: ChatMessage,
): Promise<ChatResponse | null> {
  const content = latestUserMessage.content.trim();

  if (!content.startsWith("/")) {
    return null;
  }

  const parsed = parseSlashCommand(content);
  const priorConversation = conversation.slice(0, -1);
  const lastAssistantMessage = [...priorConversation]
    .reverse()
    .find((message) => message.role === "assistant");
  const lastUserMessage = [...priorConversation]
    .reverse()
    .find((message) => message.role === "user");
  const conversationSnapshot = priorConversation.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  switch (parsed.command) {
    case "help":
      return {
        answer: [
          "Slash commands:",
          "/teach <instruction> - save a rule for future answers",
          "/good [note] - mark the last assistant answer as helpful",
          "/bad <note> - mark the last assistant answer as unhelpful",
          "/tool <need> - log a missing capability or tool request",
          "/learned - list active learned rules",
          "/forget <id> - disable one learned rule",
        ].join("\n"),
        toolCallLog: [],
      };

    case "teach": {
      if (!parsed.args) {
        return {
          answer: "Usage: /teach <instruction you want me to remember>",
          toolCallLog: [],
        };
      }

      const rule = await addLearningRule(parsed.args);
      await recordFeedback({
        feedbackType: "teach",
        note: parsed.args,
        userMessage: lastUserMessage?.content,
        assistantMessage: lastAssistantMessage?.content,
        conversation: conversationSnapshot,
        toolCallLog: lastAssistantMessage?.toolCallLog,
      });

      return {
        answer: `Saved learning rule #${rule.id}: ${rule.ruleText}`,
        toolCallLog: [],
      };
    }

    case "good": {
      if (!lastAssistantMessage) {
        return {
          answer: "I need a previous assistant answer in this chat before I can record /good feedback.",
          toolCallLog: [],
        };
      }

      await recordFeedback({
        feedbackType: "good",
        note: parsed.args,
        userMessage: lastUserMessage?.content,
        assistantMessage: lastAssistantMessage.content,
        conversation: conversationSnapshot,
        toolCallLog: lastAssistantMessage.toolCallLog,
      });

      return {
        answer: "Saved as positive feedback for the last assistant answer.",
        toolCallLog: [],
      };
    }

    case "bad": {
      if (!lastAssistantMessage) {
        return {
          answer: "I need a previous assistant answer in this chat before I can record /bad feedback.",
          toolCallLog: [],
        };
      }

      await recordFeedback({
        feedbackType: "bad",
        note: parsed.args,
        userMessage: lastUserMessage?.content,
        assistantMessage: lastAssistantMessage.content,
        conversation: conversationSnapshot,
        toolCallLog: lastAssistantMessage.toolCallLog,
      });

      return {
        answer: parsed.args
          ? "Saved as negative feedback for the last assistant answer."
          : "Saved as negative feedback. Add a reason next time like `/bad you should compare Walnut builds to Zoho orders by order number` to make it more useful.",
        toolCallLog: [],
      };
    }

    case "tool": {
      if (!parsed.args) {
        return {
          answer: "Usage: /tool <capability or command you want added>",
          toolCallLog: [],
        };
      }

      await recordFeedback({
        feedbackType: "tool_request",
        note: parsed.args,
        userMessage: lastUserMessage?.content,
        assistantMessage: lastAssistantMessage?.content,
        conversation: conversationSnapshot,
        toolCallLog: lastAssistantMessage?.toolCallLog,
      });

      return {
        answer: `Logged missing capability request: ${parsed.args}`,
        toolCallLog: [],
      };
    }

    case "learned": {
      const rules = await listLearningRules();

      return {
        answer: rules.length
          ? `Active learned rules:\n${rules
              .map((rule) => `- #${rule.id}: ${rule.ruleText}`)
              .join("\n")}`
          : "There are no active learned rules yet.",
        toolCallLog: [],
      };
    }

    case "forget": {
      const id = Number(parsed.args);

      if (!Number.isInteger(id) || id <= 0) {
        return {
          answer: "Usage: /forget <rule id>",
          toolCallLog: [],
        };
      }

      const removed = await deactivateLearningRule(id);

      return {
        answer: removed
          ? `Disabled learned rule #${id}.`
          : `I couldn't find an active learned rule with id ${id}.`,
        toolCallLog: [],
      };
    }

    default:
      return {
        answer:
          "Unknown slash command. Use `/help` to see the available learning commands.",
        toolCallLog: [],
      };
  }
}

const ENTITY_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "lead", pattern: /\bleads?\b/ },
  { key: "deal", pattern: /\bdeals?\b/ },
  { key: "account", pattern: /\baccounts?\b|\bcompanies?\b|\bcustomers?\b/ },
  { key: "contact", pattern: /\bcontacts?\b|\bpeople\b/ },
  { key: "sales_order", pattern: /\bsales orders?\b|\borders?\b/ },
  { key: "build", pattern: /\bbuilds?\b/ },
  { key: "product", pattern: /\bproducts?\b|\bparts?\b|\bskus?\b/ },
  {
    key: "inventory_item",
    pattern: /\binventory\b|\bstock\b|\bwarehouse\b|\bon hand\b/,
  },
  {
    key: "activity",
    pattern: /\bactivities\b|\bactivity\b|\bcalls?\b|\bemails?\b|\bmeetings?\b|\btasks?\b/,
  },
  { key: "pipeline", pattern: /\bpipeline\b|\bfunnel\b|\bbusiness\b/ },
  { key: "sync", pattern: /\bsync\b|\bstatus\b|\bhealth\b/ },
];

const UNSUPPORTED_TIME_RANGE_PATTERN =
  /\b(last|past|previous)\s+(week|month|quarter|year|\d+\s+days?)\b|\b(yesterday|today|tomorrow|q[1-4])\b/;

function buildClarificationQuestion(
  conversation: ChatMessage[],
  latestUserMessage: string,
): string | null {
  const normalized = normalizeMessage(latestUserMessage);

  if (!normalized) {
    return null;
  }

  const currentEntities = extractEntities(normalized);
  const recentContextEntity = findRecentContextEntity(conversation.slice(0, -1));
  const hasEntityContext =
    currentEntities.size > 0 || recentContextEntity !== null;

  if (
    UNSUPPORTED_TIME_RANGE_PATTERN.test(normalized) &&
    !normalized.includes("this month")
  ) {
    return "I can reliably query `this month` or the full synced dataset right now. Which time range do you want?";
  }

  if (
    /\b(top|best|biggest|largest|highest|lowest|worst)\b/.test(normalized) &&
    !/\b(amount|value|count|revenue|total|volume)\b/.test(normalized)
  ) {
    const subject = currentEntities.has("deal")
      ? "deals"
      : currentEntities.has("lead")
        ? "leads"
        : currentEntities.has("account")
          ? "accounts"
          : currentEntities.has("sales_order")
            ? "sales orders"
            : "results";

    return `What should "top" mean for ${subject}: highest amount, highest count, or most recent?`;
  }

  if (!hasEntityContext && needsEntityClarification(normalized)) {
    return "Which area should I look at: leads, deals, accounts, contacts, sales orders, builds, products, inventory, activities, or sync status?";
  }

  if (
    !hasEntityContext &&
    /\b(this|that|those|them|it|ones?)\b/.test(normalized)
  ) {
    return "What records are you referring to here: leads, deals, accounts, contacts, sales orders, builds, products, inventory, or activities?";
  }

  if (
    !hasEntityContext &&
    /\b(analyze|analysis|insights|overview|summary|help me|show me|what should i know|what's going on|hows it going|how is it going)\b/.test(
      normalized,
    )
  ) {
    return "What do you want to analyze first: pipeline health, sales orders, Walnut builds, inventory, parts, account activity, or sync health?";
  }

  return null;
}

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseSlashCommand(input: string): { command: string; args: string } {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const [command = "", ...rest] = withoutSlash.split(/\s+/);

  return {
    command: command.toLowerCase(),
    args: rest.join(" ").trim(),
  };
}

function extractEntities(message: string): Set<string> {
  const entities = new Set<string>();

  for (const candidate of ENTITY_PATTERNS) {
    if (candidate.pattern.test(message)) {
      entities.add(candidate.key);
    }
  }

  return entities;
}

function findRecentContextEntity(conversation: ChatMessage[]): string | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const entities = extractEntities(normalizeMessage(conversation[index].content));
    const entity = [...entities][0];

    if (entity) {
      return entity;
    }
  }

  return null;
}

function needsEntityClarification(message: string): boolean {
  return (
    message.split(" ").length <= 4 ||
    /\b(list|show|find|get|count|how many|breakdown|chart|graph|visual|recent|latest|open|closed|won|lost)\b/.test(
      message,
    )
  );
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
