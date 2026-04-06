import type { Company, Document, InternalEntity, Lead } from "../ontology/entities";

export interface EntityStore {
  getLeadById(id: string): Promise<Lead | null>;
  getCompanyById(id: string): Promise<Company | null>;
  searchDocuments(query: string, limit?: number): Promise<Document[]>;
  upsertEntities?(entities: InternalEntity[]): Promise<void>;
}

export interface ToolExecutionContext {
  entityStore: EntityStore;
}

export interface ToolResult<TData> {
  ok: boolean;
  data: TData | null;
  message?: string;
}
