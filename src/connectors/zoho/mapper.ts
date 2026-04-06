import type { InternalEntity } from "../../ontology/entities";
import type { ZohoRecord } from "./client";

function buildEntityId(module: string, sourceId: string): string {
  return `zoho:${module.toLowerCase()}:${sourceId}`;
}

export function mapZohoRecordToInternal(record: ZohoRecord): InternalEntity[] {
  const source = "zoho";
  const sourceId = record.id;
  const modifiedAt = record.modifiedTime;
  const createdAt = stringify(record.fields.Created_Time);
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
          ownerId: referenceId("users", record.fields.Owner),
          status: stringify(record.fields.Lead_Status),
          createdAt,
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
          createdAt,
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
          stage: stringify(record.fields.Stage),
          amount: numberValue(record.fields.Amount),
          currency: stringify(record.fields.Currency),
          closeDate: stringify(record.fields.Closing_Date),
          createdAt,
          updatedAt: modifiedAt,
        },
      ];
    case "activities":
    case "tasks":
    case "calls":
    case "meetings":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "activity",
          source,
          sourceId,
          subject: resolveActivitySubject(record) ?? "Untitled Activity",
          activityType: classifyActivityType(record),
          occurredAt: resolveActivityTime(record),
          createdAt,
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
          createdAt,
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
  record: ZohoRecord,
): "call" | "email" | "meeting" | "note" | "task" | "unknown" {
  const moduleName = record.module.toLowerCase();

  if (moduleName === "calls") {
    return "call";
  }

  if (moduleName === "meetings") {
    return "meeting";
  }

  if (moduleName === "tasks") {
    return "task";
  }

  const normalized = stringify(record.fields.Type)?.toLowerCase();

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

function resolveActivitySubject(record: ZohoRecord): string | undefined {
  return (
    stringify(record.fields.Subject) ||
    stringify(record.fields.Call_Type)
  );
}

function resolveActivityTime(record: ZohoRecord): string | undefined {
  return (
    stringify(record.fields.Activity_Date_Time) ||
    stringify(record.fields.Start_DateTime) ||
    stringify(record.fields.Call_Start_Time) ||
    stringify(record.fields.Due_Date) ||
    stringify(record.fields.Created_Time)
  );
}
