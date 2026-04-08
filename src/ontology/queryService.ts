import { query } from "../db/client";
import { PostgresEntityStore } from "../storage/postgresEntityStore";
import type { SalesOrderReadModel } from "../ai/types";
import type {
  Account,
  Activity,
  Contact,
  Deal,
  Document,
  EntityType,
  Lead,
} from "./entities";
import type { RelationType } from "./relations";

type CountRow = {
  key: string;
  count: string;
};

type SyncRunRow = {
  id: number;
  connector: string;
  mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_fetched: number | null;
  records_mapped: number | null;
  entities_persisted: number | null;
  relations_persisted: number | null;
  error_message: string | null;
};

type SearchEntityRow = {
  entity_id: string;
  entity_type: string;
  canonical_json: Record<string, unknown>;
  entity_updated_at: string | null;
};

type RelationCountRow = {
  relation_type: RelationType;
  count: string;
};

type GraphNeighborRow = {
  relation_type: RelationType;
  related_entity_id: string;
  related_entity_type: string;
  canonical_json: Record<string, unknown>;
  entity_updated_at: string | null;
};

export interface LeadContext {
  lead: Lead;
  convertedContact: Contact | null;
  convertedAccount: Account | null;
  convertedDeal: Deal | null;
  relatedSalesOrders: SalesOrderReadModel[];
  recentActivities: Activity[];
}

export interface AccountContext {
  account: Account;
  contacts: Contact[];
  deals: Deal[];
  salesOrders: SalesOrderReadModel[];
  recentActivities: Activity[];
}

export interface DealContext {
  deal: Deal;
  account: Account | null;
  contact: Contact | null;
  salesOrders: SalesOrderReadModel[];
  recentActivities: Activity[];
}

export interface OntologyStatusSummary {
  entityCounts: Array<{ entityType: string; count: number }>;
  relationCounts: Array<{ relationType: string; count: number }>;
  recentSyncRuns: Array<{
    id: number;
    connector: string;
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    recordsFetched: number | null;
    recordsMapped: number | null;
    entitiesPersisted: number | null;
    relationsPersisted: number | null;
    errorMessage: string | null;
  }>;
}

export interface KnowledgeSearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  updatedAt: string | null;
}

export interface FunnelSummary {
  leadStages: Array<{ value: string; count: number }>;
  dealStages: Array<{ value: string; count: number }>;
  salesOrderStatuses: Array<{ value: string; count: number }>;
  relationCounts: Array<{ relationType: RelationType; count: number }>;
}

export interface EntityRelationSummary {
  relationType: RelationType;
  direction: "incoming" | "outgoing";
  entity: KnowledgeSearchResult;
}

export interface EntityGraphContext {
  entity: KnowledgeSearchResult;
  outgoing: EntityRelationSummary[];
  incoming: EntityRelationSummary[];
}

export class OntologyQueryService {
  constructor(private readonly entityStore = new PostgresEntityStore()) {}

  async getLeadContext(leadId: string): Promise<LeadContext | null> {
    const lead = await this.entityStore.getLeadById(leadId);

    if (!lead) {
      return null;
    }

    const [convertedContact, convertedAccount, convertedDeal, recentActivities] =
      await Promise.all([
        lead.convertedContactId
          ? this.entityStore.getContactById(lead.convertedContactId)
          : Promise.resolve(null),
        lead.convertedAccountId
          ? this.entityStore.getAccountById(lead.convertedAccountId)
          : Promise.resolve(null),
        lead.convertedDealId
          ? this.entityStore.getDealById(lead.convertedDealId)
          : Promise.resolve(null),
        this.entityStore.getRelatedActivities({
          entityId: leadId,
          entityType: "lead",
          limit: 10,
        }),
      ]);

    const relatedSalesOrders =
      convertedDeal?.id
        ? await this.entityStore.getSalesOrdersForDeal(convertedDeal.id)
        : [];

    return {
      lead,
      convertedContact,
      convertedAccount,
      convertedDeal,
      relatedSalesOrders,
      recentActivities,
    };
  }

  async getAccountContext(accountId: string): Promise<AccountContext | null> {
    const account = await this.entityStore.getAccountById(accountId);

    if (!account) {
      return null;
    }

    const [contacts, deals, salesOrders, recentActivities] = await Promise.all([
      this.entityStore.getEntitiesRelatedToTarget<Contact>({
        targetEntityId: accountId,
        relationType: "belongs_to_account",
        sourceEntityType: "contact",
      }),
      this.entityStore.getEntitiesRelatedToTarget<Deal>({
        targetEntityId: accountId,
        relationType: "belongs_to_account",
        sourceEntityType: "deal",
      }),
      this.entityStore.getSalesOrdersForAccount(accountId),
      this.entityStore.getRelatedActivities({
        entityId: accountId,
        entityType: "account",
        limit: 10,
      }),
    ]);

    return {
      account,
      contacts,
      deals,
      salesOrders,
      recentActivities,
    };
  }

  async getDealContext(dealId: string): Promise<DealContext | null> {
    const deal = await this.entityStore.getDealById(dealId);

    if (!deal) {
      return null;
    }

    const [account, contact, salesOrders, recentActivities] = await Promise.all([
      deal.accountId
        ? this.entityStore.getAccountById(deal.accountId)
        : Promise.resolve(null),
      deal.contactId
        ? this.entityStore.getContactById(deal.contactId)
        : Promise.resolve(null),
      this.entityStore.getSalesOrdersForDeal(dealId),
      this.entityStore.getRelatedActivities({
        entityId: dealId,
        entityType: "deal",
        limit: 10,
      }),
    ]);

    return {
      deal,
      account,
      contact,
      salesOrders,
      recentActivities,
    };
  }

  async getSalesOrder(salesOrderId: string): Promise<SalesOrderReadModel | null> {
    return this.entityStore.getSalesOrderById(salesOrderId);
  }

  async searchDocuments(queryText: string, limit = 10): Promise<Document[]> {
    return this.entityStore.searchDocuments(queryText, limit);
  }

  async searchKnowledge(
    queryText: string,
    limit = 6,
  ): Promise<KnowledgeSearchResult[]> {
    const normalizedLimit = Math.max(1, Math.min(limit, 12));
    const searchTerm = `%${queryText}%`;
    const exactTerm = queryText.trim().toLowerCase();
    const result = await query<SearchEntityRow>(
      `
        SELECT
          entity_id,
          entity_type,
          canonical_json,
          entity_updated_at
        FROM ontology_entities
        WHERE canonical_json::text ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(canonical_json->>'name', canonical_json->>'subject', canonical_json->>'fullName', canonical_json->>'title', '')) = $3 THEN 0
            WHEN LOWER(COALESCE(canonical_json->>'name', canonical_json->>'subject', canonical_json->>'fullName', canonical_json->>'title', '')) LIKE $4 THEN 1
            ELSE 2
          END,
          entity_updated_at DESC NULLS LAST,
          last_synced_at DESC
        LIMIT $2
      `,
      [searchTerm, normalizedLimit, exactTerm, `${exactTerm}%`],
    );

    return result.rows.map((row) => ({
      id: row.entity_id,
      type: row.entity_type,
      title: resolveEntityTitle(row.entity_type, row.canonical_json),
      snippet: buildSnippet(row.canonical_json),
      updatedAt: row.entity_updated_at,
    }));
  }

  async getFunnelSummary(): Promise<FunnelSummary> {
    const [leadStages, dealStages, salesOrderStatuses, relationCountsResult] =
      await Promise.all([
        this.entityStore.countByField("lead", "stage"),
        this.entityStore.countByField("deal", "stage"),
        this.entityStore.countByField("sales_order", "status"),
        query<RelationCountRow>(
          `
            SELECT relation_type, COUNT(*)::text AS count
            FROM ontology_relations
            WHERE relation_type IN (
              'converted_to_contact',
              'converted_to_account',
              'converted_to_deal',
              'results_in_sales_order'
            )
            GROUP BY relation_type
            ORDER BY relation_type ASC
          `,
        ),
      ]);

    return {
      leadStages,
      dealStages,
      salesOrderStatuses,
      relationCounts: relationCountsResult.rows.map((row) => ({
        relationType: row.relation_type,
        count: Number(row.count),
      })),
    };
  }

  async getEntityGraph(
    entityId: string,
    limit = 12,
  ): Promise<EntityGraphContext | null> {
    const entity = await this.getEntitySummary(entityId);

    if (!entity) {
      return null;
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 30));
    const [outgoingResult, incomingResult] = await Promise.all([
      query<GraphNeighborRow>(
        `
          SELECT
            relation.relation_type,
            target.entity_id AS related_entity_id,
            target.entity_type AS related_entity_type,
            target.canonical_json,
            target.entity_updated_at
          FROM ontology_relations relation
          INNER JOIN ontology_entities target
            ON target.entity_id = relation.to_entity_id
          WHERE relation.from_entity_id = $1
          ORDER BY target.entity_updated_at DESC NULLS LAST, target.last_synced_at DESC
          LIMIT $2
        `,
        [entityId, normalizedLimit],
      ),
      query<GraphNeighborRow>(
        `
          SELECT
            relation.relation_type,
            source.entity_id AS related_entity_id,
            source.entity_type AS related_entity_type,
            source.canonical_json,
            source.entity_updated_at
          FROM ontology_relations relation
          INNER JOIN ontology_entities source
            ON source.entity_id = relation.from_entity_id
          WHERE relation.to_entity_id = $1
          ORDER BY source.entity_updated_at DESC NULLS LAST, source.last_synced_at DESC
          LIMIT $2
        `,
        [entityId, normalizedLimit],
      ),
    ]);

    return {
      entity,
      outgoing: outgoingResult.rows.map((row) => ({
        relationType: row.relation_type,
        direction: "outgoing",
        entity: mapKnowledgeResultRow(row),
      })),
      incoming: incomingResult.rows.map((row) => ({
        relationType: row.relation_type,
        direction: "incoming",
        entity: mapKnowledgeResultRow(row),
      })),
    };
  }

  async getEntitySummary(entityId: string): Promise<KnowledgeSearchResult | null> {
    const result = await query<SearchEntityRow>(
      `
        SELECT
          entity_id,
          entity_type,
          canonical_json,
          entity_updated_at
        FROM ontology_entities
        WHERE entity_id = $1
        LIMIT 1
      `,
      [entityId],
    );

    const row = result.rows[0];

    return row ? mapKnowledgeResultRow(row) : null;
  }

  async getStatusSummary(): Promise<OntologyStatusSummary> {
    const [entityCountsResult, relationCountsResult, recentSyncRunsResult] =
      await Promise.all([
        query<CountRow>(
          `
            SELECT entity_type AS key, COUNT(*)::text AS count
            FROM ontology_entities
            GROUP BY entity_type
            ORDER BY entity_type ASC
          `,
        ),
        query<CountRow>(
          `
            SELECT relation_type AS key, COUNT(*)::text AS count
            FROM ontology_relations
            GROUP BY relation_type
            ORDER BY relation_type ASC
          `,
        ),
        query<SyncRunRow>(
          `
            SELECT
              id,
              connector,
              mode,
              status,
              started_at,
              completed_at,
              records_fetched,
              records_mapped,
              entities_persisted,
              relations_persisted,
              error_message
            FROM sync_runs
            ORDER BY started_at DESC
            LIMIT 10
          `,
        ),
      ]);

    return {
      entityCounts: entityCountsResult.rows.map((row) => ({
        entityType: row.key,
        count: Number(row.count),
      })),
      relationCounts: relationCountsResult.rows.map((row) => ({
        relationType: row.key,
        count: Number(row.count),
      })),
      recentSyncRuns: recentSyncRunsResult.rows.map((row) => ({
        id: row.id,
        connector: row.connector,
        mode: row.mode,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        recordsFetched: row.records_fetched,
        recordsMapped: row.records_mapped,
        entitiesPersisted: row.entities_persisted,
        relationsPersisted: row.relations_persisted,
        errorMessage: row.error_message,
      })),
    };
  }
}

function mapKnowledgeResultRow(
  row:
    | SearchEntityRow
    | {
        related_entity_id: string;
        related_entity_type: string;
        canonical_json: Record<string, unknown>;
        entity_updated_at: string | null;
      },
): KnowledgeSearchResult {
  const id = "entity_id" in row ? row.entity_id : row.related_entity_id;
  const type =
    "entity_type" in row ? row.entity_type : row.related_entity_type;

  return {
    id,
    type,
    title: resolveEntityTitle(type, row.canonical_json),
    snippet: buildSnippet(row.canonical_json),
    updatedAt: row.entity_updated_at,
  };
}

function resolveEntityTitle(
  entityType: string,
  canonicalJson: Record<string, unknown>,
): string {
  const titleFields = ["name", "subject", "fullName", "title"];

  for (const field of titleFields) {
    const value = canonicalJson[field];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return `${entityType} ${String(canonicalJson.id ?? "").trim()}`.trim();
}

function buildSnippet(canonicalJson: Record<string, unknown>): string {
  const snippetFields = [
    "stage",
    "status",
    "leadSource",
    "campaignName",
    "nextStep",
    "pipeline",
    "summary",
    "textPreview",
  ];

  const parts = snippetFields
    .map((field) => canonicalJson[field])
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .slice(0, 3);

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  return JSON.stringify(canonicalJson).slice(0, 220);
}

type RelatedActivityInput = {
  entityId: string;
  entityType: EntityType;
  limit?: number;
};

type RelatedToTargetInput = {
  targetEntityId: string;
  relationType: RelationType;
  sourceEntityType: EntityType;
};

declare module "../storage/postgresEntityStore" {
  interface PostgresEntityStore {
    getContactById(id: string): Promise<Contact | null>;
    getRelatedActivities(input: RelatedActivityInput): Promise<Activity[]>;
    getSalesOrdersForDeal(dealId: string): Promise<SalesOrderReadModel[]>;
    getSalesOrdersForAccount(accountId: string): Promise<SalesOrderReadModel[]>;
    getEntitiesRelatedToTarget<T>(input: RelatedToTargetInput): Promise<T[]>;
    getEntitiesRelatedFromSource<T>(input: {
      sourceEntityId: string;
      relationType: RelationType;
      targetEntityType: EntityType;
    }): Promise<T[]>;
  }
}
