import {
  exchangeZohoAuthorizationCode,
  FileZohoTokenStore,
  getZohoOAuthConfigFromEnv,
} from "@/src/connectors/zoho/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const accountsServerParam = url.searchParams.get("accounts-server");
  const config = getZohoOAuthConfigFromEnv();
  const homeUrl = new URL("/", url);

  if (!config) {
    return Response.json(
      {
        ok: false,
        error:
          "Missing Zoho OAuth configuration. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI.",
      },
      { status: 500 },
    );
  }

  if (error) {
    return Response.json(
      {
        ok: false,
        error,
        errorDescription,
      },
      { status: 400 },
    );
  }

  if (!code) {
    return Response.json(
      {
        ok: false,
        error: "Missing authorization code.",
      },
      { status: 400 },
    );
  }

  try {
    const tokens = await exchangeZohoAuthorizationCode({
      code,
      config,
      accountsUrl: accountsServerParam ?? config.accountsUrl,
    });

    const store = new FileZohoTokenStore();
    await store.set(tokens);

    homeUrl.searchParams.set("connector", "zoho");
    homeUrl.searchParams.set("connected", "true");

    return Response.redirect(homeUrl, 302);
  } catch (caughtError) {
    return Response.json(
      {
        ok: false,
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Zoho OAuth callback failed.",
      },
      { status: 500 },
    );
  }
}
