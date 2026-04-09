import type { BaseConnector } from "../base/Connector";
import type {
  ConnectorConnection,
  SyncCheckpoint,
  SyncRequest,
  SyncResult,
} from "../base/types";
import type { InternalEntity } from "../../ontology/entities";
import type { SourceRecordSnapshot } from "../../storage/types";
import { queryWalnut, getWalnutConnectionStatus, type WalnutConnectionStatus } from "./client";
import { mapWalnutRowToInternal, type WalnutSourceRow } from "./mapper";

type WalnutQueryRow = Record<string, unknown>;

export class WalnutConnector implements BaseConnector<WalnutSourceRow> {
  readonly name = "walnut" as const;
  private lastSourceRecords: SourceRecordSnapshot[] = [];

  async connect(): Promise<ConnectorConnection> {
    const status = await getWalnutConnectionStatus();

    if (!status.configured) {
      return {
        connector: this.name,
        status: "degraded",
        message: status.error ?? "Walnut database is not configured.",
      };
    }

    if (!status.reachable) {
      return {
        connector: this.name,
        status: "degraded",
        message: status.error ?? "Could not connect to Walnut.",
      };
    }

    return {
      connector: this.name,
      status: "ready",
    };
  }

  async syncFull(): Promise<SyncResult> {
    const records = await this.fetchWalnutRows();
    return this.buildSyncResult("full", records, []);
  }

  async syncIncremental(_checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    void _checkpoint;

    const records = await this.fetchWalnutRows();
    return this.buildSyncResult("incremental", records, [
      "Walnut does not yet have a consistent incremental cursor, so this sync fell back to a full snapshot.",
    ]);
  }

  mapToInternal(record: WalnutSourceRow): InternalEntity[] {
    return mapWalnutRowToInternal(record);
  }

  consumeLastSourceRecords(): SourceRecordSnapshot[] {
    const records = [...this.lastSourceRecords];
    this.lastSourceRecords = [];
    return records;
  }

  async runSync(request: SyncRequest): Promise<SyncResult> {
    const connection = await this.connect();

    if (connection.status !== "ready") {
      const now = new Date().toISOString();

      return {
        connector: this.name,
        mode: request.mode,
        startedAt: now,
        completedAt: now,
        recordsFetched: 0,
        recordsMapped: 0,
        entities: [],
        nextCheckpoint: request.checkpoint,
        warnings: [connection.message ?? "Walnut connector is not ready."],
      };
    }

    if (request.mode === "full") {
      return this.syncFull();
    }

    return this.syncIncremental(request.checkpoint);
  }

  async getDetailedStatus(): Promise<WalnutConnectionStatus> {
    return getWalnutConnectionStatus();
  }

  private async fetchWalnutRows(): Promise<WalnutSourceRow[]> {
    const [
      partsResult,
      stockResult,
      floorResult,
      buildsResult,
      systemMapResult,
      bomResult,
      partBomResult,
    ] = await Promise.all([
      queryWalnut<WalnutQueryRow>(
        `
          SELECT
            p.part_number,
            p.type,
            p.initial,
            p.model,
            p.description,
            p.date,
            p.country_of_origin,
            p.created_at,
            p.updated_at,
            p.percent_failure,
            s.safety_stock
          FROM part_numbers p
          LEFT JOIN part_safety_stock s
            ON s.part_number = p.part_number
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT
            psl.part_number,
            psl.quantity,
            psl.location,
            s.safety_stock
          FROM part_stock_list psl
          LEFT JOIN part_safety_stock s
            ON s.part_number = psl.part_number
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT
            fi.id,
            fi.serial_number,
            fi.part_number,
            fi.quantity,
            fi.last_updated,
            s.safety_stock
          FROM floor_inventory fi
          LEFT JOIN part_safety_stock s
            ON s.part_number = fi.part_number
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT
            b.*,
            zo.id AS walnut_zoho_order_id,
            zo.order_quantity AS walnut_order_quantity,
            zo.zoho_shipped_synced
          FROM builds b
          LEFT JOIN zoho_orders zo
            ON zo.order_number = b.order_number
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT *
          FROM system_map
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT *
          FROM bom
        `,
      ),
      queryWalnut<WalnutQueryRow>(
        `
          SELECT *
          FROM part_bom
        `,
      ),
    ]);

    return [
      ...partsResult.rows.map((row) => ({ tableName: "part_numbers" as const, row })),
      ...stockResult.rows.map((row) => ({ tableName: "part_stock_list" as const, row })),
      ...floorResult.rows.map((row) => ({ tableName: "floor_inventory" as const, row })),
      ...buildsResult.rows.map((row) => ({ tableName: "builds" as const, row })),
      ...systemMapResult.rows.map((row) => ({ tableName: "system_map" as const, row })),
      ...bomResult.rows.map((row) => ({ tableName: "bom" as const, row })),
      ...partBomResult.rows.map((row) => ({ tableName: "part_bom" as const, row })),
    ];
  }

  private buildSyncResult(
    mode: "full" | "incremental",
    records: WalnutSourceRow[],
    warnings: string[],
  ): SyncResult {
    const startedAt = new Date().toISOString();
    const entities = records.flatMap((record) => this.mapToInternal(record));
    this.lastSourceRecords = records.map((record) => ({
      source: this.name,
      module: record.tableName,
      sourceRecordId: resolveSourceRecordId(record),
      payload: record.row,
      modifiedAt: resolveModifiedAt(record),
    }));
    const completedAt = new Date().toISOString();

    return {
      connector: this.name,
      mode,
      startedAt,
      completedAt,
      recordsFetched: records.length,
      recordsMapped: entities.length,
      entities,
      warnings,
    };
  }
}

function resolveSourceRecordId(record: WalnutSourceRow): string {
  const row = record.row;

  switch (record.tableName) {
    case "part_numbers":
      return stringify(row.part_number) ?? "unknown-part";
    case "part_stock_list":
      return `${stringify(row.part_number) ?? "unknown-part"}:${stringify(row.location) ?? "unknown-location"}`;
    case "floor_inventory":
      return stringify(row.id) ?? `${stringify(row.serial_number) ?? "unknown-serial"}:${stringify(row.part_number) ?? "unknown-part"}`;
    case "builds":
      return stringify(row.id) ?? stringify(row.order_number) ?? "unknown-build";
    case "system_map":
      return stringify(row.id) ?? `${stringify(row.shop_product) ?? "unknown-product"}:${stringify(row.bom_id) ?? "unknown-bom"}`;
    case "bom":
      return stringify(row.id) ?? `${stringify(row.model) ?? "unknown-model"}:${stringify(row.version) ?? "unknown-version"}`;
    case "part_bom":
      return `${stringify(row.bom_id) ?? "unknown-bom"}:${stringify(row.part_number) ?? "unknown-part"}`;
    default:
      return "unknown";
  }
}

function resolveModifiedAt(record: WalnutSourceRow): string | undefined {
  const row = record.row;

  switch (record.tableName) {
    case "part_numbers":
      return stringify(row.updated_at) ?? stringify(row.date);
    case "floor_inventory":
      return stringify(row.last_updated);
    case "builds":
      return stringify(row.start_time);
    case "system_map":
      return undefined;
    case "bom":
      return stringify(row.last_update);
    case "part_bom":
      return undefined;
    default:
      return undefined;
  }
}

function stringify(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return undefined;
}
