import "server-only";

import type { OllamaTool } from "./ollama";
import { query } from "../db/client";
import { PostgresEntityStore } from "../storage/postgresEntityStore";
import { OntologyQueryService } from "../ontology/queryService";
import type {
  Activity,
  Account,
  Build,
  Contact,
  Deal,
  InventoryItem,
  Lead,
  Product,
  SalesOrder,
} from "../ontology/entities";
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
              "Optional entity type filter: lead, contact, account, deal, sales_order, build, activity, document, campaign, product, inventory_item",
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
      name: "get_inventory_health_summary",
      description:
        "Summarize Walnut inventory health across parts, on-hand counts, and safety-stock risk.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_low_stock_parts",
      description:
        "List Walnut parts that are at or below safety stock. Use for shortage and replenishment questions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_parts_for_active_builds",
      description:
        "Forecast part demand for active Walnut builds using synced Walnut builds, system_map, and BOM data stored in the local database.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_build_requirements",
      description:
        "Get the Walnut part requirements for one synced build, including required quantity, on-hand inventory, and shortages from the local mapped database.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Build entity ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_zoho_walnut_alignment",
      description:
        "Summarize how Walnut builds line up with Zoho sales orders using synced cross-system relations in the local database.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_products",
      description:
        "List products or Walnut parts. Filter by keyword or part number.",
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
      name: "list_inventory_items",
      description:
        "List Walnut inventory items. Filter by part number, serial number, location, or keyword.",
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
      name: "list_builds",
      description:
        "List Walnut builds. Filter by order number, serial number, model, or status keyword.",
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
      name: "get_build",
      description:
        "Get one Walnut build by ID, including order number, serial number, model, status, and dates.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Build entity ID" },
        },
        required: ["id"],
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
            description: "Entity type: lead, deal, account, contact, activity, sales_order, build, inventory_item, product",
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

    case "get_inventory_health_summary": {
      const summary = await getInventoryHealthSummary();

      return [
        `Tracked Walnut parts with inventory: ${summary.totalParts}`,
        `Parts at or below safety stock: ${summary.lowStockParts}`,
        `Parts with zero on hand: ${summary.zeroStockParts}`,
        summary.topRisk.length
          ? `Highest risk parts:\n${summary.topRisk
              .map(
                (item) =>
                  `- ${item.partNumber}: on hand ${item.onHand}, safety stock ${item.safetyStock}, shortage ${item.shortage}`,
              )
              .join("\n")}`
          : "Highest risk parts: none",
      ].join("\n");
    }

    case "list_low_stock_parts": {
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const parts = await listLowStockParts(limit);

      if (parts.length === 0) {
        return "No low-stock Walnut parts found.";
      }

      return `Found ${parts.length} low-stock parts:\n${parts
        .map(
          (part) =>
            `- ${part.partNumber}${part.description ? ` - ${part.description}` : ""} - on hand ${part.onHand}, safety stock ${part.safetyStock}, shortage ${part.shortage}`,
        )
        .join("\n")}`;
    }

    case "forecast_parts_for_active_builds": {
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const forecast = await forecastPartsForActiveBuilds(limit);

      if (forecast.length === 0) {
        return "No active-build part forecast is available from the synced Walnut data.";
      }

      return `Top forecasted part constraints for active Walnut builds:\n${forecast
        .map(
          (row) =>
            `- ${row.partNumber}${row.description ? ` - ${row.description}` : ""} - required ${row.requiredQty}, on hand ${row.onHand}, shortage ${row.shortage}, used by ${row.buildCount} active builds across ${row.modelCount} models`,
        )
        .join("\n")}`;
    }

    case "get_build_requirements": {
      const id = String(args.id ?? "");
      const requirements = await getBuildRequirements(id);

      if (!requirements) {
        return `Build not found: ${id}`;
      }

      const header = [
        `Build requirements: ${requirements.build.name} (${requirements.build.id})`,
        requirements.build.orderNumber
          ? `Order number: ${requirements.build.orderNumber}`
          : null,
        requirements.build.model ? `Model: ${requirements.build.model}` : null,
        requirements.build.status ? `Status: ${requirements.build.status}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      if (!requirements.build.model) {
        return `${header}\nNo model is available for this build, so I can't resolve Walnut BOM requirements yet.`;
      }

      if (requirements.parts.length === 0) {
        return `${header}\nNo synced Walnut BOM requirements were found for this build model.`;
      }

      return `${header}\nRequired parts:\n${requirements.parts
        .map(
          (part) =>
            `- ${part.partNumber}${part.description ? ` - ${part.description}` : ""} - required ${part.requiredQty}, on hand ${part.onHand}, shortage ${part.shortage}`,
        )
        .join("\n")}`;
    }

    case "summarize_zoho_walnut_alignment": {
      const summary = await summarizeZohoWalnutAlignment();

      return [
        `Walnut builds tracked: ${summary.totalWalnutBuilds}`,
        `Walnut builds linked to Zoho sales orders: ${summary.linkedWalnutBuilds}`,
        `Walnut builds not linked to Zoho sales orders: ${summary.unlinkedWalnutBuilds}`,
        `Zoho sales orders tracked: ${summary.totalZohoSalesOrders}`,
        `Zoho sales orders linked to Walnut builds: ${summary.linkedZohoSalesOrders}`,
        `Zoho sales orders without a linked Walnut build: ${summary.unlinkedZohoSalesOrders}`,
        summary.sampleUnlinkedBuilds.length
          ? `Sample unlinked Walnut builds:\n${summary.sampleUnlinkedBuilds
              .map(
                (build) =>
                  `- ${build.orderNumber ?? build.name}${build.model ? ` - ${build.model}` : ""}${build.status ? ` [${build.status}]` : ""}`,
              )
              .join("\n")}`
          : "Sample unlinked Walnut builds: none",
        summary.sampleUnlinkedOrders.length
          ? `Sample Zoho sales orders without a Walnut build:\n${summary.sampleUnlinkedOrders
              .map(
                (order) =>
                  `- ${order.orderNumber ?? order.subject}${order.status ? ` [${order.status}]` : ""}`,
              )
              .join("\n")}`
          : "Sample Zoho sales orders without a Walnut build: none",
      ].join("\n");
    }

    case "list_products": {
      const products = await store.listProducts({
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (products.length === 0) {
        return "No products found.";
      }

      return `Found ${products.length} products:\n${formatProducts(products)}`;
    }

    case "list_inventory_items": {
      const inventoryItems = await store.listInventoryItems({
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (inventoryItems.length === 0) {
        return "No inventory items found.";
      }

      return `Found ${inventoryItems.length} inventory items:\n${formatInventoryItems(inventoryItems)}`;
    }

    case "list_builds": {
      const builds = await store.listBuilds({
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });

      if (builds.length === 0) {
        return "No builds found.";
      }

      return `Found ${builds.length} builds:\n${formatBuilds(builds)}`;
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

    case "get_build": {
      const id = String(args.id ?? "");
      const build = await queryService.getBuild(id);

      if (!build) {
        return `Build not found: ${id}`;
      }

      return [
        `Build: ${build.name} (${build.id})`,
        build.orderNumber ? `Order number: ${build.orderNumber}` : null,
        build.serialNumber ? `Serial number: ${build.serialNumber}` : null,
        build.model ? `Model: ${build.model}` : null,
        build.status ? `Status: ${build.status}` : null,
        build.expectedDate ? `Expected date: ${build.expectedDate}` : null,
        build.deliverByDate ? `Deliver by: ${build.deliverByDate}` : null,
        build.shippingState ? `Shipping state: ${build.shippingState}` : null,
        build.shippingCountry ? `Shipping country: ${build.shippingCountry}` : null,
        build.bomVersion ? `BOM version: ${build.bomVersion}` : null,
      ]
        .filter(Boolean)
        .join("\n");
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

function formatProducts(products: Product[]): string {
  return products
    .map(
      (product) =>
        `- ${product.productCode ?? product.sku ?? product.name}${product.description ? ` - ${product.description}` : ""}${product.safetyStock != null ? ` - safety stock: ${product.safetyStock}` : ""}`,
    )
    .join("\n");
}

function formatInventoryItems(items: InventoryItem[]): string {
  return items
    .map(
      (item) =>
        `- ${item.partNumber ?? item.name}${item.location ? ` @ ${item.location}` : ""}${item.serialNumber ? ` - serial ${item.serialNumber}` : ""}${item.quantity != null ? ` - qty ${item.quantity}` : ""}`,
    )
    .join("\n");
}

function formatBuilds(builds: Build[]): string {
  return builds
    .map(
      (build) =>
        `- ${build.orderNumber ?? build.serialNumber ?? build.name}${build.model ? ` - ${build.model}` : ""}${build.status ? ` [${build.status}]` : ""}${build.deliverByDate ? ` - deliver by ${build.deliverByDate}` : ""}`,
    )
    .join("\n");
}

type InventoryRiskRow = {
  part_number: string;
  description: string | null;
  on_hand: string;
  safety_stock: string;
  shortage: string;
};

type InventoryHealthSummary = {
  totalParts: number;
  lowStockParts: number;
  zeroStockParts: number;
  topRisk: Array<{
    partNumber: string;
    onHand: number;
    safetyStock: number;
    shortage: number;
  }>;
};

type ForecastRow = {
  part_number: string;
  description: string | null;
  required_qty: string;
  on_hand: string;
  shortage: string;
  build_count: string;
  model_count: string;
};

type BuildRequirementRow = {
  part_number: string;
  description: string | null;
  required_qty: string;
  on_hand: string;
  shortage: string;
};

type AlignmentCountRow = {
  total_walnut_builds: string;
  linked_walnut_builds: string;
  total_zoho_sales_orders: string;
  linked_zoho_sales_orders: string;
};

type SampleBuildRow = {
  name: string;
  order_number: string | null;
  model: string | null;
  status: string | null;
};

type SampleOrderRow = {
  subject: string;
  order_number: string | null;
  status: string | null;
};

const ACTIVE_BUILD_STATUSES = ["Pending", "Assembly", "Testing", "Ready To Pack"];

async function getInventoryHealthSummary(): Promise<InventoryHealthSummary> {
  type SummaryRow = {
    total_parts: string;
    low_stock_parts: string;
    zero_stock_parts: string;
  };

  const [summaryResult, topRisk] = await Promise.all([
    query<SummaryRow>(
      `
        WITH inventory AS (
          SELECT
            canonical_json->>'partNumber' AS part_number,
            SUM(COALESCE((canonical_json->>'quantity')::numeric, 0)) AS on_hand,
            MAX(COALESCE((canonical_json->>'safetyStock')::numeric, 0)) AS safety_stock
          FROM ontology_entities
          WHERE source = 'walnut'
            AND entity_type = 'inventory_item'
            AND canonical_json->>'partNumber' IS NOT NULL
          GROUP BY canonical_json->>'partNumber'
        )
        SELECT
          COUNT(*)::text AS total_parts,
          COUNT(*) FILTER (WHERE on_hand <= safety_stock AND safety_stock > 0)::text AS low_stock_parts,
          COUNT(*) FILTER (WHERE on_hand <= 0)::text AS zero_stock_parts
        FROM inventory
      `,
    ),
    listLowStockParts(5),
  ]);

  const row = summaryResult.rows[0];

  return {
    totalParts: Number(row?.total_parts ?? 0),
    lowStockParts: Number(row?.low_stock_parts ?? 0),
    zeroStockParts: Number(row?.zero_stock_parts ?? 0),
    topRisk: topRisk.map((item) => ({
      partNumber: item.partNumber,
      onHand: item.onHand,
      safetyStock: item.safetyStock,
      shortage: item.shortage,
    })),
  };
}

async function listLowStockParts(limit: number): Promise<
  Array<{
    partNumber: string;
    description: string | null;
    onHand: number;
    safetyStock: number;
    shortage: number;
  }>
> {
  const result = await query<InventoryRiskRow>(
    `
      WITH inventory AS (
        SELECT
          canonical_json->>'partNumber' AS part_number,
          SUM(COALESCE((canonical_json->>'quantity')::numeric, 0)) AS on_hand,
          MAX(COALESCE((canonical_json->>'safetyStock')::numeric, 0)) AS safety_stock
        FROM ontology_entities
        WHERE source = 'walnut'
          AND entity_type = 'inventory_item'
          AND canonical_json->>'partNumber' IS NOT NULL
        GROUP BY canonical_json->>'partNumber'
      )
      SELECT
        inventory.part_number,
        product.canonical_json->>'description' AS description,
        inventory.on_hand::text,
        inventory.safety_stock::text,
        GREATEST(inventory.safety_stock - inventory.on_hand, 0)::text AS shortage
      FROM inventory
      LEFT JOIN ontology_entities product
        ON product.entity_id = 'walnut:part:' || inventory.part_number
      WHERE inventory.on_hand <= inventory.safety_stock
        AND inventory.safety_stock > 0
      ORDER BY GREATEST(inventory.safety_stock - inventory.on_hand, 0) DESC,
        inventory.part_number ASC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    partNumber: row.part_number,
    description: row.description,
    onHand: Number(row.on_hand),
    safetyStock: Number(row.safety_stock),
    shortage: Number(row.shortage),
  }));
}

async function forecastPartsForActiveBuilds(limit: number): Promise<
  Array<{
    partNumber: string;
    description: string | null;
    requiredQty: number;
    onHand: number;
    shortage: number;
    buildCount: number;
    modelCount: number;
  }>
> {
  const result = await query<ForecastRow>(
    `
      WITH active_builds AS (
        SELECT
          payload->>'model' AS shop_product,
          COUNT(*)::numeric AS build_count
        FROM source_records
        WHERE source = 'walnut'
          AND source_module = 'builds'
          AND COALESCE(payload->>'status', '') = ANY($1::text[])
          AND payload->>'model' IS NOT NULL
        GROUP BY payload->>'model'
      ),
      build_requirements AS (
        SELECT
          pb.payload->>'part_number' AS part_number,
          SUM(active_builds.build_count * COALESCE((pb.payload->>'quantity')::numeric, 0)) AS required_qty,
          SUM(active_builds.build_count) AS build_count,
          COUNT(DISTINCT active_builds.shop_product) AS model_count
        FROM active_builds
        INNER JOIN source_records sm
          ON sm.source = 'walnut'
          AND sm.source_module = 'system_map'
          AND sm.payload->>'shop_product' = active_builds.shop_product
        INNER JOIN source_records pb
          ON pb.source = 'walnut'
          AND pb.source_module = 'part_bom'
          AND pb.payload->>'bom_id' = sm.payload->>'bom_id'
        GROUP BY pb.payload->>'part_number'
      ),
      inventory AS (
        SELECT
          canonical_json->>'partNumber' AS part_number,
          SUM(COALESCE((canonical_json->>'quantity')::numeric, 0)) AS on_hand
        FROM ontology_entities
        WHERE source = 'walnut'
          AND entity_type = 'inventory_item'
          AND canonical_json->>'partNumber' IS NOT NULL
        GROUP BY canonical_json->>'partNumber'
      )
      SELECT
        build_requirements.part_number,
        product.canonical_json->>'description' AS description,
        build_requirements.required_qty::text,
        COALESCE(inventory.on_hand, 0)::text AS on_hand,
        GREATEST(build_requirements.required_qty - COALESCE(inventory.on_hand, 0), 0)::text AS shortage,
        build_requirements.build_count::text,
        build_requirements.model_count::text
      FROM build_requirements
      LEFT JOIN inventory
        ON inventory.part_number = build_requirements.part_number
      LEFT JOIN ontology_entities product
        ON product.entity_id = 'walnut:part:' || build_requirements.part_number
      ORDER BY shortage DESC, build_requirements.required_qty DESC, build_requirements.part_number ASC
      LIMIT $2
    `,
    [ACTIVE_BUILD_STATUSES, limit],
  );

  return result.rows.map((row) => ({
    partNumber: row.part_number,
    description: row.description,
    requiredQty: Number(row.required_qty),
    onHand: Number(row.on_hand),
    shortage: Number(row.shortage),
    buildCount: Number(row.build_count),
    modelCount: Number(row.model_count),
  }));
}

async function getBuildRequirements(buildId: string): Promise<
  | {
      build: Build;
      parts: Array<{
        partNumber: string;
        description: string | null;
        requiredQty: number;
        onHand: number;
        shortage: number;
      }>;
    }
  | null
> {
  const build = await store.getBuildById(buildId);

  if (!build) {
    return null;
  }

  if (!build.model) {
    return {
      build,
      parts: [],
    };
  }

  const result = await query<BuildRequirementRow>(
    `
      WITH build_bom AS (
        SELECT
          pb.payload->>'part_number' AS part_number,
          COALESCE((pb.payload->>'quantity')::numeric, 0) AS required_qty
        FROM source_records sm
        INNER JOIN source_records pb
          ON pb.source = 'walnut'
          AND pb.source_module = 'part_bom'
          AND pb.payload->>'bom_id' = sm.payload->>'bom_id'
        WHERE sm.source = 'walnut'
          AND sm.source_module = 'system_map'
          AND sm.payload->>'shop_product' = $1
      ),
      inventory AS (
        SELECT
          canonical_json->>'partNumber' AS part_number,
          SUM(COALESCE((canonical_json->>'quantity')::numeric, 0)) AS on_hand
        FROM ontology_entities
        WHERE source = 'walnut'
          AND entity_type = 'inventory_item'
          AND canonical_json->>'partNumber' IS NOT NULL
        GROUP BY canonical_json->>'partNumber'
      )
      SELECT
        build_bom.part_number,
        product.canonical_json->>'description' AS description,
        build_bom.required_qty::text,
        COALESCE(inventory.on_hand, 0)::text AS on_hand,
        GREATEST(build_bom.required_qty - COALESCE(inventory.on_hand, 0), 0)::text AS shortage
      FROM build_bom
      LEFT JOIN inventory
        ON inventory.part_number = build_bom.part_number
      LEFT JOIN ontology_entities product
        ON product.entity_id = 'walnut:part:' || build_bom.part_number
      ORDER BY shortage DESC, build_bom.required_qty DESC, build_bom.part_number ASC
    `,
    [build.model],
  );

  return {
    build,
    parts: result.rows.map((row) => ({
      partNumber: row.part_number,
      description: row.description,
      requiredQty: Number(row.required_qty),
      onHand: Number(row.on_hand),
      shortage: Number(row.shortage),
    })),
  };
}

async function summarizeZohoWalnutAlignment(): Promise<{
  totalWalnutBuilds: number;
  linkedWalnutBuilds: number;
  unlinkedWalnutBuilds: number;
  totalZohoSalesOrders: number;
  linkedZohoSalesOrders: number;
  unlinkedZohoSalesOrders: number;
  sampleUnlinkedBuilds: Array<{
    name: string;
    orderNumber: string | null;
    model: string | null;
    status: string | null;
  }>;
  sampleUnlinkedOrders: Array<{
    subject: string;
    orderNumber: string | null;
    status: string | null;
  }>;
}> {
  const relationTypes = ["fulfills_sales_order", "related_to"];
  const [countResult, unlinkedBuildResult, unlinkedOrderResult] = await Promise.all([
    query<AlignmentCountRow>(
      `
        WITH linked_builds AS (
          SELECT DISTINCT relation.from_entity_id
          FROM ontology_relations relation
          WHERE relation.from_entity_type = 'build'
            AND relation.to_entity_type = 'sales_order'
            AND relation.relation_type = ANY($1::text[])
        ),
        linked_orders AS (
          SELECT DISTINCT relation.to_entity_id
          FROM ontology_relations relation
          WHERE relation.from_entity_type = 'build'
            AND relation.to_entity_type = 'sales_order'
            AND relation.relation_type = ANY($1::text[])
        )
        SELECT
          (SELECT COUNT(*)::text FROM ontology_entities WHERE source = 'walnut' AND entity_type = 'build') AS total_walnut_builds,
          (SELECT COUNT(*)::text FROM linked_builds) AS linked_walnut_builds,
          (SELECT COUNT(*)::text FROM ontology_entities WHERE source = 'zoho' AND entity_type = 'sales_order') AS total_zoho_sales_orders,
          (SELECT COUNT(*)::text FROM linked_orders) AS linked_zoho_sales_orders
      `,
      [relationTypes],
    ),
    query<SampleBuildRow>(
      `
        WITH linked_builds AS (
          SELECT DISTINCT relation.from_entity_id
          FROM ontology_relations relation
          WHERE relation.from_entity_type = 'build'
            AND relation.to_entity_type = 'sales_order'
            AND relation.relation_type = ANY($1::text[])
        )
        SELECT
          canonical_json->>'name' AS name,
          canonical_json->>'orderNumber' AS order_number,
          canonical_json->>'model' AS model,
          canonical_json->>'status' AS status
        FROM ontology_entities
        WHERE source = 'walnut'
          AND entity_type = 'build'
          AND entity_id NOT IN (SELECT from_entity_id FROM linked_builds)
        ORDER BY entity_updated_at DESC NULLS LAST, last_synced_at DESC
        LIMIT 5
      `,
      [relationTypes],
    ),
    query<SampleOrderRow>(
      `
        WITH linked_orders AS (
          SELECT DISTINCT relation.to_entity_id
          FROM ontology_relations relation
          WHERE relation.from_entity_type = 'build'
            AND relation.to_entity_type = 'sales_order'
            AND relation.relation_type = ANY($1::text[])
        )
        SELECT
          canonical_json->>'subject' AS subject,
          canonical_json->>'orderNumber' AS order_number,
          canonical_json->>'status' AS status
        FROM ontology_entities
        WHERE source = 'zoho'
          AND entity_type = 'sales_order'
          AND entity_id NOT IN (SELECT to_entity_id FROM linked_orders)
        ORDER BY entity_updated_at DESC NULLS LAST, last_synced_at DESC
        LIMIT 5
      `,
      [relationTypes],
    ),
  ]);

  const counts = countResult.rows[0];
  const totalWalnutBuilds = Number(counts?.total_walnut_builds ?? 0);
  const linkedWalnutBuilds = Number(counts?.linked_walnut_builds ?? 0);
  const totalZohoSalesOrders = Number(counts?.total_zoho_sales_orders ?? 0);
  const linkedZohoSalesOrders = Number(counts?.linked_zoho_sales_orders ?? 0);

  return {
    totalWalnutBuilds,
    linkedWalnutBuilds,
    unlinkedWalnutBuilds: Math.max(totalWalnutBuilds - linkedWalnutBuilds, 0),
    totalZohoSalesOrders,
    linkedZohoSalesOrders,
    unlinkedZohoSalesOrders: Math.max(
      totalZohoSalesOrders - linkedZohoSalesOrders,
      0,
    ),
    sampleUnlinkedBuilds: unlinkedBuildResult.rows.map((row) => ({
      name: row.name,
      orderNumber: row.order_number,
      model: row.model,
      status: row.status,
    })),
    sampleUnlinkedOrders: unlinkedOrderResult.rows.map((row) => ({
      subject: row.subject,
      orderNumber: row.order_number,
      status: row.status,
    })),
  };
}
