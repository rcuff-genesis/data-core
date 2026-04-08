import type { PoolClient } from "pg";
import type { SyncResult } from "../connectors/base/types";
import { getDatabaseClient } from "../db/client";
import type { InternalEntity } from "../ontology/entities";
import type { EntityRelation } from "../ontology/relations";
import type {
  OntologyStore,
  PersistenceSummary,
  SourceRecordSnapshot,
  SyncRunCompleteInput,
  SyncRunFailureInput,
  SyncRunStartInput,
} from "./types";

const CHUNK_SIZE = 100;

export class PostgresOntologyStore implements OntologyStore {
  async startSyncRun(input: SyncRunStartInput): Promise<number> {
    const result = await withTransaction(async (client) => {
      const insertResult = await client.query<{ id: number }>(
        `
          INSERT INTO sync_runs (connector, mode, status, started_at)
          VALUES ($1, $2, 'running', NOW())
          RETURNING id
        `,
        [input.connector, input.mode],
      );

      return insertResult.rows[0].id;
    });

    return result;
  }

  async completeSyncRun(input: SyncRunCompleteInput): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE sync_runs
          SET
            status = 'completed',
            completed_at = $2,
            records_fetched = $3,
            records_mapped = $4,
            source_records_persisted = $5,
            entities_persisted = $6,
            relations_persisted = $7,
            warnings = $8::jsonb
          WHERE id = $1
        `,
        [
          input.syncRunId,
          input.result.completedAt,
          input.result.recordsFetched,
          input.result.recordsMapped,
          input.persistence.sourceRecordsPersisted,
          input.persistence.entitiesPersisted,
          input.persistence.relationsPersisted,
          JSON.stringify(input.result.warnings),
        ],
      );
    });
  }

  async failSyncRun(input: SyncRunFailureInput): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE sync_runs
          SET
            status = 'failed',
            completed_at = NOW(),
            error_message = $2
          WHERE id = $1
        `,
        [input.syncRunId, input.errorMessage],
      );
    });
  }

  async persistSyncArtifacts(input: {
    syncRunId?: number;
    result: SyncResult;
    sourceRecords: SourceRecordSnapshot[];
    relations: EntityRelation[];
  }): Promise<PersistenceSummary> {
    return withTransaction(async (client) => {
      const entities = dedupeEntities(input.result.entities);
      const relations = dedupeRelations(input.relations);

      const sourceRecordsPersisted = await persistSourceRecords(
        client,
        input.sourceRecords,
        input.syncRunId,
      );
      const entitiesPersisted = await persistEntities(client, entities);
      const relationsPersisted = await persistRelations(client, relations);

      if (input.result.nextCheckpoint) {
        await client.query(
          `
            INSERT INTO sync_checkpoints (
              connector,
              cursor_value,
              cursor_updated_at,
              last_successful_sync_at
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (connector)
            DO UPDATE SET
              cursor_value = EXCLUDED.cursor_value,
              cursor_updated_at = EXCLUDED.cursor_updated_at,
              last_successful_sync_at = EXCLUDED.last_successful_sync_at,
              updated_at = NOW()
          `,
          [
            input.result.nextCheckpoint.connector,
            input.result.nextCheckpoint.cursor?.value ?? null,
            input.result.nextCheckpoint.cursor?.updatedAt ?? null,
            input.result.nextCheckpoint.lastSuccessfulSyncAt ?? null,
          ],
        );
      }

      return {
        syncRunId: input.syncRunId,
        sourceRecordsPersisted,
        entitiesPersisted,
        relationsPersisted,
      };
    });
  }
}

async function persistSourceRecords(
  client: PoolClient,
  sourceRecords: SourceRecordSnapshot[],
  syncRunId?: number,
): Promise<number> {
  let persisted = 0;

  for (const chunk of chunkArray(sourceRecords, CHUNK_SIZE)) {
    if (chunk.length === 0) {
      continue;
    }

    const values: unknown[] = [];
    const placeholders = chunk.map((record, index) => {
      const offset = index * 6;
      values.push(
        record.source,
        record.module,
        record.sourceRecordId,
        record.modifiedAt ?? null,
        JSON.stringify(record.payload),
        syncRunId ?? null,
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::jsonb, $${offset + 6})`;
    });

    await client.query(
      `
        INSERT INTO source_records (
          source,
          source_module,
          source_record_id,
          modified_at,
          payload,
          last_sync_run_id
        )
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (source, source_module, source_record_id)
        DO UPDATE SET
          modified_at = EXCLUDED.modified_at,
          payload = EXCLUDED.payload,
          last_sync_run_id = EXCLUDED.last_sync_run_id,
          last_synced_at = NOW()
      `,
      values,
    );

    persisted += chunk.length;
  }

  return persisted;
}

async function persistEntities(
  client: PoolClient,
  entities: InternalEntity[],
): Promise<number> {
  let persisted = 0;

  for (const chunk of chunkArray(entities, CHUNK_SIZE)) {
    if (chunk.length === 0) {
      continue;
    }

    const values: unknown[] = [];
    const placeholders = chunk.map((entity, index) => {
      const offset = index * 9;
      values.push(
        entity.id,
        entity.type,
        entity.source,
        entity.sourceId,
        entity.sourceStatus ?? null,
        entity.createdAt ?? null,
        entity.updatedAt ?? null,
        JSON.stringify(entity),
        JSON.stringify(entity.sourcePayload ?? null),
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb, $${offset + 9}::jsonb)`;
    });

    await client.query(
      `
        INSERT INTO ontology_entities (
          entity_id,
          entity_type,
          source,
          source_id,
          source_status,
          entity_created_at,
          entity_updated_at,
          canonical_json,
          source_payload
        )
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (entity_id)
        DO UPDATE SET
          entity_type = EXCLUDED.entity_type,
          source = EXCLUDED.source,
          source_id = EXCLUDED.source_id,
          source_status = EXCLUDED.source_status,
          entity_created_at = EXCLUDED.entity_created_at,
          entity_updated_at = EXCLUDED.entity_updated_at,
          canonical_json = EXCLUDED.canonical_json,
          source_payload = EXCLUDED.source_payload,
          last_synced_at = NOW()
      `,
      values,
    );

    persisted += chunk.length;
  }

  return persisted;
}

async function persistRelations(
  client: PoolClient,
  relations: EntityRelation[],
): Promise<number> {
  let persisted = 0;

  for (const chunk of chunkArray(relations, CHUNK_SIZE)) {
    if (chunk.length === 0) {
      continue;
    }

    const values: unknown[] = [];
    const placeholders = chunk.map((relation, index) => {
      const offset = index * 8;
      values.push(
        buildRelationKey(relation),
        relation.type,
        relation.fromEntityId,
        relation.fromEntityType,
        relation.toEntityId,
        relation.toEntityType,
        relation.source,
        JSON.stringify(relation.metadata ?? null),
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`;
    });

    await client.query(
      `
        INSERT INTO ontology_relations (
          relation_key,
          relation_type,
          from_entity_id,
          from_entity_type,
          to_entity_id,
          to_entity_type,
          source,
          metadata
        )
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (relation_key)
        DO UPDATE SET
          relation_type = EXCLUDED.relation_type,
          from_entity_id = EXCLUDED.from_entity_id,
          from_entity_type = EXCLUDED.from_entity_type,
          to_entity_id = EXCLUDED.to_entity_id,
          to_entity_type = EXCLUDED.to_entity_type,
          source = EXCLUDED.source,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW()
      `,
      values,
    );

    persisted += chunk.length;
  }

  return persisted;
}

async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDatabaseClient();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildRelationKey(relation: EntityRelation): string {
  return [
    relation.type,
    relation.fromEntityType,
    relation.fromEntityId,
    relation.toEntityType,
    relation.toEntityId,
  ].join(":");
}

function dedupeEntities(entities: InternalEntity[]): InternalEntity[] {
  const entityMap = new Map<string, InternalEntity>();

  for (const entity of entities) {
    entityMap.set(entity.id, entity);
  }

  return [...entityMap.values()];
}

function dedupeRelations(relations: EntityRelation[]): EntityRelation[] {
  const relationMap = new Map<string, EntityRelation>();

  for (const relation of relations) {
    relationMap.set(buildRelationKey(relation), relation);
  }

  return [...relationMap.values()];
}
