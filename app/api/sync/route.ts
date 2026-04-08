import { runZohoSync } from "@/src/connectors/zoho";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      connector?: string;
      mode?: "full" | "incremental";
    };

    if (body.connector && body.connector !== "zoho") {
      return Response.json(
        {
          ok: false,
          error: `Unsupported connector "${body.connector}".`,
        },
        { status: 400 },
      );
    }

    const mode = body.mode ?? "incremental";
    const { plan, result } = await runZohoSync(mode);

    return Response.json({
      ok: true,
      plan,
      result,
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
