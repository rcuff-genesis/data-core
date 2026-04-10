import { runWalnutSync } from "@/src/connectors/walnut";
import { runZohoSync } from "@/src/connectors/zoho";
import { OntologyQueryService } from "@/src/ontology/queryService";

export const runtime = "nodejs";
const ontologyQueryService = new OntologyQueryService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const connector = searchParams.get("connector")?.trim() || undefined;
    const limit = Number(searchParams.get("limit") ?? "8");
    const syncRuns = await ontologyQueryService.getRecentSyncRuns({
      connector,
      limit: Number.isFinite(limit) ? limit : 8,
    });

    return Response.json({
      ok: true,
      syncRuns,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load sync history.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      connector?: string;
      mode?: "full" | "incremental";
    };

    const connector = body.connector ?? "zoho";

    if (!["zoho", "walnut"].includes(connector)) {
      return Response.json(
        {
          ok: false,
          error: `Unsupported connector "${connector}".`,
        },
        { status: 400 },
      );
    }

    const mode = body.mode ?? "incremental";
    const { plan, result } =
      connector === "walnut"
        ? await runWalnutSync(mode)
        : await runZohoSync(mode);

    return Response.json({
      ok: true,
      plan,
      result: {
        connector: result.connector,
        mode: result.mode,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        recordsFetched: result.recordsFetched,
        recordsMapped: result.recordsMapped,
        warnings: result.warnings,
        syncRunId: result.syncRunId,
        sourceRecordsPersisted: result.sourceRecordsPersisted,
        entitiesPersisted: result.entitiesPersisted,
        relationsPersisted: result.relationsPersisted,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed.",
      },
      { status: 500 },
    );
  }
}
