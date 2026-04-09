import { query } from "../db/client";
import type { EntityStore, SalesOrderReadModel } from "../ai/types";
import type {
  Account,
  Activity,
  Build,
  Company,
  Contact,
  Deal,
  Document,
  EntityType,
  InventoryItem,
  Lead,
  OrderedItem,
  Product,
  SalesOrder,
} from "../ontology/entities";
import type { RelationType } from "../ontology/relations";

export interface ListOptions {
  stage?: string;
  status?: string;
  search?: string;
  limit?: number;
  period?: "this_month";
}

export interface CountByFieldRow {
  value: string;
  count: number;
}

export interface CountByFieldOptions {
  stage?: string;
  status?: string;
  period?: "this_month";
}

type CanonicalEntityRow<T> = {
  canonical_json: T;
};

export class PostgresEntityStore implements EntityStore {
  async getLeadById(id: string): Promise<Lead | null> {
    return getEntityById<Lead>(id, "lead");
  }

  async getAccountById(id: string): Promise<Account | null> {
    return getEntityById<Account>(id, "account");
  }

  async getCompanyById(id: string): Promise<Company | null> {
    return this.getAccountById(id);
  }

  async getContactById(id: string): Promise<Contact | null> {
    return getEntityById<Contact>(id, "contact");
  }

  async getDealById(id: string): Promise<Deal | null> {
    return getEntityById<Deal>(id, "deal");
  }

  async getSalesOrderById(id: string): Promise<SalesOrderReadModel | null> {
    const salesOrder = await getEntityById<SalesOrder>(id, "sales_order");

    if (!salesOrder) {
      return null;
    }

    const orderedItems = await getRelatedEntities<OrderedItem>(
      id,
      "contains_ordered_item",
      "ordered_item",
    );

    const productIds = [
      ...new Set(
        orderedItems
          .map((orderedItem) => orderedItem.productId)
          .filter((productId): productId is string => Boolean(productId)),
      ),
    ];

    const products = productIds.length
      ? await getEntitiesByIds<Product>(productIds, "product")
      : [];

    return {
      ...(salesOrder as Omit<SalesOrderReadModel, "orderedItems" | "products">),
      orderedItems,
      products,
    };
  }

  async getBuildById(id: string): Promise<Build | null> {
    return getEntityById<Build>(id, "build");
  }

  async getProductById(id: string): Promise<Product | null> {
    return getEntityById<Product>(id, "product");
  }

  async searchDocuments(queryText: string, limit = 10): Promise<Document[]> {
    const normalizedLimit = Math.max(1, Math.min(limit, 50));
    const searchTerm = `%${queryText}%`;
    const result = await query<CanonicalEntityRow<Document>>(
      `
        SELECT canonical_json
        FROM ontology_entities
        WHERE entity_type = 'document'
          AND (
            canonical_json->>'title' ILIKE $1
            OR canonical_json->>'summary' ILIKE $1
            OR canonical_json->>'textPreview' ILIKE $1
            OR canonical_json::text ILIKE $1
          )
        ORDER BY entity_updated_at DESC NULLS LAST, last_synced_at DESC
        LIMIT $2
      `,
      [searchTerm, normalizedLimit],
    );

    return result.rows.map((row) => row.canonical_json);
  }

  async getRelatedActivities(input: {
    entityId: string;
    entityType: EntityType;
    limit?: number;
  }): Promise<Activity[]> {
    const relationFilters = relationTypesForActivityTarget(input.entityType);

    if (relationFilters.length === 0) {
      return [];
    }

    const result = await query<CanonicalEntityRow<Activity>>(
      `
        SELECT source.canonical_json
        FROM ontology_relations relation
        INNER JOIN ontology_entities source
          ON source.entity_id = relation.from_entity_id
        WHERE relation.to_entity_id = $1
          AND relation.relation_type = ANY($2::text[])
          AND source.entity_type = 'activity'
        ORDER BY source.entity_updated_at DESC NULLS LAST, source.last_synced_at DESC
        LIMIT $3
      `,
      [input.entityId, relationFilters, Math.max(1, input.limit ?? 10)],
    );

    return result.rows.map((row) => row.canonical_json);
  }

  async getSalesOrdersForDeal(dealId: string): Promise<SalesOrderReadModel[]> {
    const salesOrders = await this.getEntitiesRelatedFromSource<SalesOrder>({
      sourceEntityId: dealId,
      relationType: "results_in_sales_order",
      targetEntityType: "sales_order",
    });

    return hydrateSalesOrders(this, salesOrders.map((salesOrder) => salesOrder.id));
  }

  async getSalesOrdersForAccount(
    accountId: string,
  ): Promise<SalesOrderReadModel[]> {
    const salesOrders = await this.getEntitiesRelatedToTarget<SalesOrder>({
      targetEntityId: accountId,
      relationType: "belongs_to_account",
      sourceEntityType: "sales_order",
    });

    return hydrateSalesOrders(this, salesOrders.map((salesOrder) => salesOrder.id));
  }

  async getEntitiesRelatedToTarget<T extends { id: string }>(input: {
    targetEntityId: string;
    relationType: RelationType;
    sourceEntityType: EntityType;
  }): Promise<T[]> {
    const result = await query<CanonicalEntityRow<T>>(
      `
        SELECT source.canonical_json
        FROM ontology_relations relation
        INNER JOIN ontology_entities source
          ON source.entity_id = relation.from_entity_id
        WHERE relation.to_entity_id = $1
          AND relation.relation_type = $2
          AND source.entity_type = $3
        ORDER BY source.entity_updated_at DESC NULLS LAST, source.last_synced_at DESC
      `,
      [input.targetEntityId, input.relationType, input.sourceEntityType],
    );

    return result.rows.map((row) => row.canonical_json);
  }

  async getEntitiesRelatedFromSource<T extends { id: string }>(input: {
    sourceEntityId: string;
    relationType: RelationType;
    targetEntityType: EntityType;
  }): Promise<T[]> {
    const result = await query<CanonicalEntityRow<T>>(
      `
        SELECT target.canonical_json
        FROM ontology_relations relation
        INNER JOIN ontology_entities target
          ON target.entity_id = relation.to_entity_id
        WHERE relation.from_entity_id = $1
          AND relation.relation_type = $2
          AND target.entity_type = $3
        ORDER BY target.entity_updated_at DESC NULLS LAST, target.last_synced_at DESC
      `,
      [input.sourceEntityId, input.relationType, input.targetEntityType],
    );

    return result.rows.map((row) => row.canonical_json);
  }

  async listLeads(opts: ListOptions = {}): Promise<Lead[]> {
    return listEntities<Lead>("lead", opts);
  }

  async listDeals(opts: ListOptions = {}): Promise<Deal[]> {
    return listEntities<Deal>("deal", opts);
  }

  async listAccounts(opts: ListOptions = {}): Promise<Account[]> {
    return listEntities<Account>("account", opts);
  }

  async listContacts(opts: ListOptions = {}): Promise<Contact[]> {
    return listEntities<Contact>("contact", opts);
  }

  async listActivities(opts: ListOptions = {}): Promise<Activity[]> {
    return listEntities<Activity>("activity", opts);
  }

  async listSalesOrders(opts: ListOptions = {}): Promise<SalesOrder[]> {
    return listEntities<SalesOrder>("sales_order", opts);
  }

  async listBuilds(opts: ListOptions = {}): Promise<Build[]> {
    return listEntities<Build>("build", opts);
  }

  async listProducts(opts: ListOptions = {}): Promise<Product[]> {
    return listEntities<Product>("product", opts);
  }

  async listInventoryItems(opts: ListOptions = {}): Promise<InventoryItem[]> {
    return listEntities<InventoryItem>("inventory_item", opts);
  }

  async countByField(
    entityType: string,
    field: string,
    opts: CountByFieldOptions = {},
  ): Promise<CountByFieldRow[]> {
    // Field name is not user-supplied at runtime — it comes from our own tool
    // definitions, so interpolation is safe here. We validate it is alphanumeric
    // with underscores to be explicit.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }

    type CountRow = { value: string | null; count: string };

    const params: unknown[] = [entityType];
    const conditions: string[] = [
      "entity_type = $1",
      `canonical_json->>'${field}' IS NOT NULL`,
    ];

    if (opts.stage) {
      params.push(opts.stage);
      conditions.push(`canonical_json->>'stage' = $${params.length}`);
    }

    if (opts.status) {
      params.push(opts.status);
      conditions.push(`canonical_json->>'status' = $${params.length}`);
    }

    if (opts.period === "this_month") {
      conditions.push(
        `COALESCE(entity_created_at, entity_updated_at, created_at) >= date_trunc('month', CURRENT_TIMESTAMP)`,
      );
    }

    const result = await query<CountRow>(
      `
        SELECT
          canonical_json->>'${field}' AS value,
          COUNT(*)::text AS count
        FROM ontology_entities
        WHERE ${conditions.join(" AND ")}
        GROUP BY canonical_json->>'${field}'
        ORDER BY COUNT(*) DESC
        LIMIT 50
      `,
      params,
    );

    return result.rows
      .filter((row): row is { value: string; count: string } => row.value !== null)
      .map((row) => ({ value: row.value, count: Number(row.count) }));
  }
}

async function getEntityById<T>(
  id: string,
  entityType: string,
): Promise<T | null> {
  const result = await query<CanonicalEntityRow<T>>(
    `
      SELECT canonical_json
      FROM ontology_entities
      WHERE entity_id = $1
        AND entity_type = $2
      LIMIT 1
    `,
    [id, entityType],
  );

  return result.rows[0]?.canonical_json ?? null;
}

async function getEntitiesByIds<T>(
  ids: string[],
  entityType: string,
): Promise<T[]> {
  if (ids.length === 0) {
    return [];
  }

  const result = await query<CanonicalEntityRow<T>>(
    `
      SELECT canonical_json
      FROM ontology_entities
      WHERE entity_id = ANY($1::text[])
        AND entity_type = $2
    `,
    [ids, entityType],
  );

  const entityById = new Map<string, T>();

  for (const row of result.rows) {
    const entity = row.canonical_json as T & { id?: string };

    if (typeof entity.id === "string") {
      entityById.set(entity.id, row.canonical_json);
    }
  }

  return ids
    .map((id) => entityById.get(id))
    .filter((entity): entity is T => Boolean(entity));
}

async function getRelatedEntities<T>(
  fromEntityId: string,
  relationType: string,
  targetEntityType: string,
): Promise<T[]> {
  const result = await query<CanonicalEntityRow<T>>(
    `
      SELECT target.canonical_json
      FROM ontology_relations relation
      INNER JOIN ontology_entities target
        ON target.entity_id = relation.to_entity_id
      WHERE relation.from_entity_id = $1
        AND relation.relation_type = $2
        AND target.entity_type = $3
      ORDER BY target.entity_updated_at DESC NULLS LAST, target.last_synced_at DESC
    `,
    [fromEntityId, relationType, targetEntityType],
  );

  return result.rows.map((row) => row.canonical_json);
}

async function hydrateSalesOrders(
  store: PostgresEntityStore,
  salesOrderIds: string[],
): Promise<SalesOrderReadModel[]> {
  const hydratedSalesOrders = await Promise.all(
    salesOrderIds.map((salesOrderId) => store.getSalesOrderById(salesOrderId)),
  );

  return hydratedSalesOrders.filter(
    (salesOrder): salesOrder is SalesOrderReadModel => Boolean(salesOrder),
  );
}

async function listEntities<T>(
  entityType: string,
  opts: ListOptions,
): Promise<T[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const params: unknown[] = [entityType, limit];
  const conditions: string[] = ["entity_type = $1"];

  if (opts.stage) {
    params.push(opts.stage);
    conditions.push(`canonical_json->>'stage' = $${params.length}`);
  }

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`canonical_json->>'status' = $${params.length}`);
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`canonical_json::text ILIKE $${params.length}`);
  }

  if (opts.period === "this_month") {
    conditions.push(
      `COALESCE(entity_created_at, entity_updated_at, created_at) >= date_trunc('month', CURRENT_TIMESTAMP)`,
    );
  }

  const where = conditions.join(" AND ");

  const result = await query<CanonicalEntityRow<T>>(
    `
      SELECT canonical_json
      FROM ontology_entities
      WHERE ${where}
      ORDER BY entity_updated_at DESC NULLS LAST, last_synced_at DESC
      LIMIT $2
    `,
    params,
  );

  return result.rows.map((row) => row.canonical_json);
}

function relationTypesForActivityTarget(entityType: EntityType): RelationType[] {
  switch (entityType) {
    case "lead":
    case "deal":
    case "sales_order":
      return ["related_to"];
    case "contact":
      return ["linked_to_contact"];
    case "account":
      return ["belongs_to_account"];
    default:
      return [];
  }
}
