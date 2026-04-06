import type { InternalEntity } from "../../ontology/entities";

export type ConnectorName = "zoho" | "onedrive" | "supabase" | (string & {});

export type SyncMode = "full" | "incremental";

export type ConnectorConnectionStatus = "ready" | "degraded";

export interface ConnectorConnection {
  connector: ConnectorName;
  status: ConnectorConnectionStatus;
  message?: string;
}

export interface SyncCursor {
  value: string;
  updatedAt: string;
}

export interface SyncCheckpoint {
  connector: ConnectorName;
  cursor?: SyncCursor;
  lastSuccessfulSyncAt?: string;
}

export interface SyncRequest {
  mode: SyncMode;
  checkpoint?: SyncCheckpoint;
}

export interface SyncResult {
  connector: ConnectorName;
  mode: SyncMode;
  startedAt: string;
  completedAt: string;
  recordsFetched: number;
  recordsMapped: number;
  entities: InternalEntity[];
  nextCheckpoint?: SyncCheckpoint;
  warnings: string[];
}
