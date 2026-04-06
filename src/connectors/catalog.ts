import { FileZohoTokenStore, getValidZohoTokens } from "./zoho/auth";

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

const zohoScopes = "ZohoCRM.modules.ALL,ZohoCRM.settings.modules.READ";

export async function getConnectorStatuses(): Promise<ConnectorStatus[]> {
  const [zohoStatus] = await Promise.all([getZohoConnectorStatus()]);

  return [
    zohoStatus,
    {
      key: "onedrive",
      name: "OneDrive",
      category: "documents",
      state: "coming_soon",
      description: "Business documents, specs, and engineering knowledge.",
      message: "Connector skeleton is planned but not wired yet.",
      details: "Next step after CRM sync is stable.",
    },
    {
      key: "supabase",
      name: "Supabase",
      category: "database",
      state: "coming_soon",
      description: "Structured product and application data from your own stack.",
      message: "Connector is not implemented yet.",
      details: "Will map SQL records into the same internal ontology.",
    },
  ];
}

export async function getZohoConnectorStatus(): Promise<ConnectorStatus> {
  const clientId =
    process.env.NEXT_PUBLIC_ZOHO_CLIENT_ID ?? process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const tokenStore = new FileZohoTokenStore();
  const tokens = await getValidZohoTokens({
    store: tokenStore,
  }).catch(() => null);

  if (tokens?.accessToken) {
    return {
      key: "zoho",
      name: "Zoho CRM",
      category: "crm",
      state: "connected",
      description: "Leads, companies, deals, and activities from Zoho CRM.",
      message: "Connected and ready for backend sync jobs.",
      actionLabel: "View Status",
      actionHref: "/api/connectors/zoho/status",
      details: `Access token expires at ${tokens.expiresAt}.`,
    };
  }

  if (clientId && redirectUri) {
    return {
      key: "zoho",
      name: "Zoho CRM",
      category: "crm",
      state: "ready_to_connect",
      description: "Leads, companies, deals, and activities from Zoho CRM.",
      message: "OAuth is configured locally. You can connect now.",
      actionLabel: "Connect Zoho",
      actionHref: buildZohoAuthUrl(clientId, redirectUri),
      details: `Callback: ${redirectUri}`,
    };
  }

  return {
    key: "zoho",
    name: "Zoho CRM",
    category: "crm",
    state: "not_configured",
    description: "Leads, companies, deals, and activities from Zoho CRM.",
    message: "Missing Zoho OAuth env vars.",
    details:
      "Set NEXT_PUBLIC_ZOHO_CLIENT_ID or ZOHO_CLIENT_ID plus ZOHO_REDIRECT_URI.",
  };
}

function buildZohoAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    scope: zohoScopes,
    client_id: clientId,
    response_type: "code",
    access_type: "offline",
    redirect_uri: redirectUri,
  });

  return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
}
