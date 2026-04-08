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

export interface ZohoAvailableModule {
  apiName: string;
  singularLabel?: string;
  pluralLabel?: string;
}

interface ZohoGetRecordsResponse {
  data?: Array<Record<string, unknown>>;
  info?: {
    more_records?: boolean;
    next_page_token?: string;
  };
}

interface ZohoModuleDefinition {
  key: string;
  displayName: string;
  candidates: string[];
  fields: string[];
  queryParams?: Record<string, string>;
}

interface ZohoModulesResponse {
  modules?: Array<{
    api_name?: string;
    singular_label?: string;
    plural_label?: string;
  }>;
}

interface ZohoCountResponse {
  count?: number;
}

export interface ZohoModuleCount {
  key: string;
  displayName: string;
  apiName: string;
  count: number | null;
}

export const ZOHO_SYNC_MODULES: ZohoModuleDefinition[] = [
  {
    key: "leads",
    displayName: "Leads",
    candidates: ["Leads"],
    fields: [
      "Full_Name",
      "First_Name",
      "Last_Name",
      "Email",
      "Phone",
      "Company",
      "Owner",
      "Lead_Status",
      "Lead_Source",
      "Modified_Time",
      "Created_Time",
    ],
    queryParams: {
      converted: "both",
    },
  },
  {
    key: "accounts",
    displayName: "Accounts",
    candidates: ["Accounts"],
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
    key: "contacts",
    displayName: "Contacts",
    candidates: ["Contacts"],
    fields: [
      "Full_Name",
      "First_Name",
      "Last_Name",
      "Email",
      "Phone",
      "Account_Name",
      "Owner",
      "Lead_Source",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    key: "deals",
    displayName: "Deals",
    candidates: ["Deals"],
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
    key: "campaigns",
    displayName: "Campaigns",
    candidates: ["Campaigns"],
    fields: [
      "Campaign_Name",
      "Type",
      "Status",
      "Start_Date",
      "End_Date",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    key: "sales_orders",
    displayName: "Sales Orders",
    candidates: ["Sales_Orders", "SalesOrders", "salesorders"],
    fields: [
      "Subject",
      "Sales_Order_Number",
      "Account_Name",
      "Contact_Name",
      "Status",
      "Grand_Total",
      "Currency",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    key: "tasks",
    displayName: "Tasks",
    candidates: ["Tasks"],
    fields: [
      "Subject",
      "Status",
      "Priority",
      "Due_Date",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    key: "calls",
    displayName: "Calls",
    candidates: ["Calls"],
    fields: [
      "Subject",
      "Call_Type",
      "Call_Start_Time",
      "Owner",
      "Modified_Time",
      "Created_Time",
    ],
  },
  {
    key: "events",
    displayName: "Events",
    candidates: ["Events", "Meetings"],
    fields: [
      "Event_Title",
      "Start_DateTime",
      "End_DateTime",
      "Owner",
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
  private warnings: string[] = [];

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

  async fetchAvailableModules(): Promise<ZohoAvailableModule[]> {
    const response = await this.request("/settings/modules?type=modules", {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Zoho modules fetch failed with status ${response.status}.`);
    }

    const payload =
      ((await response.json().catch(() => ({}))) as ZohoModulesResponse) ?? {};

    const modules: ZohoAvailableModule[] = [];

    for (const moduleDefinition of payload.modules ?? []) {
        const apiName =
          typeof moduleDefinition.api_name === "string"
            ? moduleDefinition.api_name
            : undefined;

        if (!apiName) {
          continue;
        }

        modules.push({
          apiName,
          singularLabel:
            typeof moduleDefinition.singular_label === "string"
              ? moduleDefinition.singular_label
              : undefined,
          pluralLabel:
            typeof moduleDefinition.plural_label === "string"
              ? moduleDefinition.plural_label
              : undefined,
        });
    }

    return modules;
  }

  async fetchSyncModuleCounts(): Promise<ZohoModuleCount[]> {
    const availableModules = await this.fetchAvailableModules().catch(() => null);

    return Promise.all(
      ZOHO_SYNC_MODULES.map(async (definition) => {
        const resolvedModule = this.resolveModuleDefinition(
          definition,
          availableModules,
        );

        if (!resolvedModule) {
          return {
            key: definition.key,
            displayName: definition.displayName,
            apiName: definition.candidates[0],
            count: null,
          };
        }

        const response = await this.request(
          `/${resolvedModule.apiName}/actions/count`,
          {
            method: "GET",
          },
        );

        if (!response.ok) {
          return {
            key: definition.key,
            displayName: definition.displayName,
            apiName: resolvedModule.apiName,
            count: null,
          };
        }

        const payload =
          ((await response.json().catch(() => ({}))) as ZohoCountResponse) ?? {};

        return {
          key: definition.key,
          displayName: definition.displayName,
          apiName: resolvedModule.apiName,
          count: typeof payload.count === "number" ? payload.count : null,
        };
      }),
    );
  }

  async fetchFullDataset(): Promise<ZohoRecord[]> {
    return this.fetchModules();
  }

  async fetchIncrementalDataset(since?: string): Promise<ZohoRecord[]> {
    return this.fetchModules(since);
  }

  consumeWarnings(): string[] {
    const warnings = [...this.warnings];
    this.warnings = [];
    return warnings;
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
    this.warnings = [];
    const records: ZohoRecord[] = [];
    const availableModules = await this.fetchAvailableModules().catch(() => null);

    for (const moduleDefinition of ZOHO_SYNC_MODULES) {
      const resolvedModule = this.resolveModuleDefinition(
        moduleDefinition,
        availableModules,
      );

      if (!resolvedModule) {
        this.warnings.push(
          `Zoho ${moduleDefinition.displayName} is not available in this CRM account.`,
        );
        continue;
      }

      try {
        const moduleRecords = await this.fetchModuleRecords(
          resolvedModule,
          since,
        );
        records.push(...moduleRecords);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Zoho ${moduleDefinition.displayName} fetch failed.`;
        this.warnings.push(message);
      }
    }

    return records;
  }

  private async fetchModuleRecords(
    moduleDefinition: ZohoModuleDefinition & { apiName: string },
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

      for (const [key, value] of Object.entries(moduleDefinition.queryParams ?? {})) {
        params.set(key, value);
      }

      if (pageToken) {
        params.set("page_token", pageToken);
      } else {
        params.set("page", String(page));
      }

      const response = await this.request(
        `/${moduleDefinition.apiName}?${params.toString()}`,
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
          `Zoho ${moduleDefinition.displayName} fetch failed with status ${response.status}.`,
        );
      }

      const payload =
        ((await response.json().catch(() => ({}))) as ZohoGetRecordsResponse) ??
        {};
      const pageData = payload.data ?? [];

      records.push(
        ...pageData
          .map((fields) => this.toZohoRecord(moduleDefinition.apiName, fields))
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

  private resolveModuleDefinition(
    definition: ZohoModuleDefinition,
    availableModules: ZohoAvailableModule[] | null,
  ): (ZohoModuleDefinition & { apiName: string }) | null {
    if (!availableModules) {
      return {
        ...definition,
        apiName: definition.candidates[0],
      };
    }

    const normalizedCandidates = definition.candidates.map(normalizeZohoName);
    const matchedModule = availableModules.find((module) =>
      [module.apiName, module.singularLabel, module.pluralLabel]
        .filter((value): value is string => Boolean(value))
        .map(normalizeZohoName)
        .some((value) => normalizedCandidates.includes(value)),
    );

    if (!matchedModule) {
      return null;
    }

    return {
      ...definition,
      apiName: matchedModule.apiName,
    };
  }
}

function normalizeZohoName(value: string): string {
  return value.replace(/[\s_]+/g, "").toLowerCase();
}
