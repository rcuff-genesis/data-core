import { getWalnutConnectionStatus, getWalnutCoverageSummary } from "./walnut";
import { getZohoAuthUrl, getZohoConnectionStatus, getZohoCoverageSummary } from "./zoho";

export type ConnectorStatusState =
  | "connected"
  | "ready_to_connect"
  | "not_configured"
  | "coming_soon";

export interface ConnectorStatus {
  key: string;
  name: string;
  category: "crm" | "documents" | "database";
  state: ConnectorStatusState;
  description: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  details?: string;
}

const CONNECTOR_STATUS_CACHE_TTL_MS = 30_000;
let cachedStatuses:
  | {
      expiresAt: number;
      statuses: ConnectorStatus[];
    }
  | null = null;

export async function getConnectorStatuses(): Promise<ConnectorStatus[]> {
  if (cachedStatuses && cachedStatuses.expiresAt > Date.now()) {
    return cachedStatuses.statuses;
  }

  const [zohoStatus, walnutStatus] = await Promise.all([
    getZohoConnectorStatus(),
    getWalnutConnectorStatus(),
  ]);

  const statuses = [zohoStatus, walnutStatus];
  cachedStatuses = {
    expiresAt: Date.now() + CONNECTOR_STATUS_CACHE_TTL_MS,
    statuses,
  };

  return statuses;
}

export async function getZohoConnectorStatus(): Promise<ConnectorStatus> {
  const connection = await getZohoConnectionStatus({ includeDiagnostics: false });
  const zohoCoverage = getZohoCoverageSummary();

  if (connection.connected) {
    return {
      key: "zoho",
      name: "Zoho CRM",
      category: "crm",
      state: "connected",
      description:
        "Leads, contacts, companies, deals, campaigns, sales orders, and activities from Zoho CRM.",
      message: "Connected and ready for backend sync jobs.",
      actionLabel: "View Status",
      actionHref: "/api/connectors/zoho/status",
      details: `${zohoCoverage} Access token expires at ${connection.expiresAt}.`,
    };
  }

  const authUrl = getZohoAuthUrl();

  if (authUrl) {
    return {
      key: "zoho",
      name: "Zoho CRM",
      category: "crm",
      state: "ready_to_connect",
      description:
        "Leads, contacts, companies, deals, campaigns, sales orders, and activities from Zoho CRM.",
      message: "OAuth is configured locally. You can connect now.",
      actionLabel: "Connect Zoho",
      actionHref: authUrl,
      details: zohoCoverage,
    };
  }

  return {
    key: "zoho",
    name: "Zoho CRM",
    category: "crm",
    state: "not_configured",
    description:
      "Leads, contacts, companies, deals, campaigns, sales orders, and activities from Zoho CRM.",
    message: "Missing Zoho OAuth env vars.",
    details:
      "Set NEXT_PUBLIC_ZOHO_CLIENT_ID or ZOHO_CLIENT_ID plus ZOHO_REDIRECT_URI.",
  };
}

export async function getWalnutConnectorStatus(): Promise<ConnectorStatus> {
  const connection = await getWalnutConnectionStatus({
    includeDiagnostics: false,
  });
  const coverage = getWalnutCoverageSummary();

  if (!connection.configured) {
    return {
      key: "walnut",
      name: "Walnut",
      category: "database",
      state: "not_configured",
      description:
        "Internal Walnut data from a separate Postgres database, to be mapped into the shared ontology.",
      message: "Missing Walnut database env vars.",
      details:
        "Set WALNUT_DATABASE_URL or WALNUT_DB_HOST/WALNUT_DB_PORT/WALNUT_DB_NAME/WALNUT_DB_USER/WALNUT_DB_PASSWORD.",
    };
  }

  if (!connection.reachable) {
    return {
      key: "walnut",
      name: "Walnut",
      category: "database",
      state: "ready_to_connect",
      description:
        "Internal Walnut data from a separate Postgres database, to be mapped into the shared ontology.",
      message: "Walnut env vars are present, but the database connection failed.",
      actionLabel: "View Status",
      actionHref: "/api/connectors/walnut/status",
      details: connection.error ?? coverage,
    };
  }

  const tableSummary =
    connection.tableCount != null
      ? `Found ${connection.tableCount} tables in schema ${connection.schema ?? "public"}.`
      : "Connected to Walnut.";

  return {
      key: "walnut",
      name: "Walnut",
      category: "database",
      state: "connected",
      description:
        "Internal Walnut data from a separate Postgres database, to be mapped into the shared ontology.",
    message: "Ready to sync Walnut data into the mapped database.",
      actionLabel: "View Status",
      actionHref: "/api/connectors/walnut/status",
      details: `${coverage} ${tableSummary}`,
    };
  }
