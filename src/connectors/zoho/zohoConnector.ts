import type { BaseConnector } from "../base/Connector";
import type {
  ConnectorConnection,
  SyncCheckpoint,
  SyncRequest,
  SyncResult,
} from "../base/types";
import type { InternalEntity } from "../../ontology/entities";
import { FileZohoTokenStore, getZohoOAuthConfigFromEnv } from "./auth";
import { mapZohoRecordToInternal } from "./mapper";
import { ZohoClient, type ZohoClientConfig, type ZohoRecord } from "./client";

export interface ZohoConnectorConfig {
  client?: ZohoClient;
  clientConfig?: ZohoClientConfig;
}

export class ZohoConnector implements BaseConnector<ZohoRecord> {
  readonly name = "zoho" as const;
  private readonly client: ZohoClient;

  constructor(config: ZohoConnectorConfig = {}) {
    this.client =
      config.client ??
      new ZohoClient({
        oauthConfig: getZohoOAuthConfigFromEnv(),
        tokenStore: new FileZohoTokenStore(),
        ...config.clientConfig,
      });
  }

  async connect(): Promise<ConnectorConnection> {
    const isReady = await this.client.verifyConnection();

    if (!isReady) {
      return {
        connector: this.name,
        status: "degraded",
        message:
          "Zoho connector is not configured yet. Set ZOHO_ACCESS_TOKEN before running real syncs.",
      };
    }

    return {
      connector: this.name,
      status: "ready",
    };
  }

  async syncFull(): Promise<SyncResult> {
    const records = await this.client.fetchFullDataset();
    return this.buildSyncResult("full", records);
  }

  async syncIncremental(checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    const records = await this.client.fetchIncrementalDataset(
      checkpoint?.cursor?.value,
    );
    return this.buildSyncResult("incremental", records, checkpoint);
  }

  mapToInternal(record: ZohoRecord): InternalEntity[] {
    return mapZohoRecordToInternal(record);
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
        warnings: [connection.message ?? "Connector is not ready."],
      };
    }

    if (request.mode === "full") {
      return this.syncFull();
    }

    return this.syncIncremental(request.checkpoint);
  }

  private buildSyncResult(
    mode: "full" | "incremental",
    records: ZohoRecord[],
    checkpoint?: SyncCheckpoint,
  ): SyncResult {
    const startedAt = new Date().toISOString();
    const entities = records.flatMap((record) => this.mapToInternal(record));
    const latestModifiedTime = records
      .map((record) => record.modifiedTime)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const completedAt = new Date().toISOString();

    return {
      connector: this.name,
      mode,
      startedAt,
      completedAt,
      recordsFetched: records.length,
      recordsMapped: entities.length,
      entities,
      nextCheckpoint: latestModifiedTime
        ? {
            connector: this.name,
            cursor: {
              value: latestModifiedTime,
              updatedAt: completedAt,
            },
            lastSuccessfulSyncAt: completedAt,
          }
        : checkpoint,
      warnings: [
        "Zoho sync is scaffolded only. Add authenticated fetches, pagination, and persistence next.",
      ],
    };
  }
}
