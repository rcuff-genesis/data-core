export type EntityType =
  | "campaign"
  | "lead"
  | "contact"
  | "account"
  | "deal"
  | "sales_order"
  | "ordered_item"
  | "product"
  | "activity"
  | "document";

export type LeadLifecycleStage =
  | "new"
  | "attempting_contact"
  | "contacted"
  | "qualified"
  | "converted"
  | "disqualified";

export type DealLifecycleStage =
  | "identifying_need"
  | "quoting"
  | "quoted"
  | "invoice"
  | "invoiced"
  | "won"
  | "lost"
  | "other";

export interface BaseEntity {
  id: string;
  type: EntityType;
  source: string;
  sourceId: string;
  createdAt?: string;
  updatedAt?: string;
  sourceStatus?: string;
  sourcePayload?: Record<string, unknown>;
}

export interface Campaign extends BaseEntity {
  type: "campaign";
  name: string;
  channel?: string;
  ownerId?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  spend?: number;
  expectedRevenue?: number;
}

export interface Lead extends BaseEntity {
  type: "lead";
  fullName: string;
  email?: string;
  phone?: string;
  ownerId?: string;
  stage?: LeadLifecycleStage;
  leadSource?: string;
  campaignName?: string;
  marketingInterest?: string;
  attemptsLogged?: number;
  convertedAt?: string;
  convertedContactId?: string;
  convertedAccountId?: string;
  convertedDealId?: string;
}

export interface Contact extends BaseEntity {
  type: "contact";
  fullName: string;
  email?: string;
  phone?: string;
  ownerId?: string;
  accountId?: string;
  leadSource?: string;
  title?: string;
}

export interface Account extends BaseEntity {
  type: "account";
  name: string;
  ownerId?: string;
  phone?: string;
  website?: string;
  industry?: string;
  accountType?: string;
  segment?: string;
  region?: string;
  customerStatus?: "prospect" | "customer" | "former_customer";
}

export interface Deal extends BaseEntity {
  type: "deal";
  name: string;
  ownerId?: string;
  accountId?: string;
  contactId?: string;
  stage?: DealLifecycleStage;
  amount?: number;
  expectedRevenue?: number;
  probability?: number;
  currency?: string;
  closeDate?: string;
  nextStep?: string;
  pipeline?: string;
}

export interface SalesOrder extends BaseEntity {
  type: "sales_order";
  subject: string;
  orderNumber?: string;
  accountId?: string;
  contactId?: string;
  dealId?: string;
  ownerId?: string;
  status?: string;
  totalAmount?: number;
  outstandingAmount?: number;
  totalPaid?: number;
  currency?: string;
  orderedItemIds?: string[];
}

export interface OrderedItem extends BaseEntity {
  type: "ordered_item";
  salesOrderId: string;
  productId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  listPrice?: number;
  total?: number;
  netTotal?: number;
  discount?: number;
}

export interface Product extends BaseEntity {
  type: "product";
  name: string;
  sku?: string;
  productCode?: string;
  unitPrice?: number;
  category?: string;
  isTaxable?: boolean;
}

export interface Activity extends BaseEntity {
  type: "activity";
  subject: string;
  activityType: "call" | "email" | "meeting" | "note" | "task" | "unknown";
  occurredAt?: string;
  actorId?: string;
  leadId?: string;
  contactId?: string;
  accountId?: string;
  dealId?: string;
  salesOrderId?: string;
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

// Backwards-compatible alias for older code paths that still refer to Company.
export type Company = Account;

export type InternalEntity =
  | Campaign
  | Lead
  | Contact
  | Account
  | Deal
  | SalesOrder
  | OrderedItem
  | Product
  | Activity
  | Document;
