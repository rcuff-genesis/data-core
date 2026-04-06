import type { EntityType } from "./entities";

export type RelationType =
  | "belongs_to_company"
  | "owned_by"
  | "associated_with_lead"
  | "associated_with_deal"
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
  belongs_to_company: {
    from: ["lead", "deal", "document"],
    to: ["company"],
  },
  owned_by: {
    from: ["lead", "company", "deal", "activity", "document"],
    to: ["lead", "company", "deal", "activity", "document"],
  },
  associated_with_lead: {
    from: ["activity", "deal", "document"],
    to: ["lead"],
  },
  associated_with_deal: {
    from: ["activity", "document"],
    to: ["deal"],
  },
  references_document: {
    from: ["lead", "company", "deal", "activity"],
    to: ["document"],
  },
  related_to: {
    from: ["lead", "company", "deal", "activity", "document"],
    to: ["lead", "company", "deal", "activity", "document"],
  },
};
