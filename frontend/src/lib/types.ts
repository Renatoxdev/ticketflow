export type UserRole = "ORGANIZER" | "CUSTOMER" | "GATE_OPERATOR";

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export type TicketStatus = "VALID" | "USED" | "CANCELLED";

export type CheckoutStatus = "CONFIRMED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

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

export type UpdateEventInput = Partial<Pick<CreateEventInput, "title" | "description" | "imageUrl" | "startsAt" | "venue" | "capacity" | "price">>;

export interface Seat {
  label: string;
  status: "available" | "reserved" | "sold" | string;
}

export interface Ticket {
  id: string;
  eventId: string;
  customerId: string;
  publicToken: string;
  seatLabel: string | null;
  status: TicketStatus;
  checkoutStatus: CheckoutStatus;
  checkoutReference: string;
  paidAmount: string;
  checkoutConfirmedAt: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  eventId: string;
  customerId: string;
  ticketId: string | null;
  seatLabel: string;
  amount: string;
  pixCode: string;
  qrPayload: string;
  status: PaymentStatus;
  expiresAt: string;
  createdAt: string;
}

export interface TicketShare {
  ticketId: string;
  eventId: string;
  token: string;
  qrPayload: string;
  status: TicketStatus;
  seatLabel: string | null;
}

export interface CustomerTicket {
  ticketId: string;
  eventId: string;
  title: string;
  imageUrl: string | null;
  startsAt: string;
  venue: string;
  seatLabel: string | null;
  token: string;
  qrPayload: string;
  status: TicketStatus;
  paidAmount: string;
}

export type GateStatus = "VALID" | "ALREADY_USED" | "INVALID" | "NOT_AVAILABLE" | "WRONG_EVENT" | string;

export interface GateValidationResult {
  status: GateStatus;
  message: string;
  ticketId: string | null;
  checkedInAt: string | null;
}
