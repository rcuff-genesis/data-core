export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "data-core",
    timestamp: new Date().toISOString(),
  });
}
