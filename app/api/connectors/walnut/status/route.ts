import {
  getWalnutConnectionStatus,
  getWalnutCoverageSummary,
} from "@/src/connectors/walnut";

export const runtime = "nodejs";

export async function GET() {
  const status = await getWalnutConnectionStatus({
    includeDiagnostics: true,
  });

  return Response.json({
    ok: true,
    connector: "walnut",
    coverage: getWalnutCoverageSummary(),
    status,
  });
}
