import {
  FileZohoTokenStore,
  getZohoOAuthConfigFromEnv,
} from "./auth";
import { ZOHO_SYNC_MODULES, ZohoClient } from "./client";

export interface ZohoRawSampleResult {
  module: string;
  recordId: string | null;
  listSample: unknown | null;
  detailSample: unknown | null;
  error?: string;
}

const DEFAULT_MODULES = [
  "Campaigns",
  "Leads",
  "Contacts",
  "Accounts",
  "Deals",
  "Quotes",
  "Invoices",
  "Sales_Orders",
] as const;

const EXTRA_MODULE_FIELDS: Record<string, string[]> = {
  quotes: [
    "Subject",
    "Quote_Number",
    "Account_Name",
    "Contact_Name",
    "Deal_Name",
    "Grand_Total",
    "Stage",
    "Status",
    "Currency",
    "Owner",
    "Modified_Time",
    "Created_Time",
  ],
  invoices: [
    "Subject",
    "Invoice_Number",
    "Account_Name",
    "Contact_Name",
    "Sales_Order",
    "Grand_Total",
    "Status",
    "Currency",
    "Owner",
    "Modified_Time",
    "Created_Time",
  ],
};

export async function getZohoRawSamples(
  modules: string[] = [...DEFAULT_MODULES],
): Promise<ZohoRawSampleResult[]> {
  const client = new ZohoClient({
    oauthConfig: getZohoOAuthConfigFromEnv(),
    tokenStore: new FileZohoTokenStore(),
  });

  return Promise.all(modules.map((moduleName) => getModuleRawSample(client, moduleName)));
}

async function getModuleRawSample(
  client: ZohoClient,
  moduleName: string,
): Promise<ZohoRawSampleResult> {
  try {
    const fields = resolveFieldsForModule(moduleName);
    const params = new URLSearchParams({
      per_page: "1",
      fields,
    });

    const listResponse = await client.request(`/${moduleName}?${params.toString()}`, {
      method: "GET",
    });

    if (!listResponse.ok) {
      return {
        module: moduleName,
        recordId: null,
        listSample: null,
        detailSample: null,
        error: `Zoho ${moduleName} list fetch failed with status ${listResponse.status}.`,
      };
    }

    const listPayload = (await listResponse.json().catch(() => ({}))) as {
      data?: Array<Record<string, unknown>>;
    };
    const firstRecord = listPayload.data?.[0] ?? null;
    const recordId =
      firstRecord && typeof firstRecord.id === "string" ? firstRecord.id : null;

    if (!recordId) {
      return {
        module: moduleName,
        recordId: null,
        listSample: listPayload,
        detailSample: null,
        error: `Zoho ${moduleName} returned no records.`,
      };
    }

    const detailResponse = await client.request(`/${moduleName}/${recordId}`, {
      method: "GET",
    });

    if (!detailResponse.ok) {
      return {
        module: moduleName,
        recordId,
        listSample: listPayload,
        detailSample: null,
        error: `Zoho ${moduleName} detail fetch failed with status ${detailResponse.status}.`,
      };
    }

    const detailPayload = await detailResponse.json().catch(() => ({}));

    return {
      module: moduleName,
      recordId,
      listSample: listPayload,
      detailSample: detailPayload,
    };
  } catch (error) {
    return {
      module: moduleName,
      recordId: null,
      listSample: null,
      detailSample: null,
      error:
        error instanceof Error ? error.message : `Zoho ${moduleName} sample fetch failed.`,
    };
  }
}

function resolveFieldsForModule(moduleName: string): string {
  const normalizedName = normalizeZohoName(moduleName);
  const matchingDefinition = ZOHO_SYNC_MODULES.find((definition) =>
    definition.candidates
      .map(normalizeZohoName)
      .includes(normalizedName),
  );

  if (matchingDefinition) {
    return matchingDefinition.fields.join(",");
  }

  const extraFields = EXTRA_MODULE_FIELDS[normalizedName];

  if (extraFields) {
    return extraFields.join(",");
  }

  return "id,Modified_Time,Created_Time";
}

function normalizeZohoName(value: string): string {
  return value.replace(/[\s_]+/g, "").toLowerCase();
}
