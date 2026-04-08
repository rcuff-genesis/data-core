import type {
  Account,
  Company,
  Deal,
  Document,
  InternalEntity,
  Lead,
  OrderedItem,
  Product,
  SalesOrder,
} from "../ontology/entities";

export interface SalesOrderReadModel extends SalesOrder {
  orderedItems: OrderedItem[];
  products: Product[];
}

export interface EntityStore {
  getLeadById(id: string): Promise<Lead | null>;
  getAccountById(id: string): Promise<Account | null>;
  getCompanyById(id: string): Promise<Company | null>;
  getDealById(id: string): Promise<Deal | null>;
  getSalesOrderById(id: string): Promise<SalesOrderReadModel | null>;
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

export interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ChartSpec {
  type: "bar" | "pie" | "line";
  title: string;
  labels: string[];
  values: number[];
  /** Optional second series for grouped bars */
  series?: Array<{ name: string; values: number[] }>;
}
