import { getValidZohoTokens, type ZohoOAuthConfig, type ZohoTokenStore } from "./auth";

export interface ZohoClientConfig {
  accessToken?: string;
  apiDomain?: string;
  timeoutMs?: number;
  oauthConfig?: ZohoOAuthConfig | null;
  tokenStore?: ZohoTokenStore;
}

export interface ZohoRecord {
  id: string;
  module: string;
  fields: Record<string, unknown>;
  modifiedTime?: string;
}

interface ZohoGetRecordsResponse {
  data?: Array<Record<string, unknown>>;
  info?: {
    more_records?: boolean;
    next_page_token?: string;
  };
}

interface ZohoModuleDefinition {
  module: string;
  fields: string[];
}

const ZOHO_MODULES: ZohoModuleDefinition[] = [
  {
    module: "Leads",
    fields: [
      "Full_Name",
      "First_Name",
      "Last_Name",
      "Email",
      "Phone",
      "Company",
      "Owner",
      "Lead_Status",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    module: "Accounts",
    fields: [
      "Account_Name",
      "Website",
      "Industry",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    module: "Deals",
    fields: [
      "Deal_Name",
      "Account_Name",
      "Stage",
      "Amount",
      "Currency",
      "Closing_Date",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    module: "Tasks",
    fields: [
      "Subject",
      "Status",
      "Priority",
      "Due_Date",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    module: "Calls",
    fields: [
      "Subject",
      "Call_Type",
      "Call_Start_Time",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    module: "Meetings",
    fields: [
      "Subject",
      "Start_DateTime",
      "Modified_Time",
      "Created_Time",
    ],
  },
];

export class ZohoClient {
  private readonly accessToken?: string;
  private readonly apiDomain?: string;
  private readonly timeoutMs: number;
  private readonly oauthConfig?: ZohoOAuthConfig | null;
  private readonly tokenStore?: ZohoTokenStore;

  constructor(config: ZohoClientConfig = {}) {
    this.accessToken = config.accessToken;
    this.apiDomain = config.apiDomain;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.oauthConfig = config.oauthConfig;
    this.tokenStore = config.tokenStore;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken || this.oauthConfig);
  }

  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      const response = await this.request("/settings/modules?type=modules", {
        method: "GET",
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchFullDataset(): Promise<ZohoRecord[]> {
    return this.fetchModules();
  }

  async fetchIncrementalDataset(since?: string): Promise<ZohoRecord[]> {
    return this.fetchModules(since);
  }

  async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const accessToken = await this.resolveAccessToken();
      const apiDomain = await this.resolveApiDomain();

      return await fetch(`${apiDomain}/crm/v8${path}`, {
        ...init,
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const tokens = await getValidZohoTokens({
      config: this.oauthConfig,
      store: this.tokenStore,
    });

    if (!tokens?.accessToken) {
      throw new Error("Zoho access token is not available.");
    }

    return tokens.accessToken;
  }

  private async resolveApiDomain(): Promise<string> {
    const tokens = await getValidZohoTokens({
      config: this.oauthConfig,
      store: this.tokenStore,
    });

    if (tokens?.apiDomain) {
      return tokens.apiDomain.replace(/\/+$/, "");
    }

    if (this.apiDomain) {
      return this.apiDomain.replace(/\/+$/, "");
    }

    return "https://www.zohoapis.com";
  }

  private async fetchModules(since?: string): Promise<ZohoRecord[]> {
    const records: ZohoRecord[] = [];

    for (const moduleDefinition of ZOHO_MODULES) {
      const moduleRecords = await this.fetchModuleRecords(moduleDefinition, since);
      records.push(...moduleRecords);
    }

    return records;
  }

  private async fetchModuleRecords(
    moduleDefinition: ZohoModuleDefinition,
    since?: string,
  ): Promise<ZohoRecord[]> {
    const records: ZohoRecord[] = [];
    let page = 1;
    let pageToken: string | undefined;
    let hasMoreRecords = true;

    while (hasMoreRecords) {
      const params = new URLSearchParams({
        fields: moduleDefinition.fields.join(","),
        per_page: "200",
      });

      if (pageToken) {
        params.set("page_token", pageToken);
      } else {
        params.set("page", String(page));
      }

      const response = await this.request(
        `/${moduleDefinition.module}?${params.toString()}`,
        {
          method: "GET",
          headers: since
            ? {
                "If-Modified-Since": since,
              }
            : undefined,
        },
      );

      if (response.status === 204 || response.status === 304) {
        break;
      }

      if (!response.ok) {
        throw new Error(
          `Zoho ${moduleDefinition.module} fetch failed with status ${response.status}.`,
        );
      }

      const payload =
        ((await response.json().catch(() => ({}))) as ZohoGetRecordsResponse) ??
        {};
      const pageData = payload.data ?? [];

      records.push(
        ...pageData
          .map((fields) => this.toZohoRecord(moduleDefinition.module, fields))
          .filter((record): record is ZohoRecord => Boolean(record)),
      );

      hasMoreRecords = payload.info?.more_records === true;
      pageToken = payload.info?.next_page_token;
      page += 1;

      if (page > 10 && !pageToken) {
        break;
      }
    }

    return records;
  }

  private toZohoRecord(
    module: string,
    fields: Record<string, unknown>,
  ): ZohoRecord | null {
    const id = typeof fields.id === "string" ? fields.id : undefined;

    if (!id) {
      return null;
    }

    return {
      id,
      module,
      fields,
      modifiedTime:
        typeof fields.Modified_Time === "string"
          ? fields.Modified_Time
          : typeof fields.Created_Time === "string"
            ? fields.Created_Time
            : undefined,
    };
  }
}
