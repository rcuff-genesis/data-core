import type { InternalEntity } from "../../ontology/entities";
import type {
  ConnectorConnection,
  ConnectorName,
  SyncCheckpoint,
  SyncRequest,
  SyncResult,
} from "./types";

export interface BaseConnector<TExternalRecord = unknown> {
  readonly name: ConnectorName;

  connect(): Promise<ConnectorConnection>;

  syncFull(): Promise<SyncResult>;

  syncIncremental(checkpoint?: SyncCheckpoint): Promise<SyncResult>;

  mapToInternal(record: TExternalRecord): InternalEntity[];

  runSync(request: SyncRequest): Promise<SyncResult>;
}
