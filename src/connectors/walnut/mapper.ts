import type { InternalEntity } from "../../ontology/entities";

export interface WalnutSourceRow {
  tableName:
    | "part_numbers"
    | "part_stock_list"
    | "floor_inventory"
    | "builds"
    | "system_map"
    | "bom"
    | "part_bom";
  row: Record<string, unknown>;
}

export function mapWalnutRowToInternal(input: WalnutSourceRow): InternalEntity[] {
  switch (input.tableName) {
    case "part_numbers":
      return [mapPart(input.row)];
    case "part_stock_list":
      return [mapStockInventory(input.row)];
    case "floor_inventory":
      return [mapFloorInventory(input.row)];
    case "builds":
      return [mapBuild(input.row)];
    default:
      return [];
  }
}

function mapPart(row: Record<string, unknown>): InternalEntity {
  const partNumber = stringify(row.part_number) ?? "unknown-part";
  const description = stringify(row.description);

  return {
    id: `walnut:part:${partNumber}`,
    type: "product",
    source: "walnut",
    sourceId: partNumber,
    name: description ?? partNumber,
    sku: partNumber,
    productCode: partNumber,
    category: stringify(row.type),
    description,
    model: stringify(row.model),
    countryOfOrigin: stringify(row.country_of_origin),
    safetyStock: numberValue(row.safety_stock),
    failureRate: numberValue(row.percent_failure),
    createdAt: stringify(row.created_at) ?? stringify(row.date),
    updatedAt: stringify(row.updated_at) ?? stringify(row.date),
    sourcePayload: row,
  };
}

function mapStockInventory(row: Record<string, unknown>): InternalEntity {
  const partNumber = stringify(row.part_number) ?? "unknown-part";
  const location = stringify(row.location) ?? "unspecified";

  return {
    id: `walnut:inventory:stock:${partNumber}:${location}`,
    type: "inventory_item",
    source: "walnut",
    sourceId: `${partNumber}:${location}`,
    name: `${partNumber} stock`,
    productId: `walnut:part:${partNumber}`,
    partNumber,
    quantity: numberValue(row.quantity),
    location,
    inventoryType: "stock",
    safetyStock: numberValue(row.safety_stock),
    sourcePayload: row,
  };
}

function mapFloorInventory(row: Record<string, unknown>): InternalEntity {
  const partNumber = stringify(row.part_number) ?? "unknown-part";
  const serialNumber = stringify(row.serial_number) ?? "unknown-serial";

  return {
    id: `walnut:inventory:floor:${serialNumber}:${partNumber}`,
    type: "inventory_item",
    source: "walnut",
    sourceId: stringify(row.id) ?? `${serialNumber}:${partNumber}`,
    name: `${partNumber} floor inventory`,
    productId: `walnut:part:${partNumber}`,
    partNumber,
    quantity: numberValue(row.quantity),
    serialNumber,
    inventoryType: "floor",
    lastUpdated: stringify(row.last_updated),
    safetyStock: numberValue(row.safety_stock),
    updatedAt: stringify(row.last_updated),
    sourcePayload: row,
  };
}

function mapBuild(row: Record<string, unknown>): InternalEntity {
  const orderNumber = stringify(row.order_number);
  const serialNumber = stringify(row.serial_number);
  const model = stringify(row.model);
  const nickname = stringify(row.nickname);
  const generatedName = [model, orderNumber ?? serialNumber]
    .filter(Boolean)
    .join(" build ");
  const name =
    nickname ||
    generatedName ||
    orderNumber ||
    serialNumber ||
    "Walnut Build";

  return {
    id: `walnut:build:${stringify(row.id) ?? orderNumber ?? serialNumber ?? "unknown"}`,
    type: "build",
    source: "walnut",
    sourceId: stringify(row.id) ?? orderNumber ?? serialNumber ?? "unknown",
    name,
    orderNumber,
    serialNumber,
    model,
    status: stringify(row.status),
    startTime: stringify(row.start_time),
    expectedDate: stringify(row.expected_date),
    deliverByDate: stringify(row.deliver_by_date),
    quantityIndex: numberValue(row.quantity_index),
    bomVersion: stringify(row.bom_version),
    shippingState: stringify(row.shipping_state),
    shippingCountry: stringify(row.shipping_country),
    nickname,
    testNotes: stringify(row.test_notes),
    qcNotes: stringify(row.qc_notes),
    createdAt: stringify(row.start_time),
    updatedAt: stringify(row.start_time),
    sourceStatus: stringify(row.status),
    sourcePayload: row,
  };
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}
