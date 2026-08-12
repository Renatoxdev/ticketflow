import type {
  AuthSession,
  CreateEventInput,
  Event,
  ExternalCatalogItem,
  GateValidationResult,
  Ticket,
  TicketShare,
  User,
  UserRole,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

type ApiErrorPayload = {
  detail?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;

  if (!response.ok) {
    throw new Error(payload.detail ?? "Erro ao concluir esta ação.");
  }

  return payload;
}

function authHeaders(session: AuthSession): HeadersInit {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
}

function toEvent(payload: Record<string, unknown>): Event {
  return {
    id: String(payload.id),
    organizerId: String(payload.organizer_id),
    title: String(payload.title),
    description: String(payload.description),
    imageUrl: payload.image_url ? String(payload.image_url) : null,
    startsAt: String(payload.starts_at),
    venue: String(payload.venue),
    capacity: Number(payload.capacity),
    soldCount: Number(payload.sold_count ?? 0),
    price: String(payload.price),
    status: payload.status as Event["status"],
    externalSource: payload.external_source ? String(payload.external_source) : null,
    externalId: payload.external_id ? String(payload.external_id) : null,
    publishedAt: payload.published_at ? String(payload.published_at) : null,
  };
}

function toTicket(payload: Record<string, unknown>): Ticket {
  return {
    id: String(payload.id),
    eventId: String(payload.event_id),
    customerId: String(payload.customer_id),
    publicToken: String(payload.public_token),
    status: payload.status as Ticket["status"],
    checkoutStatus: payload.checkout_status as Ticket["checkoutStatus"],
    checkoutReference: String(payload.checkout_reference),
    paidAmount: String(payload.paid_amount),
    checkoutConfirmedAt: String(payload.checkout_confirmed_at),
    createdAt: String(payload.created_at),
  };
}

function toTicketShare(payload: Record<string, unknown>): TicketShare {
  return {
    ticketId: String(payload.ticket_id),
    eventId: String(payload.event_id),
    token: String(payload.token),
    qrPayload: String(payload.qr_payload),
    status: payload.status as TicketShare["status"],
  };
}

function toCatalogItem(payload: Record<string, unknown>): ExternalCatalogItem {
  return {
    externalSource: String(payload.external_source),
    externalId: String(payload.external_id),
    title: String(payload.title),
    description: payload.description ? String(payload.description) : null,
    imageUrl: payload.image_url ? String(payload.image_url) : null,
  };
}

function createEventPayload(input: CreateEventInput): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description,
    image_url: input.imageUrl,
    starts_at: input.startsAt,
    venue: input.venue,
    capacity: input.capacity,
    price: input.price,
    external_source: input.externalSource,
    external_id: input.externalId,
  };
}

export async function registerUser(role: UserRole, email: string): Promise<AuthSession> {
  const password = "password123";
  const user = await parseJson<User>(
    await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        name: role === "GATE_OPERATOR" ? "Equipe de Portaria" : role === "ORGANIZER" ? "Organizador Demo" : "Cliente Demo",
        email,
        password,
        role,
      }),
    }),
  ).catch(async (error) => {
    if (!String(error.message).includes("Já existe usuário")) {
      throw error;
    }

    return {email, role} as User;
  });

  const token = await loginUser(email, password);
  return {accessToken: token.accessToken, role: user.role, email};
}

export async function loginUser(email: string, password: string): Promise<{ accessToken: string }> {
  const payload = await parseJson<{ access_token: string }>(
    await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email, password}),
    }),
  );

  return {accessToken: payload.access_token};
}

export async function searchExternalCatalog(session: AuthSession, query: string): Promise<ExternalCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/organizer/external-catalog?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(session),
  });
  const payload = await parseJson<Record<string, unknown>[]>(response);
  return payload.map(toCatalogItem);
}

export async function createEvent(session: AuthSession, input: CreateEventInput): Promise<Event> {
  const response = await fetch(`${API_BASE_URL}/organizer/events`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(createEventPayload(input)),
  });

  return toEvent(await parseJson<Record<string, unknown>>(response));
}

export async function listEvents(): Promise<Event[]> {
  const response = await fetch(`${API_BASE_URL}/events`);
  const payload = await parseJson<Record<string, unknown>[]>(response);
  return payload.map(toEvent);
}

export async function checkout(session: AuthSession, eventId: string): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/checkout`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({event_id: eventId}),
  });

  return toTicket(await parseJson<Record<string, unknown>>(response));
}

export async function getTicketShare(session: AuthSession, ticketId: string): Promise<TicketShare> {
  const response = await fetch(`${API_BASE_URL}/customer/tickets/${ticketId}/qr`, {
    headers: authHeaders(session),
  });

  return toTicketShare(await parseJson<Record<string, unknown>>(response));
}

export async function checkIn(session: AuthSession, token: string): Promise<GateValidationResult> {
  const response = await fetch(`${API_BASE_URL}/gate/check-ins`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({token}),
  });

  const payload = await parseJson<Record<string, unknown>>(response);
  return {
    status: String(payload.status),
    message: String(payload.message),
    ticketId: payload.ticket_id ? String(payload.ticket_id) : null,
    checkedInAt: payload.checked_in_at ? String(payload.checked_in_at) : null,
  };
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return parseJson<{ status: string }>(response);
}
