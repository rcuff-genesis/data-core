import { runWalnutSync } from "@/src/connectors/walnut";
import { runZohoSync } from "@/src/connectors/zoho";

export const runtime = "nodejs";

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
