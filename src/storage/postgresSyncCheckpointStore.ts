import type { SyncCheckpointStore } from "../sync/checkpoints";
import type { ConnectorName, SyncCheckpoint } from "../connectors/base/types";
import { query } from "../db/client";

export class PostgresSyncCheckpointStore implements SyncCheckpointStore {
  async get(connector: ConnectorName): Promise<SyncCheckpoint | null> {
    const result = await query<{
      connector: string;
      cursor_value: string | null;
      cursor_updated_at: Date | null;
      last_successful_sync_at: Date | null;
    }>(
      `
        SELECT connector, cursor_value, cursor_updated_at, last_successful_sync_at
        FROM sync_checkpoints
        WHERE connector = $1
      `,
      [connector],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      connector: row.connector,
      cursor: row.cursor_value
        ? {
            value: row.cursor_value,
            updatedAt: row.cursor_updated_at?.toISOString() ?? new Date().toISOString(),
          }
        : undefined,
      lastSuccessfulSyncAt: row.last_successful_sync_at?.toISOString() ?? undefined,
    };
  }

  async set(checkpoint: SyncCheckpoint): Promise<void> {
    await query(
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
        checkpoint.connector,
        checkpoint.cursor?.value ?? null,
        checkpoint.cursor?.updatedAt ?? null,
        checkpoint.lastSuccessfulSyncAt ?? null,
      ],
    );
  }
}
