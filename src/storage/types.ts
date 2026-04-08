import type { SyncMode, SyncResult } from "../connectors/base/types";
import type { EntityRelation } from "../ontology/relations";

export interface SourceRecordSnapshot {
  source: string;
  module: string;
  sourceRecordId: string;
  modifiedAt?: string;
  payload: Record<string, unknown>;
}

export interface PersistenceSummary {
  syncRunId?: number;
  sourceRecordsPersisted: number;
  entitiesPersisted: number;
  relationsPersisted: number;
}

export interface SyncRunStartInput {
  connector: string;
  mode: SyncMode;
}

export interface SyncRunCompleteInput {
  syncRunId: number;
  result: SyncResult;
  persistence: PersistenceSummary;
}

export interface SyncRunFailureInput {
  syncRunId: number;
  errorMessage: string;
}

export interface OntologyStore {
  startSyncRun(input: SyncRunStartInput): Promise<number>;
  completeSyncRun(input: SyncRunCompleteInput): Promise<void>;
  failSyncRun(input: SyncRunFailureInput): Promise<void>;
  persistSyncArtifacts(input: {
    syncRunId?: number;
    result: SyncResult;
    sourceRecords: SourceRecordSnapshot[];
    relations: EntityRelation[];
  }): Promise<PersistenceSummary>;
}
