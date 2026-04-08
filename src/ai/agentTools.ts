import "server-only";

import type { OllamaTool } from "./ollama";
import { PostgresEntityStore } from "../storage/postgresEntityStore";
import { OntologyQueryService } from "../ontology/queryService";
import type { Activity, Account, Contact, Deal, Lead, SalesOrder } from "../ontology/entities";
import type {
  CountByFieldOptions,
  CountByFieldRow,
} from "../storage/postgresEntityStore";
import type { ChartSpec } from "./types";

export interface AgentRequestContext {
  chart?: ChartSpec;
  lastCountByField?: {
    entityType: string;
    field: string;
    rows: CountByFieldRow[];
    options: CountByFieldOptions;
  };
}

export function createAgentExecutor(ctx: AgentRequestContext) {
  return (name: string, args: Record<string, unknown>) =>
    executeAgentTool(name, args, ctx);
}

export const AGENT_TOOLS: OllamaTool[] = [
  {
    type: "function",
    function: {
      name: "get_funnel_summary",
      description:
        "Returns the business funnel overview across the ontology: leads by stage, deals by stage, sales orders by status, and key conversion relation counts. Use this for open-ended questions about pipeline health, flow, and overall business movement.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ontology_status",
      description:
        "Returns total counts for every entity type and the most recent sync runs. Use this for high-level totals, counts, sync health, or recent ingestion state.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "explore_entity_graph",
      description:
        "Returns the direct incoming and outgoing ontology relations for one entity ID. Use this when the user asks how something is connected, what it led to, what it belongs to, or what depends on it.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Entity ID to inspect" },
          limit: {
            type: "number",
            description: "Maximum number of related entities to include",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_entities",
      description:
        "Search entities by name, keyword, or phrase. Use when the user mentions a specific person, company, deal, order, or term. Optionally filter by entity type.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term" },
          entity_type: {
            type: "string",
            description:
              "Optional entity type filter: lead, contact, account, deal, sales_order, activity, document, campaign, product",
          },
          limit: { type: "number", description: "Max results (default 8)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_leads",
      description:
        "List leads. Filter by stage or keyword. Use for lead pipeline questions and browsing.",
      parameters: {
        type: "object",
        properties: {
          stage: { type: "string", description: "Lead lifecycle stage filter" },
          search: { type: "string", description: "Keyword search" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deals",
      description:
        "List deals. Filter by stage or keyword. Use for open deals, pipeline reviews, and won or lost deal questions.",
      parameters: {
        type: "object",
        properties: {
          stage: { type: "string", description: "Deal stage filter" },
          search: { type: "string", description: "Keyword search" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_accounts",
      description:
        "List accounts. Filter by customer status or keyword. Use for company or customer browsing.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Customer status filter" },
          search: { type: "string", description: "Keyword search" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "List contacts. Filter by keyword.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Keyword search" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_activities",
      description: "List activities such as calls, emails, meetings, notes, and tasks.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Keyword search" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sales_orders",
      description:
        "List sales orders. Supports keyword search and this_month filtering. Use for questions like 'sales orders this month' or 'recent orders'.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Keyword search" },
          period: {
            type: "string",
            description: "Optional time filter. Supported value: this_month",
          },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead",
      description:
        "Get one lead by ID, including converted contact, converted account, converted deal, and recent activities.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Lead entity ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account",
      description:
        "Get one account by ID, including contacts, deals, sales orders, and activities.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Account entity ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal",
      description:
        "Get one deal by ID, including linked account, linked contact, sales orders, and activities.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Deal entity ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_order",
      description: "Get one sales order by ID with all ordered items and products.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Sales order entity ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_by_field",
      description:
        "Count entities grouped by a field. Use for stage breakdowns, source breakdowns, status summaries, and other distributions.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type: lead, deal, account, contact, activity, sales_order",
          },
          field: {
            type: "string",
            description: "Field to group by. Common: stage, status, leadSource, activityType",
          },
          stage: {
            type: "string",
            description: "Optional stage filter for entities that support stage.",
          },
          status: {
            type: "string",
            description: "Optional status filter for entities that support status.",
          },
          period: {
            type: "string",
            description: "Optional time filter. Supported value: this_month",
          },
        },
        required: ["entity_type", "field"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_chart",
      description:
        "Render a chart in the UI from numeric results you already have. Use bar for comparisons, pie for distributions, and line for trends. Do not invent data.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Chart type: bar, pie, or line",
          },
          title: {
            type: "string",
            description: "Short descriptive title for the chart",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Category labels",
          },
          values: {
            type: "array",
            items: { type: "number" },
            description: "Numeric values matching each label",
          },
        },
        required: ["type", "title", "labels", "values"],
      },
    },
  },
];

const store = new PostgresEntityStore();
const queryService = new OntologyQueryService(store);

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: AgentRequestContext,
): Promise<string> {
  switch (name) {
    case "get_funnel_summary": {
      const summary = await queryService.getFunnelSummary();
      const leadStages = summary.leadStages
        .map((row) => `${row.value}: ${row.count}`)
        .join(", ");
      const dealStages = summary.dealStages
        .map((row) => `${row.value}: ${row.count}`)
        .join(", ");
      const salesOrderStatuses = summary.salesOrderStatuses
        .map((row) => `${row.value}: ${row.count}`)
        .join(", ");
      const relationCounts = summary.relationCounts
        .map((row) => `${row.relationType}: ${row.count}`)
        .join(", ");

      return [
        `Lead stages: ${leadStages || "none"}`,
        `Deal stages: ${dealStages || "none"}`,
        `Sales order statuses: ${salesOrderStatuses || "none"}`,
        `Key conversion relations: ${relationCounts || "none"}`,
      ].join("\n\n");
    }

    case "get_ontology_status": {
      const summary = await queryService.getStatusSummary();
      const counts = summary.entityCounts
        .map((entry) => `${entry.entityType}: ${entry.count}`)
        .join(", ");
      const syncs = summary.recentSyncRuns
        .slice(0, 3)
        .map(
          (run) =>
            `${run.connector} ${run.mode} - ${run.status} at ${run.startedAt}` +
            (run.recordsFetched != null
              ? ` (${run.recordsFetched} records fetched)`
              : ""),
        )
        .join("\n");

      return `Entity counts: ${counts || "none"}\n\nRecent syncs:\n${syncs || "none"}`;
    }

    case "explore_entity_graph": {
      const id = String(args.id ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 12;
      const graph = await queryService.getEntityGraph(id, limit);

      if (!graph) {
        return `Entity not found: ${id}`;
      }

      const outgoing = graph.outgoing.length
        ? graph.outgoing
            .map(
              (relation) =>
                `- ${relation.relationType} -> [${relation.entity.type}] ${relation.entity.title} (${relation.entity.id})`,
            )
            .join("\n")
        : "none";
      const incoming = graph.incoming.length
        ? graph.incoming
            .map(
              (relation) =>
                `- ${relation.relationType} <- [${relation.entity.type}] ${relation.entity.title} (${relation.entity.id})`,
            )
            .join("\n")
        : "none";

      return [
        `Entity: [${graph.entity.type}] ${graph.entity.title} (${graph.entity.id})`,
        `Summary: ${graph.entity.snippet || "no summary available"}`,
        "",
        `Outgoing relations:\n${outgoing}`,
        "",
        `Incoming relations:\n${incoming}`,
      ].join("\n");
    }

    case "search_entities": {
      const queryText = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 20) : 8;
      const entityType =
        typeof args.entity_type === "string" ? args.entity_type : undefined;
      const results = await queryService.searchKnowledge(queryText, limit);
      const filtered = entityType
        ? results.filter((result) => result.type === entityType)
        : results;

      if (filtered.length === 0) {
        return "No matching entities found.";
      }

      return filtered
        .map(
          (result) =>
            `[${result.type}] ${result.title} (id: ${result.id}) - ${result.snippet}`,
        )
        .join("\n");
    }

    case "list_leads": {
      const leads = await store.listLeads({
        stage: typeof args.stage === "string" ? args.stage : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (leads.length === 0) {
        return "No leads found matching those filters.";
      }

      return `Found ${leads.length} leads:\n${formatLeads(leads)}`;
    }

    case "list_deals": {
      const deals = await store.listDeals({
        stage: typeof args.stage === "string" ? args.stage : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (deals.length === 0) {
        return "No deals found matching those filters.";
      }

      return `Found ${deals.length} deals:\n${formatDeals(deals)}`;
    }

    case "list_accounts": {
      const accounts = await store.listAccounts({
        status: typeof args.status === "string" ? args.status : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (accounts.length === 0) {
        return "No accounts found matching those filters.";
      }

      return `Found ${accounts.length} accounts:\n${formatAccounts(accounts)}`;
    }

    case "list_contacts": {
      const contacts = await store.listContacts({
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (contacts.length === 0) {
        return "No contacts found.";
      }

      return `Found ${contacts.length} contacts:\n${formatContacts(contacts)}`;
    }

    case "list_activities": {
      const activities = await store.listActivities({
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (activities.length === 0) {
        return "No activities found.";
      }

      return `Found ${activities.length} activities:\n${formatActivities(activities)}`;
    }

    case "list_sales_orders": {
      const salesOrders = await store.listSalesOrders({
        search: typeof args.search === "string" ? args.search : undefined,
        period: args.period === "this_month" ? "this_month" : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (salesOrders.length === 0) {
        return "No sales orders found matching those filters.";
      }

      return `Found ${salesOrders.length} sales orders:\n${formatSalesOrders(salesOrders)}`;
    }

    case "get_lead": {
      const id = String(args.id ?? "");
      const leadContext = await queryService.getLeadContext(id);

      if (!leadContext) {
        return `Lead not found: ${id}`;
      }

      const {
        lead,
        convertedContact,
        convertedAccount,
        convertedDeal,
        relatedSalesOrders,
        recentActivities,
      } = leadContext;

      return [
        `Lead: ${lead.fullName} (${lead.id})`,
        `Stage: ${lead.stage ?? "unknown"}`,
        lead.email ? `Email: ${lead.email}` : null,
        lead.leadSource ? `Source: ${lead.leadSource}` : null,
        lead.campaignName ? `Campaign: ${lead.campaignName}` : null,
        convertedContact
          ? `Converted contact: ${convertedContact.fullName}`
          : null,
        convertedAccount ? `Converted account: ${convertedAccount.name}` : null,
        convertedDeal
          ? `Converted deal: ${convertedDeal.name} (stage: ${convertedDeal.stage})`
          : null,
        `Related sales orders: ${relatedSalesOrders.length}`,
        `Recent activities: ${recentActivities.length}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "get_account": {
      const id = String(args.id ?? "");
      const accountContext = await queryService.getAccountContext(id);

      if (!accountContext) {
        return `Account not found: ${id}`;
      }

      const { account, contacts, deals, salesOrders, recentActivities } =
        accountContext;

      return [
        `Account: ${account.name} (${account.id})`,
        account.customerStatus ? `Status: ${account.customerStatus}` : null,
        account.industry ? `Industry: ${account.industry}` : null,
        `Contacts: ${contacts.length}${contacts.length ? ` - ${contacts.slice(0, 3).map((contact) => contact.fullName).join(", ")}` : ""}`,
        `Deals: ${deals.length}${deals.length ? ` - ${deals.slice(0, 3).map((deal) => `${deal.name} (${deal.stage})`).join(", ")}` : ""}`,
        `Sales orders: ${salesOrders.length}`,
        `Recent activities: ${recentActivities.length}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "get_deal": {
      const id = String(args.id ?? "");
      const dealContext = await queryService.getDealContext(id);

      if (!dealContext) {
        return `Deal not found: ${id}`;
      }

      const { deal, account, contact, salesOrders, recentActivities } =
        dealContext;

      return [
        `Deal: ${deal.name} (${deal.id})`,
        `Stage: ${deal.stage ?? "unknown"}`,
        deal.amount != null
          ? `Amount: ${deal.amount}${deal.currency ? ` ${deal.currency}` : ""}`
          : null,
        deal.closeDate ? `Close date: ${deal.closeDate}` : null,
        deal.nextStep ? `Next step: ${deal.nextStep}` : null,
        account ? `Account: ${account.name}` : null,
        contact ? `Contact: ${contact.fullName}` : null,
        `Sales orders: ${salesOrders.length}`,
        `Recent activities: ${recentActivities.length}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "get_sales_order": {
      const id = String(args.id ?? "");
      const salesOrder = await queryService.getSalesOrder(id);

      if (!salesOrder) {
        return `Sales order not found: ${id}`;
      }

      return [
        `Order: ${salesOrder.subject} (${salesOrder.id})`,
        salesOrder.status ? `Status: ${salesOrder.status}` : null,
        salesOrder.totalAmount != null
          ? `Total: ${salesOrder.totalAmount}${salesOrder.currency ? ` ${salesOrder.currency}` : ""}`
          : null,
        `Line items: ${salesOrder.orderedItems.length}`,
        ...salesOrder.orderedItems.slice(0, 5).map(
          (item) =>
            `  - ${item.description ?? item.productId ?? "item"}: qty ${item.quantity ?? "?"}, unit price ${item.unitPrice ?? "?"}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "count_by_field": {
      const entityType = String(args.entity_type ?? "");
      const field = String(args.field ?? "");
      const options: CountByFieldOptions = {
        stage: typeof args.stage === "string" ? args.stage : undefined,
        status: typeof args.status === "string" ? args.status : undefined,
        period: args.period === "this_month" ? "this_month" : undefined,
      };
      const counts = await store.countByField(entityType, field, options);

      if (counts.length === 0) {
        return `No ${entityType} records found with field "${field}".`;
      }

      if (ctx) {
        ctx.lastCountByField = {
          entityType,
          field,
          rows: counts,
          options,
        };
      }

      const total = counts.reduce((sum, row) => sum + row.count, 0);
      const qualifiers = [
        options.stage ? `stage=${options.stage}` : null,
        options.status ? `status=${options.status}` : null,
        options.period ? `period=${options.period}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const breakdown = counts
        .map((row) => `  ${row.value}: ${row.count}`)
        .join("\n");
      const header = qualifiers
        ? `${entityType} by ${field} (${qualifiers}, total ${total}):`
        : `${entityType} by ${field} (total ${total}):`;

      return `${header}\n${breakdown}`;
    }

    case "generate_chart": {
      const type = String(args.type ?? "bar");
      const title = String(args.title ?? "Chart");
      const labels = Array.isArray(args.labels)
        ? (args.labels as unknown[]).map(String)
        : [];
      const values = Array.isArray(args.values)
        ? (args.values as unknown[]).map(Number).filter((value) => !isNaN(value))
        : [];

      if (labels.length === 0 || values.length === 0) {
        return "Chart generation failed: labels and values must not be empty.";
      }

      if (!["bar", "pie", "line"].includes(type)) {
        return "Chart generation failed: type must be bar, pie, or line.";
      }

      if (ctx) {
        ctx.chart = {
          type: type as ChartSpec["type"],
          title,
          labels: labels.slice(0, labels.length),
          values: values.slice(0, labels.length),
        };
      }

      return `Chart ready: "${title}" (${type}, ${labels.length} data points).`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function formatLeads(leads: Lead[]): string {
  return leads
    .map(
      (lead) =>
        `- ${lead.fullName}${lead.stage ? ` [${lead.stage}]` : ""}${lead.leadSource ? ` - source: ${lead.leadSource}` : ""}`,
    )
    .join("\n");
}

function formatDeals(deals: Deal[]): string {
  return deals
    .map(
      (deal) =>
        `- ${deal.name}${deal.stage ? ` [${deal.stage}]` : ""}${deal.amount != null ? ` - $${deal.amount}` : ""}${deal.closeDate ? ` - closes ${deal.closeDate}` : ""}`,
    )
    .join("\n");
}

function formatAccounts(accounts: Account[]): string {
  return accounts
    .map(
      (account) =>
        `- ${account.name}${account.customerStatus ? ` [${account.customerStatus}]` : ""}${account.industry ? ` - ${account.industry}` : ""}`,
    )
    .join("\n");
}

function formatContacts(contacts: Contact[]): string {
  return contacts
    .map(
      (contact) =>
        `- ${contact.fullName}${contact.title ? ` (${contact.title})` : ""}${contact.email ? ` - ${contact.email}` : ""}`,
    )
    .join("\n");
}

function formatActivities(activities: Activity[]): string {
  return activities
    .map(
      (activity) =>
        `- [${activity.activityType ?? "activity"}] ${activity.subject ?? activity.id}${activity.updatedAt ? ` - ${activity.updatedAt.slice(0, 10)}` : ""}`,
    )
    .join("\n");
}

function formatSalesOrders(salesOrders: SalesOrder[]): string {
  return salesOrders
    .map(
      (salesOrder) =>
        `- ${salesOrder.subject}${salesOrder.status ? ` [${salesOrder.status}]` : ""}${salesOrder.totalAmount != null ? ` - ${salesOrder.totalAmount}${salesOrder.currency ? ` ${salesOrder.currency}` : ""}` : ""}${salesOrder.createdAt ? ` - created ${salesOrder.createdAt.slice(0, 10)}` : ""}`,
    )
    .join("\n");
}
