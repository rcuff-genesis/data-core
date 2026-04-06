export interface ZohoClientConfig {
  accessToken?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ZohoRecord {
  id: string;
  module: string;
  fields: Record<string, unknown>;
  modifiedTime?: string;
}

export class ZohoClient {
  private readonly accessToken?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ZohoClientConfig = {}) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl ?? "https://www.zohoapis.com/crm/v7";
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  async verifyConnection(): Promise<boolean> {
    // Future auth validation can perform a lightweight identity or org lookup.
    return this.isConfigured();
  }

  async fetchFullDataset(): Promise<ZohoRecord[]> {
    // Future implementation should paginate by module and respect Zoho quotas.
    return [];
  }

  async fetchIncrementalDataset(since?: string): Promise<ZohoRecord[]> {
    void since;
    // Future implementation should use Zoho modified-time filters plus checkpoint cursors.
    return [];
  }

  async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Zoho-oauthtoken ${this.accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
