import {
  FileZohoTokenStore,
  getValidZohoTokens,
  getZohoOAuthConfigFromEnv,
} from "@/src/connectors/zoho/auth";
import { ZohoClient } from "@/src/connectors/zoho/client";

export const runtime = "nodejs";

export async function GET() {
  const tokenStore = new FileZohoTokenStore();
  const tokens = await getValidZohoTokens({
    store: tokenStore,
  }).catch(() => null);

  if (!tokens) {
    return Response.json({
      ok: true,
      connector: "zoho",
      connected: false,
      message: "Zoho is not connected yet.",
    });
  }

  const client = new ZohoClient({
    oauthConfig: getZohoOAuthConfigFromEnv(),
    tokenStore,
  });
  const reachable = await client.verifyConnection();

  return Response.json({
    ok: true,
    connector: "zoho",
    connected: true,
    reachable,
    apiDomain: tokens.apiDomain,
    expiresAt: tokens.expiresAt,
    hasRefreshToken: Boolean(tokens.refreshToken),
  });
}
