import type { InternalEntity } from "./entities";
import type { EntityRelation } from "./relations";

export function deriveRelationsFromEntities(
  entities: InternalEntity[],
): EntityRelation[] {
  return dedupeRelations(
    entities.flatMap((entity) => deriveRelationsFromEntity(entity)),
  );
}

function deriveRelationsFromEntity(entity: InternalEntity): EntityRelation[] {
  switch (entity.type) {
    case "lead":
      return [
        relationIfPresent({
          type: "converted_to_contact",
          fromEntityType: "lead",
          fromEntityId: entity.id,
          toEntityType: "contact",
          toEntityId: entity.convertedContactId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "converted_to_account",
          fromEntityType: "lead",
          fromEntityId: entity.id,
          toEntityType: "account",
          toEntityId: entity.convertedAccountId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "converted_to_deal",
          fromEntityType: "lead",
          fromEntityId: entity.id,
          toEntityType: "deal",
          toEntityId: entity.convertedDealId,
          source: entity.source,
        }),
      ].filter(isRelation);
    case "contact":
      return [
        relationIfPresent({
          type: "belongs_to_account",
          fromEntityType: "contact",
          fromEntityId: entity.id,
          toEntityType: "account",
          toEntityId: entity.accountId,
          source: entity.source,
        }),
      ].filter(isRelation);
    case "deal":
      return [
        relationIfPresent({
          type: "belongs_to_account",
          fromEntityType: "deal",
          fromEntityId: entity.id,
          toEntityType: "account",
          toEntityId: entity.accountId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "linked_to_contact",
          fromEntityType: "deal",
          fromEntityId: entity.id,
          toEntityType: "contact",
          toEntityId: entity.contactId,
          source: entity.source,
        }),
      ].filter(isRelation);
    case "sales_order":
      return [
        relationIfPresent({
          type: "belongs_to_account",
          fromEntityType: "sales_order",
          fromEntityId: entity.id,
          toEntityType: "account",
          toEntityId: entity.accountId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "linked_to_contact",
          fromEntityType: "sales_order",
          fromEntityId: entity.id,
          toEntityType: "contact",
          toEntityId: entity.contactId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "results_in_sales_order",
          fromEntityType: "deal",
          fromEntityId: entity.dealId,
          toEntityType: "sales_order",
          toEntityId: entity.id,
          source: entity.source,
        }),
        ...(entity.orderedItemIds ?? []).map(
          (orderedItemId): EntityRelation => ({
            type: "contains_ordered_item",
            fromEntityType: "sales_order",
            fromEntityId: entity.id,
            toEntityType: "ordered_item",
            toEntityId: orderedItemId,
            source: entity.source,
          }),
        ),
      ].filter(isRelation);
    case "ordered_item":
      return [
        {
          type: "contains_ordered_item",
          fromEntityType: "sales_order",
          fromEntityId: entity.salesOrderId,
          toEntityType: "ordered_item",
          toEntityId: entity.id,
          source: entity.source,
        } as EntityRelation,
        relationIfPresent({
          type: "references_product",
          fromEntityType: "ordered_item",
          fromEntityId: entity.id,
          toEntityType: "product",
          toEntityId: entity.productId,
          source: entity.source,
        }),
      ].filter(isRelation);
    case "inventory_item":
      return [
        relationIfPresent({
          type: "references_product",
          fromEntityType: "inventory_item",
          fromEntityId: entity.id,
          toEntityType: "product",
          toEntityId: entity.productId,
          source: entity.source,
        }),
      ].filter(isRelation);
    case "activity":
      return [
        relationIfPresent({
          type: "linked_to_contact",
          fromEntityType: "activity",
          fromEntityId: entity.id,
          toEntityType: "contact",
          toEntityId: entity.contactId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "belongs_to_account",
          fromEntityType: "activity",
          fromEntityId: entity.id,
          toEntityType: "account",
          toEntityId: entity.accountId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "related_to",
          fromEntityType: "activity",
          fromEntityId: entity.id,
          toEntityType: "lead",
          toEntityId: entity.leadId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "related_to",
          fromEntityType: "activity",
          fromEntityId: entity.id,
          toEntityType: "deal",
          toEntityId: entity.dealId,
          source: entity.source,
        }),
        relationIfPresent({
          type: "related_to",
          fromEntityType: "activity",
          fromEntityId: entity.id,
          toEntityType: "sales_order",
          toEntityId: entity.salesOrderId,
          source: entity.source,
        }),
      ].filter(isRelation);
    default:
      return [];
  }
}

function relationIfPresent(
  relation: Omit<EntityRelation, "fromEntityId" | "toEntityId"> & {
    fromEntityId?: string;
    toEntityId?: string;
  },
): EntityRelation | null {
  if (!relation.fromEntityId || !relation.toEntityId) {
    return null;
  }

  return {
    type: relation.type,
    fromEntityType: relation.fromEntityType,
    fromEntityId: relation.fromEntityId,
    toEntityType: relation.toEntityType,
    toEntityId: relation.toEntityId,
    source: relation.source,
    metadata: relation.metadata,
  };
}

function isRelation(value: EntityRelation | null): value is EntityRelation {
  return value !== null;
}

function dedupeRelations(relations: EntityRelation[]): EntityRelation[] {
  const seen = new Set<string>();
  const deduped: EntityRelation[] = [];

  for (const relation of relations) {
    const key = [
      relation.type,
      relation.fromEntityType,
      relation.fromEntityId,
      relation.toEntityType,
      relation.toEntityId,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(relation);
  }

  return deduped;
}
