import { isDatabaseConfigured } from "../../db/client";
import { deriveRelationsFromEntities } from "../../ontology/deriveRelations";
import { PostgresSyncCheckpointStore } from "../../storage/postgresSyncCheckpointStore";
import { PostgresOntologyStore } from "../../storage/postgresOntologyStore";
import { InMemorySyncCheckpointStore } from "../../sync/checkpoints";
import { planSyncJob, runSyncJob, type SyncJobSummary } from "../../sync/jobs";
import type { SyncMode, SyncResult } from "../base/types";
import { FileZohoTokenStore, getValidZohoTokens, getZohoOAuthConfigFromEnv } from "./auth";
import { ZohoClient } from "./client";
import { getZohoRawSamples, type ZohoRawSampleResult } from "./rawSamples";
import { ZohoConnector } from "./zohoConnector";

export interface ZohoConnectionStatus {
  connected: boolean;
  reachable: boolean;
  apiDomain?: string;
  expiresAt?: string;
  hasRefreshToken?: boolean;
  availableModuleCount?: number;
  availableModules?: string[];
  syncModuleCounts?: Awaited<ReturnType<ZohoClient["fetchSyncModuleCounts"]>>;
  authUrl?: string;
}

export interface ZohoSyncResponse {
  plan: SyncJobSummary;
  result: SyncResult;
}

const checkpointStore = new InMemorySyncCheckpointStore();
const persistentCheckpointStore = new PostgresSyncCheckpointStore();
const zohoCoverage =
  "Sync coverage: Leads, Contacts, Accounts, Deals, Campaigns, Sales Orders, Tasks, Calls, and Events.";
const zohoScopes = "ZohoCRM.modules.ALL,ZohoCRM.settings.modules.READ";

export function createZohoTokenStore() {
  return new FileZohoTokenStore();
}

export function createZohoClient() {
  return new ZohoClient({
    accessToken: process.env.ZOHO_ACCESS_TOKEN,
    oauthConfig: getZohoOAuthConfigFromEnv(),
    tokenStore: createZohoTokenStore(),
  });
}

export function createZohoConnector() {
  return new ZohoConnector({
    client: createZohoClient(),
  });
}

export function getZohoCoverageSummary() {
  return zohoCoverage;
}

export function getZohoAuthUrl(): string | null {
  const clientId =
    process.env.NEXT_PUBLIC_ZOHO_CLIENT_ID ?? process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return null;
  }

  const params = new URLSearchParams({
    scope: zohoScopes,
    client_id: clientId,
    response_type: "code",
    access_type: "offline",
    redirect_uri: redirectUri,
  });

  return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
}

export async function getZohoConnectionStatus(): Promise<ZohoConnectionStatus> {
  const tokenStore = createZohoTokenStore();
  const tokens = await getValidZohoTokens({
    store: tokenStore,
  }).catch(() => null);

  if (!tokens) {
    return {
      connected: false,
      reachable: false,
      authUrl: getZohoAuthUrl() ?? undefined,
    };
  }

  const client = createZohoClient();
  const reachable = await client.verifyConnection();
  const availableModules = reachable
    ? await client.fetchAvailableModules().catch(() => [])
    : [];
  const syncModuleCounts = reachable
    ? await client.fetchSyncModuleCounts().catch(() => [])
    : [];

  return {
    connected: true,
    reachable,
    apiDomain: tokens.apiDomain,
    expiresAt: tokens.expiresAt,
    hasRefreshToken: Boolean(tokens.refreshToken),
    availableModuleCount: availableModules.length,
    availableModules: availableModules.map((moduleInfo) => moduleInfo.apiName),
    syncModuleCounts,
  };
}

export async function runZohoSync(mode: SyncMode): Promise<ZohoSyncResponse> {
  const connector = createZohoConnector();
  const ontologyStore = isDatabaseConfigured() ? new PostgresOntologyStore() : null;
  const activeCheckpointStore = ontologyStore
    ? persistentCheckpointStore
    : checkpointStore;
  let syncRunId: number | undefined;

  if (ontologyStore) {
    syncRunId = await ontologyStore.startSyncRun({
      connector: "zoho",
      mode,
    });
  }

  const plan = await planSyncJob(connector, mode);

  if (plan.status !== "ready") {
    if (ontologyStore && syncRunId) {
      await ontologyStore.failSyncRun({
        syncRunId,
        errorMessage: plan.reason ?? "Zoho connector is not ready.",
      });
    }

    throw new Error(plan.reason ?? "Zoho connector is not ready.");
  }

  try {
    const result = await runSyncJob({
      connector,
      mode,
      checkpointStore: activeCheckpointStore,
    });

    if (ontologyStore) {
      const persistence = await ontologyStore.persistSyncArtifacts({
        syncRunId,
        result,
        sourceRecords: connector.consumeLastSourceRecords(),
        relations: deriveRelationsFromEntities(result.entities),
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
          error instanceof Error ? error.message : "Zoho sync failed.",
      });
    }

    throw error;
  }
}

export async function getZohoSamples(
  modules?: string[],
): Promise<ZohoRawSampleResult[]> {
  return getZohoRawSamples(modules);
}
