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
          stage: normalizeLeadStage(record.fields.Lead_Status),
          leadSource: stringify(record.fields.Lead_Source),
          campaignName: stringify(record.fields.Campaign),
          marketingInterest: stringify(record.fields.Marketing_Interest),
          attemptsLogged: numberValue(record.fields.Attempts_Logged),
          convertedAt: stringify(record.fields.Converted_Date_Time),
          convertedContactId: referenceId("contacts", record.fields.Converted_Contact),
          convertedAccountId: referenceId("accounts", record.fields.Converted_Account),
          convertedDealId: referenceId("deals", record.fields.Converted_Deal),
          sourceStatus: stringify(record.fields.Lead_Status),
          createdAt,
          updatedAt: modifiedAt,
        },
      ];
    case "contacts":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "contact",
          source,
          sourceId,
          fullName:
            stringify(record.fields.Full_Name) ||
            combinedLeadName ||
            "Unknown Contact",
          email: stringify(record.fields.Email),
          phone: stringify(record.fields.Phone),
          accountId: referenceId("accounts", record.fields.Account_Name),
          ownerId: referenceId("users", record.fields.Owner),
          leadSource: stringify(record.fields.Lead_Source),
          title: stringify(record.fields.Title),
          sourceStatus: stringify(record.fields.Record_Status__s),
          createdAt,
          updatedAt: modifiedAt,
        },
      ];
    case "accounts":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "account",
          source,
          sourceId,
          name: stringify(record.fields.Account_Name) ?? "Unknown Account",
          phone: stringify(record.fields.Phone),
          website: stringify(record.fields.Website),
          industry: stringify(record.fields.Industry),
          ownerId: referenceId("users", record.fields.Owner),
          accountType: stringify(record.fields.Account_Type),
          sourceStatus: stringify(record.fields.Record_Status__s),
          createdAt,
          updatedAt: modifiedAt,
        },
      ];
    case "campaigns":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "campaign",
          source,
          sourceId,
          name: stringify(record.fields.Campaign_Name) ?? "Untitled Campaign",
          channel: stringify(record.fields.Type),
          spend: numberValue(record.fields.Actual_Cost),
          expectedRevenue: numberValue(record.fields.Expected_Revenue),
          sourceStatus: stringify(record.fields.Status),
          startDate: stringify(record.fields.Start_Date),
          endDate: stringify(record.fields.End_Date),
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
          accountId: referenceId("accounts", record.fields.Account_Name),
          contactId: referenceId("contacts", record.fields.Contact_Name),
          stage: normalizeDealStage(record.fields.Stage),
          amount: numberValue(record.fields.Amount),
          expectedRevenue: numberValue(record.fields.Expected_Revenue),
          probability: numberValue(record.fields.Probability),
          currency: stringify(record.fields.Currency),
          closeDate: stringify(record.fields.Closing_Date),
          nextStep: stringify(record.fields.Next_Step),
          pipeline: stringify(record.fields.Pipeline),
          sourceStatus: stringify(record.fields.Stage),
          ownerId: referenceId("users", record.fields.Owner),
          createdAt,
          updatedAt: modifiedAt,
        },
      ];
    case "sales_orders":
      return mapSalesOrderRecord(record, {
        source,
        sourceId,
        createdAt,
        updatedAt: modifiedAt,
      });
    case "activities":
    case "tasks":
    case "calls":
    case "meetings":
    case "events":
      return [
        {
          id: buildEntityId(record.module, sourceId),
          type: "activity",
          source,
          sourceId,
          subject: resolveActivitySubject(record) ?? "Untitled Activity",
          activityType: classifyActivityType(record),
          occurredAt: resolveActivityTime(record),
          actorId: referenceId("users", record.fields.Owner),
          leadId: referenceId("leads", record.fields.Who_Id),
          contactId: referenceId("contacts", record.fields.Contact_Name),
          accountId: referenceId("accounts", record.fields.What_Id),
          dealId: referenceId("deals", record.fields.Deal_Name),
          salesOrderId: referenceId("sales_orders", record.fields.Sales_Order),
          sourceStatus: stringify(record.fields.Status),
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

function mapSalesOrderRecord(
  record: ZohoRecord,
  base: {
    source: string;
    sourceId: string;
    createdAt?: string;
    updatedAt?: string;
  },
): InternalEntity[] {
  const salesOrderId = buildEntityId(record.module, base.sourceId);
  const orderedItems = arrayValue(record.fields.Ordered_Items);
  const productEntities = orderedItems
    .map((item) => mapProductFromOrderedItem(item))
    .filter((entity): entity is InternalEntity => Boolean(entity));
  const orderedItemEntities = orderedItems
    .map((item) => mapOrderedItem(item, salesOrderId))
    .filter((entity): entity is InternalEntity => Boolean(entity));

  return [
    {
      id: salesOrderId,
      type: "sales_order",
      source: base.source,
      sourceId: base.sourceId,
      subject: stringify(record.fields.Subject) ?? "Untitled Sales Order",
      orderNumber:
        stringify(record.fields.Sales_Order_Number) ||
        stringify(record.fields.Order_Number) ||
        stringify(record.fields.SO_Number),
      accountId: referenceId("accounts", record.fields.Account_Name),
      contactId: referenceId("contacts", record.fields.Contact_Name),
      dealId: referenceId("deals", record.fields.Deal_Name),
      ownerId: referenceId("users", record.fields.Owner),
      status: stringify(record.fields.Status),
      totalAmount: numberValue(record.fields.Grand_Total),
      outstandingAmount: numberValue(record.fields.Outstanding_Amount),
      totalPaid: numberValue(record.fields.Total_Paid),
      currency: stringify(record.fields.Currency),
      orderedItemIds: orderedItemEntities.map((entity) => entity.id),
      sourceStatus: stringify(record.fields.Status),
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    },
    ...orderedItemEntities,
    ...productEntities,
  ];
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

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
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

function mapOrderedItem(
  item: Record<string, unknown>,
  salesOrderId: string,
): InternalEntity | null {
  const itemId = typeof item.id === "string" ? item.id : undefined;

  if (!itemId) {
    return null;
  }

  const product = objectValue(item.Product_Name);

  return {
    id: `zoho:ordered_item:${itemId}`,
    type: "ordered_item",
    source: "zoho",
    sourceId: itemId,
    salesOrderId,
    productId:
      typeof product?.id === "string" ? `zoho:product:${product.id}` : undefined,
    description: stringify(item.Description),
    quantity: numberValue(item.Quantity),
    unitPrice: numberValue(product?.Unit_Price),
    listPrice: numberValue(item.List_Price),
    total: numberValue(item.Total),
    netTotal: numberValue(item.Net_Total),
    discount: numberValue(item.Discount),
    createdAt: stringify(item.Created_Time),
    updatedAt: stringify(item.Modified_Time),
  };
}

function mapProductFromOrderedItem(
  item: Record<string, unknown>,
): InternalEntity | null {
  const product = objectValue(item.Product_Name);
  const productId = typeof product?.id === "string" ? product.id : undefined;

  if (!productId) {
    return null;
  }

  return {
    id: `zoho:product:${productId}`,
    type: "product",
    source: "zoho",
    sourceId: productId,
    name:
      (typeof product?.name === "string" && product.name.trim()
        ? product.name
        : undefined) ?? "Unnamed Product",
    sku:
      typeof product?.Product_Code === "string"
        ? product.Product_Code
        : undefined,
    productCode:
      typeof product?.Product_Code === "string"
        ? product.Product_Code
        : undefined,
    unitPrice: numberValue(product?.Unit_Price),
    isTaxable:
      typeof product?.Taxable === "boolean" ? product.Taxable : undefined,
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
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

  if (moduleName === "events") {
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

function normalizeLeadStage(value: unknown) {
  const normalized = stringify(value)?.toLowerCase();

  switch (normalized) {
    case "new":
      return "new" as const;
    case "contacted":
      return "contacted" as const;
    case "qualified":
      return "qualified" as const;
    case "converted":
      return "converted" as const;
    case "disqualified":
      return "disqualified" as const;
    default:
      return undefined;
  }
}

function normalizeDealStage(value: unknown) {
  const normalized = stringify(value)?.toLowerCase();

  switch (normalized) {
    case "identifying need":
      return "identifying_need" as const;
    case "quoting":
      return "quoting" as const;
    case "quoted":
      return "quoted" as const;
    case "invoice":
      return "invoice" as const;
    case "invoiced":
      return "invoiced" as const;
    case "closed won":
    case "won":
      return "won" as const;
    case "closed lost":
    case "lost":
      return "lost" as const;
    default:
      return "other" as const;
  }
}

function resolveActivitySubject(record: ZohoRecord): string | undefined {
  return (
    stringify(record.fields.Event_Title) ||
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
