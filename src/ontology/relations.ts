import type { EntityType } from "./entities";

export type RelationType =
  | "generated_lead"
  | "converted_to_contact"
  | "converted_to_account"
  | "converted_to_deal"
  | "belongs_to_account"
  | "linked_to_contact"
  | "results_in_sales_order"
  | "contains_ordered_item"
  | "references_product"
  | "owned_by"
  | "references_document"
  | "related_to";

export interface EntityRelation {
  type: RelationType;
  fromEntityType: EntityType;
  fromEntityId: string;
  toEntityType: EntityType;
  toEntityId: string;
  source: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export const relationCatalog: Record<
  RelationType,
  { from: EntityType[]; to: EntityType[] }
> = {
  generated_lead: {
    from: ["campaign"],
    to: ["lead"],
  },
  converted_to_contact: {
    from: ["lead"],
    to: ["contact"],
  },
  converted_to_account: {
    from: ["lead"],
    to: ["account"],
  },
  converted_to_deal: {
    from: ["lead"],
    to: ["deal"],
  },
  belongs_to_account: {
    from: ["contact", "deal", "sales_order", "activity", "document"],
    to: ["account"],
  },
  linked_to_contact: {
    from: ["deal", "sales_order", "activity", "document"],
    to: ["contact"],
  },
  results_in_sales_order: {
    from: ["deal"],
    to: ["sales_order"],
  },
  contains_ordered_item: {
    from: ["sales_order"],
    to: ["ordered_item"],
  },
  references_product: {
    from: ["ordered_item", "deal", "document"],
    to: ["product"],
  },
  owned_by: {
    from: [
      "campaign",
      "lead",
      "contact",
      "account",
      "deal",
      "sales_order",
      "activity",
      "document",
    ],
    to: [
      "contact",
      "account",
      "deal",
      "document",
    ],
  },
  references_document: {
    from: [
      "campaign",
      "lead",
      "contact",
      "account",
      "deal",
      "sales_order",
      "ordered_item",
      "product",
      "activity",
    ],
    to: ["document"],
  },
  related_to: {
    from: [
      "campaign",
      "lead",
      "contact",
      "account",
      "deal",
      "sales_order",
      "ordered_item",
      "product",
      "activity",
      "document",
    ],
    to: [
      "campaign",
      "lead",
      "contact",
      "account",
      "deal",
      "sales_order",
      "ordered_item",
      "product",
      "activity",
      "document",
    ],
  },
};
