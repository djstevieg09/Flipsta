import {
  AccountStatus,
  PartnerStatus,
  PartnerType,
  StaffRole,
  SubscriptionTier,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UrgencyTier,
} from "./constants.js";

export type {
  AccountStatus,
  PartnerStatus,
  PartnerType,
  StaffRole,
  SubscriptionTier,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UrgencyTier,
};

export type OpportunityStatus = "draft" | "live" | "won" | "lapsed" | "cancelled";
export type OrderStatus = "preparing" | "shipped" | "delivered" | "refunded";
export type BuybackClaimStatus = "ineligible" | "pending_window" | "eligible" | "paid" | "rejected";

export interface Opportunity {
  id: string;
  category: string;
  sourceTier: string;
  marginBandLow: number;
  marginBandHigh: number;
  expectedMarginGBP: number;
  confidenceScore: number; // 0-1
  urgencyTier: UrgencyTier;
  estimatedStockUnits: number;
  perCustomerCap: number | null;
  startingBidGBP: number;
  instantWinPriceGBP: number;
  status: OpportunityStatus;
  actionClockSeconds: number;
  createdAt: string;
}

export interface Profile {
  id: string;
  displayName: string;
  subscriptionTier: SubscriptionTier;
  role: StaffRole;
  status: AccountStatus;
  createdAt: string;
}

/** Section 12.1 — Ultimate Admin Dashboard & Ticketing System */
export interface Ticket {
  id: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  body: string;
  requesterId: string;
  relatedOrderId: string | null;
  assignedAdminId: string | null;
  slaDueAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  adminId: string;
  note: string;
  createdAt: string;
}

/** Section 12.2 — Supplier & Courier Partner Programme */
export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  status: PartnerStatus;
  commissionOrCode: string | null;
  contactEmail: string | null;
  createdAt: string;
}

/** Section 12.4 — Reviews & Seller Ratings */
export interface Review {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Section 12.1 — Risk & Fraud Monitoring */
export type RiskFlagSeverity = "low" | "medium" | "high";
export type RiskFlagStatus = "open" | "investigating" | "dismissed";

export interface RiskFlag {
  id: string;
  type: string;
  severity: RiskFlagSeverity;
  sellerId: string;
  detail: string;
  status: RiskFlagStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Section 12.1 — Audit Log */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
}

/** Section 12.6 — Seller Tax Reporting & HMRC Digital Platform Reporting */
export interface SellerTaxInfo {
  profileId: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  taxReference: string | null;
  dateOfBirth: string | null;
  hmrcReportable: boolean;
  collectedAt: string;
}
