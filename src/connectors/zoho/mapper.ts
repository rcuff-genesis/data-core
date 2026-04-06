import type { InternalEntity } from "../../ontology/entities";
import type { ZohoRecord } from "./client";

function buildEntityId(module: string, sourceId: string): string {
  return `zoho:${module.toLowerCase()}:${sourceId}`;
}

export function mapZohoRecordToInternal(record: ZohoRecord): InternalEntity[] {
  const source = "zoho";
  const sourceId = record.id;
  const modifiedAt = record.modifiedTime;
  const combinedLeadName = [
    stringify(record.fields.First_Name),
    stringify(record.fields.Last_Name),
  ]
    .filter(Boolean)
    .join(" ");

  switch (record.module.toLowerCase()) {
    case "leads":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "lead",
          source,
          sourceId,
          fullName:
            stringify(record.fields.Full_Name) ||
            combinedLeadName ||
            "Unknown Lead",
          email: stringify(record.fields.Email),
          phone: stringify(record.fields.Phone),
          companyId: referenceId("accounts", record.fields.Company),
          ownerId: referenceId("users", record.fields.Owner),
          status: stringify(record.fields.Lead_Status),
          updatedAt: modifiedAt,
        },
      ];
    case "accounts":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "company",
          source,
          sourceId,
          name: stringify(record.fields.Account_Name) ?? "Unknown Company",
          domain: stringify(record.fields.Website),
          industry: stringify(record.fields.Industry),
          ownerId: referenceId("users", record.fields.Owner),
          updatedAt: modifiedAt,
        },
      ];
    case "deals":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "deal",
          source,
          sourceId,
          name: stringify(record.fields.Deal_Name) ?? "Untitled Deal",
          companyId: referenceId("accounts", record.fields.Account_Name),
          leadId: referenceId("leads", record.fields.Contact_Name),
          stage: stringify(record.fields.Stage),
          amount: numberValue(record.fields.Amount),
          currency: stringify(record.fields.Currency),
          closeDate: stringify(record.fields.Closing_Date),
          updatedAt: modifiedAt,
        },
      ];
    case "activities":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "activity",
          source,
          sourceId,
          subject: stringify(record.fields.Subject) ?? "Untitled Activity",
          activityType: classifyActivityType(record.fields.Type),
          occurredAt: stringify(record.fields.Activity_Date_Time),
          leadId: referenceId("leads", record.fields.Who_Id),
          companyId: referenceId("accounts", record.fields.What_Id),
          dealId: referenceId("deals", record.fields.Deal_Name),
          actorId: referenceId("users", record.fields.Owner),
          updatedAt: modifiedAt,
        },
      ];
    case "documents":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "document",
          source,
          sourceId,
          title: stringify(record.fields.File_Name) ?? "Untitled Document",
          mimeType: stringify(record.fields.Type),
          url: stringify(record.fields.Download_Url),
          summary: stringify(record.fields.Description),
          textPreview: stringify(record.fields.Snippet),
          ownerId: referenceId("users", record.fields.Owner),
          updatedAt: modifiedAt,
        },
      ];
    default:
      return [];
  }
}

function stringify(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function referenceId(module: string, value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return `zoho:${module}:${value}`;
  }

  if (typeof value === "object" && value !== null && "id" in value) {
    const id = value.id;

    if (typeof id === "string" && id.trim()) {
      return `zoho:${module}:${id}`;
    }
  }

  return undefined;
}

function classifyActivityType(
  value: unknown,
): "call" | "email" | "meeting" | "note" | "task" | "unknown" {
  const normalized = stringify(value)?.toLowerCase();

  switch (normalized) {
    case "call":
      return "call";
    case "email":
      return "email";
    case "meeting":
      return "meeting";
    case "note":
      return "note";
    case "task":
      return "task";
    default:
      return "unknown";
  }
}
