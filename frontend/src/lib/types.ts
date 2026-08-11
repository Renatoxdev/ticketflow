export type UserRole = "ORGANIZER" | "CUSTOMER" | "GATE_OPERATOR";

export type EventStatus = "DRAFT" | "PUBLISHED";

export type TicketStatus = "VALID" | "USED";

export type CheckoutStatus = "CONFIRMED";

export interface AuthSession {
  accessToken: string;
  role: UserRole;
  email: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ExternalCatalogItem {
  externalSource: string;
  externalId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
}

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: string;
  venue: string;
  capacity: number;
  soldCount: number;
  price: string;
  status: EventStatus;
  externalSource: string | null;
  externalId: string | null;
  publishedAt: string | null;
}

export interface CreateEventInput {
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: string;
  venue: string;
  capacity: number;
  price: string;
  externalSource: string | null;
  externalId: string | null;
}

export interface Ticket {
  id: string;
  eventId: string;
  customerId: string;
  publicToken: string;
  status: TicketStatus;
  checkoutStatus: CheckoutStatus;
  checkoutReference: string;
  paidAmount: string;
  checkoutConfirmedAt: string;
  createdAt: string;
}

export interface TicketShare {
  ticketId: string;
  eventId: string;
  token: string;
  qrPayload: string;
  status: TicketStatus;
}

export type GateStatus = "VALID" | "ALREADY_USED" | "INVALID" | "NOT_AVAILABLE" | string;

export interface GateValidationResult {
  status: GateStatus;
  message: string;
  ticketId: string | null;
  checkedInAt: string | null;
}
