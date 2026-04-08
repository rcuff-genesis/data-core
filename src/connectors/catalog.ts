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

export async function getConnectorStatuses(): Promise<ConnectorStatus[]> {
  const [zohoStatus] = await Promise.all([getZohoConnectorStatus()]);

  return [zohoStatus];
}

export async function getZohoConnectorStatus(): Promise<ConnectorStatus> {
  const connection = await getZohoConnectionStatus();
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
