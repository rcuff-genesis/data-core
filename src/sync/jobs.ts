import type { BaseConnector } from "../connectors/base/Connector";
import type {
  ConnectorName,
  SyncMode,
  SyncRequest,
  SyncResult,
} from "../connectors/base/types";
import type { SyncCheckpointStore } from "./checkpoints";

export interface SyncJobInput {
  connector: BaseConnector;
  mode: SyncMode;
  checkpointStore?: SyncCheckpointStore;
}

export interface SyncJobSummary {
  connector: ConnectorName;
  mode: SyncMode;
  status: "ready" | "skipped";
  reason?: string;
}

export async function planSyncJob(
  connector: BaseConnector,
  mode: SyncMode,
): Promise<SyncJobSummary> {
  const connection = await connector.connect();

  if (connection.status !== "ready") {
    return {
      connector: connector.name,
      mode,
      status: "skipped",
      reason: connection.message ?? "Connector is not ready.",
    };
  }

  return {
    connector: connector.name,
    mode,
    status: "ready",
  };
}

export async function runSyncJob({
  connector,
  mode,
  checkpointStore,
}: SyncJobInput): Promise<SyncResult> {
  const checkpoint =
    mode === "incremental" ? await checkpointStore?.get(connector.name) : null;

  const request: SyncRequest = {
    mode,
    checkpoint: checkpoint ?? undefined,
  };

  const result = await connector.runSync(request);

  if (result.nextCheckpoint && checkpointStore) {
    await checkpointStore.set(result.nextCheckpoint);
  }

  return result;
}
