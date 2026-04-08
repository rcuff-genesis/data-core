import { getZohoConnectionStatus } from "@/src/connectors/zoho";

export const runtime = "nodejs";

export async function GET() {
  const status = await getZohoConnectionStatus();

  if (!status.connected) {
    return Response.json({
      ok: true,
      connector: "zoho",
      connected: false,
      message: "Zoho is not connected yet.",
    });
  }

  return Response.json({
    ok: true,
    connector: "zoho",
    ...status,
  });
}
