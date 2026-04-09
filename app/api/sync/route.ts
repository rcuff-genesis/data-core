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
