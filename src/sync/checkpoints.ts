import type { ConnectorName, SyncCheckpoint } from "../connectors/base/types";

export interface SyncCheckpointStore {
  get(connector: ConnectorName): Promise<SyncCheckpoint | null>;
  set(checkpoint: SyncCheckpoint): Promise<void>;
}

export class InMemorySyncCheckpointStore implements SyncCheckpointStore {
  private readonly checkpoints = new Map<ConnectorName, SyncCheckpoint>();

  async get(connector: ConnectorName): Promise<SyncCheckpoint | null> {
    return this.checkpoints.get(connector) ?? null;
  }

  async set(checkpoint: SyncCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.connector, checkpoint);
  }
}
