import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ZohoOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accountsUrl: string;
  apiDomain?: string;
}

export interface ZohoTokenSet {
  accessToken: string;
  refreshToken?: string;
  apiDomain: string;
  tokenType: string;
  expiresAt: string;
  scope?: string;
  accountsUrl: string;
}

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  api_domain?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface ZohoTokenStore {
  get(): Promise<ZohoTokenSet | null>;
  set(tokens: ZohoTokenSet): Promise<void>;
}

export class FileZohoTokenStore implements ZohoTokenStore {
  private readonly filePath: string;

  constructor(filePath = getDefaultZohoTokenStorePath()) {
    this.filePath = filePath;
  }

  async get(): Promise<ZohoTokenSet | null> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return JSON.parse(content) as ZohoTokenSet;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  async set(tokens: ZohoTokenSet): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(tokens, null, 2), "utf8");
  }
}

export function getDefaultZohoTokenStorePath(): string {
  const configuredPath = process.env.ZOHO_TOKEN_STORE_PATH;
  return configuredPath
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath)
    : path.join(process.cwd(), ".runtime", "zoho-tokens.json");
}

export function getZohoOAuthConfigFromEnv(): ZohoOAuthConfig | null {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";
  const apiDomain = process.env.ZOHO_API_DOMAIN;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    accountsUrl,
    apiDomain,
  };
}

export async function exchangeZohoAuthorizationCode(params: {
  code: string;
  config: ZohoOAuthConfig;
  accountsUrl?: string;
}): Promise<ZohoTokenSet> {
  const tokenResponse = await requestZohoToken({
    accountsUrl: params.accountsUrl ?? params.config.accountsUrl,
    body: {
      grant_type: "authorization_code",
      client_id: params.config.clientId,
      client_secret: params.config.clientSecret,
      redirect_uri: params.config.redirectUri,
      code: params.code,
    },
  });

  return normalizeZohoTokenResponse(tokenResponse, {
    previousRefreshToken: undefined,
    fallbackApiDomain: params.config.apiDomain,
    accountsUrl: params.accountsUrl ?? params.config.accountsUrl,
  });
}

export async function refreshZohoAccessToken(params: {
  refreshToken: string;
  config: ZohoOAuthConfig;
  accountsUrl?: string;
}): Promise<ZohoTokenSet> {
  const tokenResponse = await requestZohoToken({
    accountsUrl: params.accountsUrl ?? params.config.accountsUrl,
    body: {
      grant_type: "refresh_token",
      client_id: params.config.clientId,
      client_secret: params.config.clientSecret,
      refresh_token: params.refreshToken,
    },
  });

  return normalizeZohoTokenResponse(tokenResponse, {
    previousRefreshToken: params.refreshToken,
    fallbackApiDomain: params.config.apiDomain,
    accountsUrl: params.accountsUrl ?? params.config.accountsUrl,
  });
}

export async function getValidZohoTokens(params?: {
  config?: ZohoOAuthConfig | null;
  store?: ZohoTokenStore;
}): Promise<ZohoTokenSet | null> {
  const config = params?.config ?? getZohoOAuthConfigFromEnv();
  const store = params?.store ?? new FileZohoTokenStore();

  if (!config) {
    return null;
  }

  const tokens = await store.get();

  if (!tokens) {
    return null;
  }

  if (!isZohoTokenExpired(tokens, 60)) {
    return tokens;
  }

  if (!tokens.refreshToken) {
    return tokens;
  }

  const refreshedTokens = await refreshZohoAccessToken({
    refreshToken: tokens.refreshToken,
    config,
    accountsUrl: tokens.accountsUrl,
  });
  await store.set(refreshedTokens);
  return refreshedTokens;
}

export function isZohoTokenExpired(
  tokens: ZohoTokenSet,
  bufferSeconds = 0,
): boolean {
  const expiresAt = Date.parse(tokens.expiresAt);
  return Number.isNaN(expiresAt)
    ? true
    : expiresAt <= Date.now() + bufferSeconds * 1000;
}

async function requestZohoToken(params: {
  accountsUrl: string;
  body: Record<string, string>;
}): Promise<ZohoTokenResponse> {
  const body = new URLSearchParams(params.body);
  const response = await fetch(`${trimTrailingSlash(params.accountsUrl)}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(buildZohoErrorMessage(payload, response.status));
  }

  return payload as unknown as ZohoTokenResponse;
}

function normalizeZohoTokenResponse(
  response: ZohoTokenResponse,
  options: {
    previousRefreshToken?: string;
    fallbackApiDomain?: string;
    accountsUrl: string;
  },
): ZohoTokenSet {
  if (!response.access_token) {
    throw new Error("Zoho token response did not include an access token.");
  }

  const expiresIn = parseExpiresInSeconds(response.expires_in);

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? options.previousRefreshToken,
    apiDomain:
      trimTrailingSlash(response.api_domain ?? options.fallbackApiDomain) ||
      "https://www.zohoapis.com",
    tokenType: response.token_type ?? "Bearer",
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: response.scope,
    accountsUrl: trimTrailingSlash(options.accountsUrl),
  };
}

function buildZohoErrorMessage(
  payload: Record<string, unknown>,
  status: number,
): string {
  const error = typeof payload.error === "string" ? payload.error : undefined;
  const description =
    typeof payload.error_description === "string"
      ? payload.error_description
      : undefined;

  return description || error
    ? `Zoho token request failed (${status}): ${description ?? error}`
    : `Zoho token request failed with status ${status}.`;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function trimTrailingSlash(value?: string): string {
  return (value ?? "").replace(/\/+$/, "");
}

function parseExpiresInSeconds(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 3600;
}
