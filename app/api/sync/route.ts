import { ZohoConnector } from "@/src/connectors/zoho/zohoConnector";
import { InMemorySyncCheckpointStore } from "@/src/sync/checkpoints";
import { planSyncJob, runSyncJob } from "@/src/sync/jobs";

export const runtime = "nodejs";

const checkpointStore = new InMemorySyncCheckpointStore();

export async function POST(request: Request) {
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

  const connector = new ZohoConnector({
    clientConfig: {
      accessToken: process.env.ZOHO_ACCESS_TOKEN,
    },
  });
  const mode = body.mode ?? "incremental";
  const plan = await planSyncJob(connector, mode);

  if (plan.status !== "ready") {
    return Response.json(
      {
        ok: false,
        plan,
      },
      { status: 400 },
    );
  }

  const result = await runSyncJob({
    connector,
    mode,
    checkpointStore,
  });

  return Response.json({
    ok: true,
    plan,
    result,
  });
}
