export type EntityType =
  | "lead"
  | "company"
  | "deal"
  | "activity"
  | "document";

export interface BaseEntity {
  id: string;
  type: EntityType;
  source: string;
  sourceId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Lead extends BaseEntity {
  type: "lead";
  fullName: string;
  email?: string;
  phone?: string;
  companyId?: string;
  ownerId?: string;
  status?: string;
}

export interface Company extends BaseEntity {
  type: "company";
  name: string;
  domain?: string;
  industry?: string;
  ownerId?: string;
}

export interface Deal extends BaseEntity {
  type: "deal";
  name: string;
  companyId?: string;
  leadId?: string;
  stage?: string;
  amount?: number;
  currency?: string;
  closeDate?: string;
}

export interface Activity extends BaseEntity {
  type: "activity";
  subject: string;
  activityType: "call" | "email" | "meeting" | "note" | "task" | "unknown";
  occurredAt?: string;
  leadId?: string;
  companyId?: string;
  dealId?: string;
  actorId?: string;
}

export interface Document extends BaseEntity {
  type: "document";
  title: string;
  mimeType?: string;
  url?: string;
  summary?: string;
  textPreview?: string;
  ownerId?: string;
}

export type InternalEntity = Lead | Company | Deal | Activity | Document;
