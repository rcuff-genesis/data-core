import { getZohoSamples } from "@/src/connectors/zoho";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modulesParam = url.searchParams.get("modules");
  const modules = modulesParam
    ? modulesParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  const samples = await getZohoSamples(modules);

  return Response.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    samples,
  });
}
