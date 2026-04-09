import { isDatabaseConfigured, query as queryOntology } from "../../db/client";
import { deriveRelationsFromEntities } from "../../ontology/deriveRelations";
import type { Build } from "../../ontology/entities";
import type { EntityRelation } from "../../ontology/relations";
import { PostgresSyncCheckpointStore } from "../../storage/postgresSyncCheckpointStore";
import { PostgresOntologyStore } from "../../storage/postgresOntologyStore";
import { InMemorySyncCheckpointStore } from "../../sync/checkpoints";
import { planSyncJob, runSyncJob, type SyncJobSummary } from "../../sync/jobs";
import type { SyncMode, SyncResult } from "../base/types";
import { getWalnutConnectionStatus } from "./client";
import { WalnutConnector } from "./walnutConnector";

export interface WalnutSyncResponse {
  plan: SyncJobSummary;
  result: SyncResult;
}

const checkpointStore = new InMemorySyncCheckpointStore();
const persistentCheckpointStore = new PostgresSyncCheckpointStore();
const walnutCoverage =
  "Walnut database connector. Reads directly from Walnut Postgres and maps selected Walnut tables into the shared ontology.";

export function createWalnutConnector() {
  return new WalnutConnector();
}

export function getWalnutCoverageSummary() {
  return walnutCoverage;
}

export { getWalnutConnectionStatus };

export async function runWalnutSync(
  mode: SyncMode,
): Promise<WalnutSyncResponse> {
  const connector = createWalnutConnector();
  const ontologyStore = isDatabaseConfigured() ? new PostgresOntologyStore() : null;
  const activeCheckpointStore = ontologyStore
    ? persistentCheckpointStore
    : checkpointStore;
  let syncRunId: number | undefined;

  if (ontologyStore) {
    syncRunId = await ontologyStore.startSyncRun({
      connector: "walnut",
      mode,
    });
  }

  const plan = await planSyncJob(connector, mode);

  if (plan.status !== "ready") {
    if (ontologyStore && syncRunId) {
      await ontologyStore.failSyncRun({
        syncRunId,
        errorMessage: plan.reason ?? "Walnut connector is not ready.",
      });
    }

    throw new Error(plan.reason ?? "Walnut connector is not ready.");
  }

  try {
    const result = await runSyncJob({
      connector,
      mode,
      checkpointStore: activeCheckpointStore,
    });

    if (ontologyStore) {
      const relations = [
        ...deriveRelationsFromEntities(result.entities),
        ...(await deriveWalnutCrossSystemRelations(result.entities)),
      ];
      const persistence = await ontologyStore.persistSyncArtifacts({
        syncRunId,
        result,
        sourceRecords: connector.consumeLastSourceRecords(),
        relations,
      });

      if (syncRunId) {
        await ontologyStore.completeSyncRun({
          syncRunId,
          result,
          persistence,
        });
      }

      result.syncRunId = persistence.syncRunId;
      result.sourceRecordsPersisted = persistence.sourceRecordsPersisted;
      result.entitiesPersisted = persistence.entitiesPersisted;
      result.relationsPersisted = persistence.relationsPersisted;
    }

    return {
      plan,
      result,
    };
  } catch (error) {
    if (ontologyStore && syncRunId) {
      await ontologyStore.failSyncRun({
        syncRunId,
        errorMessage:
          error instanceof Error ? error.message : "Walnut sync failed.",
      });
    }

    throw error;
  }
}

async function deriveWalnutCrossSystemRelations(
  entities: SyncResult["entities"],
): Promise<EntityRelation[]> {
  const builds = entities.filter(
    (entity): entity is Build =>
      entity.type === "build" &&
      typeof entity.orderNumber === "string" &&
      entity.orderNumber.trim().length > 0,
  );

  if (builds.length === 0) {
    return [];
  }

  type SalesOrderMatchRow = {
    entity_id: string;
    order_number: string;
  };

  const orderNumbers = [...new Set(builds.map((build) => build.orderNumber!.trim()))];
  const result = await queryOntology<SalesOrderMatchRow>(
    `
      SELECT
        entity_id,
        canonical_json->>'orderNumber' AS order_number
      FROM ontology_entities
      WHERE entity_type = 'sales_order'
        AND source = 'zoho'
        AND canonical_json->>'orderNumber' = ANY($1::text[])
    `,
    [orderNumbers],
  );

  const salesOrdersByOrderNumber = new Map<string, string[]>();

  for (const row of result.rows) {
    const current = salesOrdersByOrderNumber.get(row.order_number) ?? [];
    current.push(row.entity_id);
    salesOrdersByOrderNumber.set(row.order_number, current);
  }

  return builds.flatMap((build) => {
    const matchingSalesOrderIds = salesOrdersByOrderNumber.get(
      build.orderNumber!.trim(),
    );

    if (!matchingSalesOrderIds?.length) {
      return [];
    }

    return matchingSalesOrderIds.map(
      (salesOrderId): EntityRelation => ({
        type: "fulfills_sales_order",
        fromEntityType: "build",
        fromEntityId: build.id,
        toEntityType: "sales_order",
        toEntityId: salesOrderId,
        source: "walnut",
        metadata: {
          match_type: "order_number",
          order_number: build.orderNumber ?? null,
        },
      }),
    );
  });
}
