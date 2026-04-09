import "server-only";

import { chatWithOllamaToolLoop } from "./ollama";
import {
  AGENT_TOOLS,
  createAgentExecutor,
  executeAgentTool,
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

  const shortcutResponse = await handleStructuredQuestion(latestUserMessage.content);

  if (shortcutResponse) {
    return shortcutResponse;
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
    buildFallbackChart(
      latestUserMessage.content,
      agentCtx.lastCountByField,
      agentCtx.lastSalesBreakdown,
    );

  if (/i don't have that data/i.test(answer)) {
    return {
      answer: `${answer}\n\nYou can help me learn with \`/teach ...\`, rate this with \`/good\` or \`/bad why...\`, or log a missing capability with \`/tool ...\`.`,
      toolCallLog,
      chart,
    };
  }

  return { answer, toolCallLog, chart };
}

async function handleStructuredQuestion(
  latestUserMessage: string,
): Promise<ChatResponse | null> {
  const normalized = normalizeMessage(latestUserMessage);

  if (
    !looksLikeSalesBreakdownQuestion(normalized) ||
    looksLikeModelSpecificSalesQuestion(normalized)
  ) {
    return null;
  }

  const yearRange = extractYearRange(normalized);

  if (!yearRange) {
    return null;
  }

  const source =
    normalized.includes("zoho") ? "zoho" : normalized.includes("walnut") ? "walnut" : undefined;
  const metric = /\b(count|counts|number of orders)\b/.test(normalized)
    ? "count"
    : "amount";
  const chartIntent = hasChartIntent(normalized);
  const agentCtx: AgentRequestContext = {};
  const executor = createAgentExecutor(agentCtx);
  const args = {
    start_year: yearRange.startYear,
    end_year: yearRange.endYear,
    source,
    metric,
  };
  const answer = await executeAgentTool(
    "get_sales_breakdown_by_source",
    args,
    agentCtx,
  );
  const toolCallLog: ToolCallLogEntry[] = [
    {
      tool: "get_sales_breakdown_by_source",
      args,
      resultSummary: answer.slice(0, 200),
    },
  ];

  if (chartIntent && agentCtx.lastSalesBreakdown) {
    await executor("generate_chart", {
      type: inferChartType(normalized),
      title: agentCtx.lastSalesBreakdown.title,
      labels: agentCtx.lastSalesBreakdown.labels,
      values: agentCtx.lastSalesBreakdown.values,
    });
    toolCallLog.push({
      tool: "generate_chart",
      args: {
        type: inferChartType(normalized),
        title: agentCtx.lastSalesBreakdown.title,
      },
      resultSummary: "Chart ready",
    });
  }

  return {
    answer,
    toolCallLog,
    chart:
      agentCtx.chart ??
      buildFallbackChart(
        latestUserMessage,
        agentCtx.lastCountByField,
        agentCtx.lastSalesBreakdown,
      ),
  };
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
    "You have tools to query a business ontology database with synced Zoho and Walnut data stored in Postgres.",
    "Entity types: lead, contact, account, deal, sales_order, build, product, inventory_item, activity, campaign, document.",
    "The database supports this_month filtering for lists and grouped counts using stored entity timestamps.",
    "",
    `Approximate entity counts: ${entityCounts || "unknown - run get_ontology_status"}`,
    "",
    "## Rules - follow these exactly:",
    "1. Call a tool before every data-backed answer. If the user's request is too ambiguous to choose the right tool or filter, ask one short clarifying question first.",
    "2. After getting tool results, answer in plain English. Do NOT repeat JSON or code.",
    "2a. Never mention tool names, tool calls, parameters, raw JSON, or say that you are about to use a tool.",
    "3. State exact numbers from the tool results. Do not estimate or approximate.",
    "4. If data is not in the tool result, say 'I don't have that data' and do not invent it.",
    "5. For broad business or pipeline questions, start with get_funnel_summary.",
    "6. For counts or totals use get_ontology_status or count_by_field.",
    "7. For lists use list_leads, list_deals, list_accounts, list_contacts, list_products, list_inventory_items, list_builds, list_activities, or list_sales_orders. If the user says Walnut or Zoho, pass the matching source filter.",
    "8. For name lookups use search_entities. If the user says Walnut or Zoho, pass the matching source filter. If there are multiple plausible matches, ask the user which one they mean. If a single result matters, follow up with get_lead, get_account, get_deal, get_sales_order, or explore_entity_graph.",
    "9. For open-ended relationship questions, use explore_entity_graph to traverse the ontology relations.",
    "10. For breakdowns (X by Y) use count_by_field and pass filters when needed.",
    "11. If the user asks for a chart, graph, visual, breakdown, or distribution, call generate_chart after you have numeric results.",
    "12. For sales-order questions about this month, use list_sales_orders or count_by_field with period='this_month'.",
    "12a. For sales-order breakdowns by year, year range, or source system, use get_sales_breakdown_by_source.",
    "12b. Do not use source-system breakdown tools to answer product-model questions like WC-10, WC-100, or WC-1000.",
    "12c. If the user asks about a specific model or spec and the metric is unclear, ask whether they want distinct sales orders, revenue amount, or units before answering.",
    "12d. If a follow-up sales question says 'same', 'same for', or 'do the same' for a specific model, do not guess. Ask what metric and source to use unless that is crystal clear from the latest user message.",
    "12e. If the user asks for a model chart and the available tool only breaks down by source system, ask a clarifying question instead of reusing the source-system chart.",
    "13. For Walnut inventory-health or shortage questions, use get_inventory_health_summary or list_low_stock_parts. If the user asks which parts are the issue, prefer list_low_stock_parts so you can name the parts and shortages.",
    "14. For Walnut forecasting, parts planning, or build-demand questions, use forecast_parts_for_active_builds.",
    "15. For one Walnut build's materials or shortages, use get_build_requirements.",
    "16. For active Walnut build count questions, use count_active_builds with source='walnut'.",
    "17. For questions about Walnut builds matched to Zoho sales orders, use summarize_zoho_walnut_alignment, get_sales_order, get_account, or explore_entity_graph.",
    "17a. For requests like 'top 5 most recent builds' or 'latest orders', use the matching list tool with the limit requested. Do not use count_by_field for those.",
    "17b. If the user replies with only a ranking metric like 'most recent', apply it to the most recently discussed entity set.",
    "17c. If the user asks for 'all info', 'full info', or 'details', include the concrete record fields returned by the tool, not just a summary count.",
    "18. The database does not support arbitrary natural-language time ranges like 'past week' unless a tool explicitly supports them.",
    "19. If the user asks for a time range the tools do not support, ask them to choose between a supported filter or the full synced dataset.",
    "20. If the user asks for rankings like 'top' or 'best' and the metric is unclear, ask what metric they want.",
    "21. If the user asks for closed leads, interpret that as terminal lead stages and be explicit about the filter you chose.",
    "22. Keep clarifying questions short, ask only one at a time, and keep answers short and direct.",
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
  { key: "sales_order", pattern: /\bsales orders?\b|\bsales\b|\borders?\b|\brevenue\b/ },
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
  const recentSalesContext = hasRecentSalesContext(conversation.slice(0, -1));
  const recentSource = findRecentSourceMention(conversation.slice(0, -1));
  const modelCodes = extractModelCodes(normalized);
  const latestUserContext = findLatestUserSalesContext(conversation.slice(0, -1));
  const followUpSameIntent = /\b(same|same for|do the same|that same)\b/.test(
    normalized,
  );
  const mentionsSalesModel =
    modelCodes.length > 0 &&
    (currentEntities.has("sales_order") ||
      recentSalesContext ||
      followUpSameIntent ||
      /\b(model|spec)\b/.test(normalized));

  if (mentionsSalesModel) {
    const modelLabel = modelCodes.join(" vs ");
    const normalizedLatestUserContext = latestUserContext
      ? normalizeMessage(latestUserContext)
      : "";
    const currentMetric = extractSalesMetric(normalized);
    const priorMetric = extractSalesMetric(normalizedLatestUserContext);
    const currentSource = extractSourceChoice(normalized);
    const priorSource = extractSourceChoice(normalizedLatestUserContext) ?? recentSource;
    const currentChartIntent = hasChartIntent(normalized);
    const priorChartIntent =
      normalizedLatestUserContext.length > 0 &&
      hasChartIntent(normalizedLatestUserContext);

    if (
      !currentMetric ||
      (followUpSameIntent && !/\b(amount|revenue|value|count|orders?|units?)\b/.test(normalized) && !priorMetric)
    ) {
      return `For ${modelLabel}, do you want distinct sales orders, revenue amount, or units?`;
    }

    if (!currentSource && !priorSource) {
      return `Should I use Zoho only, Walnut only, or both for ${modelLabel}?`;
    }

    if (
      currentChartIntent &&
      !/\b(amount|revenue|value|count|orders?)\b/.test(normalized) &&
      !priorChartIntent
    ) {
      return `For the ${modelLabel} chart, do you want revenue amount or sales-order count?`;
    }
  }

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

function extractModelCodes(message: string): string[] {
  return [...message.matchAll(/\bwc[- ]?\d{1,4}[a-z0-9-]*\b/gi)].map((match) =>
    match[0].toUpperCase().replace(" ", "-"),
  );
}

function looksLikeModelSpecificSalesQuestion(message: string): boolean {
  return (
    extractModelCodes(message).length > 0 &&
    /\bsales\b|\bsales orders?\b|\brevenue\b|\bmodel\b|\bspec\b|\bamount\b|\bunits?\b|\borders?\b/.test(
      message,
    )
  );
}

function looksLikeSalesBreakdownQuestion(message: string): boolean {
  return (
    /\bsales\b|\bsales orders?\b|\brevenue\b/.test(message) &&
    /\b(system|source|sources|breakdown|compare|comparison)\b/.test(message)
  );
}

function extractYearRange(
  message: string,
): { startYear: number; endYear: number } | null {
  const matches = [...message.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );

  if (matches.length === 0) {
    return null;
  }

  return {
    startYear: matches[0],
    endYear: matches[matches.length - 1],
  };
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

function hasRecentSalesContext(conversation: ChatMessage[]): boolean {
  return conversation.some((message) =>
    /\bsales\b|\bsales orders?\b|\brevenue\b/i.test(message.content),
  );
}

function findLatestUserSalesContext(conversation: ChatMessage[]): string | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];

    if (
      message.role === "user" &&
      /\bsales\b|\bsales orders?\b|\brevenue\b|\bwc[- ]?\d{1,4}\b|\bmodel\b|\bspec\b/i.test(
        message.content,
      )
    ) {
      return message.content;
    }
  }

  return null;
}

function findRecentSourceMention(conversation: ChatMessage[]): string | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const content = conversation[index].content.toLowerCase();

    if (content.includes("zoho")) {
      return "zoho";
    }

    if (content.includes("walnut")) {
      return "walnut";
    }
  }

  return null;
}

function extractSalesMetric(
  message: string,
): "amount" | "count" | "units" | null {
  if (/\b(amount|revenue|value|total)\b/.test(message)) {
    return "amount";
  }

  if (/\b(units?|quantity)\b/.test(message)) {
    return "units";
  }

  if (/\b(count|counts|number of orders|orders?)\b/.test(message)) {
    return "count";
  }

  return null;
}

function extractSourceChoice(message: string): "zoho" | "walnut" | "both" | null {
  if (/\bboth\b/.test(message)) {
    return "both";
  }

  if (/\bzoho\b/.test(message)) {
    return "zoho";
  }

  if (/\bwalnut\b/.test(message)) {
    return "walnut";
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
  salesBreakdown?: AgentRequestContext["lastSalesBreakdown"],
): ChartSpec | undefined {
  if (!hasChartIntent(userMessage)) {
    return undefined;
  }

  if (salesBreakdown && salesBreakdown.labels.length > 0) {
    return {
      type: inferChartType(userMessage),
      title: salesBreakdown.title,
      labels: salesBreakdown.labels,
      values: salesBreakdown.values,
    };
  }

  if (!groupedResult || groupedResult.rows.length === 0) {
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
