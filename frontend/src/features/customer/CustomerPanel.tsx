import {Fragment, FormEvent, useEffect, useState} from "react";
import {QRCodeSVG} from "qrcode.react";

import {
  approvePixPayment,
  buildSeatsWebSocketUrl,
  cancelTicket,
  createPixPayment,
  failPixPayment,
  getTicketShare,
  listCustomerTickets,
  listEvents,
  listSeats,
} from "../../lib/api";
import type {AuthSession, CustomerTicket, Event, Payment, Seat, TicketShare} from "../../lib/types";

type Props = {
  session: AuthSession;
};

export function CustomerPanel({session}: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [filters, setFilters] = useState({q: "", dateFrom: "", dateTo: "", maxPrice: ""});
  const [tickets, setTickets] = useState<TicketShare[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [myTickets, setMyTickets] = useState<CustomerTicket[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);
  const [myTicketsError, setMyTicketsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatSyncMode, setSeatSyncMode] = useState<"connecting" | "live" | "polling">("polling");
  const [buying, setBuying] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"details" | "payment" | "ticket">("details");
  const [paymentCopyStatus, setPaymentCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [paymentFailure, setPaymentFailure] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function loadEvents(event?: {preventDefault: () => void}) {
    event?.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await listEvents({
        q: filters.q,
        date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : "",
        date_to: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).toISOString() : "",
        max_price: filters.maxPrice,
      });
      setEvents(result);
      setSelectedEvent((current) => (current && result.some((event) => event.id === current.id) ? current : (result[0] ?? null)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar sessões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
    loadMyTickets();
  }, []);

  async function loadMyTickets() {
    setMyTicketsLoading(true);
    setMyTicketsError(null);
    try {
      setMyTickets(await listCustomerTickets(session));
    } catch (ticketsError) {
      setMyTicketsError(ticketsError instanceof Error ? ticketsError.message : "Erro ao carregar seus ingressos.");
    } finally {
      setMyTicketsLoading(false);
    }
  }

  function selectEvent(event: Event) {
    setSelectedEvent(event);
    setSeats([]);
    setSelectedSeats([]);
    setTickets([]);
    setPayment(null);
    setCheckoutStep("details");
    setCopyStatus("idle");
    setPaymentCopyStatus("idle");
    setPaymentFailure(null);
  }

  async function loadSeats(event: Event) {
    setSeatLoading(true);
    try {
      const result = await listSeats(event.id);
      setSeats(result);
      setSelectedSeats((current) =>
        current.filter((label) => result.some((seat) => seat.label === label && seat.status === "available")),
      );
      setError(null);
    } catch (seatError) {
      setError(seatError instanceof Error ? seatError.message : "Erro ao carregar assentos.");
      setSeats([]);
      setSelectedSeats([]);
    } finally {
      setSeatLoading(false);
    }
  }

  function toggleSeat(seatLabel: string) {
    setSelectedSeats((current) => toggleSeatInList(current, seatLabel));
  }

  useEffect(() => {
    if (selectedEvent) {
      loadSeats(selectedEvent);
      return;
    }

    setSeats([]);
    setSelectedSeats([]);
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent || checkoutStep !== "details") {
      setSeatSyncMode("polling");
      return;
    }

    let socket: WebSocket | null = null;
    let closedByEffect = false;
    setSeatSyncMode("connecting");

    try {
      socket = new WebSocket(buildSeatsWebSocketUrl(selectedEvent.id));

      socket.onopen = () => {
        if (!closedByEffect) setSeatSyncMode("live");
      };

      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data) as Seat[];
        setSeats(payload);
        setSelectedSeats((current) =>
          current.filter((label) => payload.some((seat) => seat.label === label && seat.status === "available")),
        );
        setError(null);
      };

      socket.onerror = () => {
        if (!closedByEffect) setSeatSyncMode("polling");
      };

      socket.onclose = () => {
        if (!closedByEffect) setSeatSyncMode("polling");
      };
    } catch {
      setSeatSyncMode("polling");
    }

    const interval = window.setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setSeatSyncMode("polling");
        loadSeats(selectedEvent);
      }
    }, 8000);

    return () => {
      closedByEffect = true;
      socket?.close();
      window.clearInterval(interval);
    };
  }, [selectedEvent?.id, checkoutStep]);

  async function startPayment(seatsToPay = selectedSeats) {
    if (!selectedEvent || seatsToPay.length === 0) {
      setError("Escolha pelo menos um assento antes do pagamento.");
      return;
    }

    setBuying(true);
    setTickets([]);
    setPayment(null);
    setError(null);
    setPaymentFailure(null);
    setPaymentCopyStatus("idle");

    try {
      const nextPayment = await createPixPayment(session, selectedEvent.id, seatsToPay);
      setPayment(nextPayment);
      setSelectedSeats(nextPayment.seatLabels);
      setCheckoutStep("payment");
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Erro ao gerar cobrança Pix.");
    } finally {
      setBuying(false);
    }
  }

  async function handleStartPayment(event: FormEvent) {
    event.preventDefault();
    await startPayment();
  }

  async function handleRetryPayment() {
    await startPayment(payment?.seatLabels ?? selectedSeats);
  }

  async function handleRejectPayment() {
    if (!payment) return;

    setBuying(true);
    setTickets([]);
    setError(null);

    try {
      setPayment(await failPixPayment(session, payment.id));
      setPaymentFailure("Pagamento recusado na simulação. Nenhum ingresso foi emitido.");
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Erro ao recusar pagamento.");
    } finally {
      setBuying(false);
    }
  }

  async function handleConfirmPayment(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;

    setBuying(true);
    setError(null);
    setTickets([]);
    setCopyStatus("idle");

    try {
      if (!payment) {
        throw new Error("Gere uma cobrança Pix antes de confirmar o pagamento.");
      }

      const purchasedTickets = await approvePixPayment(session, payment.id);
      const issuedTickets = await Promise.all(purchasedTickets.map((purchased) => getTicketShare(session, purchased.id)));
      setTickets(issuedTickets);
      setCheckoutStep("ticket");
      setPayment(null);
      await loadEvents();
      await loadSeats(selectedEvent);
      await loadMyTickets();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Erro ao emitir ingresso.");
    } finally {
      setBuying(false);
    }
  }

  async function handleBuyAnother(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;

    setTickets([]);
    setPayment(null);
    setCheckoutStep("details");
    setSelectedSeats([]);
    await loadSeats(selectedEvent);
  }

  async function handleCancelTicket(ticket: TicketShare) {
    if (!selectedEvent) return;

    setBuying(true);
    setError(null);

    try {
      await cancelTicket(session, ticket.ticketId);
      setTickets((current) => current.filter((item) => item.ticketId !== ticket.ticketId));
      setCheckoutStep("details");
      setSelectedSeats([]);
      await loadEvents();
      await loadSeats(selectedEvent);
      await loadMyTickets();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Erro ao cancelar ingresso.");
    } finally {
      setBuying(false);
    }
  }

  async function copyPaymentCode() {
    if (!payment) return;

    try {
      await copyTextToClipboard(payment.pixCode);
      setPaymentCopyStatus("copied");
    } catch {
      setPaymentCopyStatus("failed");
    }

    window.setTimeout(() => setPaymentCopyStatus("idle"), 2200);
  }

  async function copyTicketLink(token: string) {
    try {
      await copyTextToClipboard(buildShareLink(token));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }

    window.setTimeout(() => setCopyStatus("idle"), 2200);
  }

  return (
    <div className="flow-grid customer-grid">
      <header className="flow-header">
        <p className="section-label">Cliente</p>
        <h2>Escolha seu filme</h2>
      </header>

      <section className="panel customer-showcase">
        <div className="panel-title-row">
          <h3>Em cartaz</h3>
          <button aria-busy={loading} className={`ghost-button ${loading ? "is-loading" : ""}`} disabled={loading} onClick={loadEvents} type="button">
            {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        <form className="filter-form" onSubmit={loadEvents}>
          <label>
            Buscar
            <input value={filters.q} onChange={(event) => setFilters({...filters, q: event.target.value})} placeholder="Filme ou sala" />
          </label>
          <label>
            De
            <input value={filters.dateFrom} onChange={(event) => setFilters({...filters, dateFrom: event.target.value})} type="date" />
          </label>
          <label>
            Até
            <input value={filters.dateTo} onChange={(event) => setFilters({...filters, dateTo: event.target.value})} type="date" />
          </label>
          <label>
            Preço máximo
            <input min={0} step="0.01" value={filters.maxPrice} onChange={(event) => setFilters({...filters, maxPrice: event.target.value})} type="number" />
          </label>
          <button aria-busy={loading} className={loading ? "is-loading" : ""} disabled={loading} type="submit">
            {loading ? "Filtrando" : "Filtrar"}
          </button>
        </form>

        {error && <p className="feedback danger">{error}</p>}

        <div className="poster-grid">
          {loading && events.length === 0 && <CatalogSkeleton />}
          {!loading && events.length === 0 && (
            <div className="empty-state">
              <strong>Nenhuma sessão disponível</strong>
              <span>Quando houver sessões publicadas, elas aparecem aqui.</span>
            </div>
          )}

          {events.map((event) => (
            <button
              className={`poster-card ${selectedEvent?.id === event.id ? "selected" : ""}`}
              key={event.id}
              onClick={() => selectEvent(event)}
              type="button"
            >
              {event.imageUrl ? <img alt="" src={event.imageUrl} /> : <span className="poster-fallback">Filme</span>}
              <span className="poster-overlay">
                <strong>{event.title}</strong>
                <small>{new Date(event.startsAt).toLocaleDateString("pt-BR")}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel checkout-panel">
        {selectedEvent ? (
          <>
            <div className="checkout-summary">
              {selectedEvent.imageUrl ? <img alt="" src={selectedEvent.imageUrl} /> : <div className="image-fallback">Filme</div>}
              <div>
                <p className="section-label">Detalhes da sessão</p>
                <h3>{selectedEvent.title}</h3>
                <p>{selectedEvent.description}</p>
                <dl>
                  <div>
                    <dt>Sala</dt>
                    <dd>{selectedEvent.venue}</dd>
                  </div>
                  <div>
                    <dt>Ingresso</dt>
                    <dd>R$ {selectedEvent.price}</dd>
                  </div>
                </dl>
                <CapacityBar event={selectedEvent} />
              </div>
            </div>

            {checkoutStep === "details" && (
              <div className="seat-section">
                <div>
                  <p className="section-label">Mapa de assentos</p>
                  <h3>Escolha seu lugar</h3>
                </div>
                <span className={`live-pill ${seatSyncMode === "live" ? "online" : ""}`}>
                  {seatSyncMode === "live" ? "Mapa ao vivo" : seatSyncMode === "connecting" ? "Conectando mapa" : "Atualização periódica"}
                </span>
                <div className="screen-line">Tela</div>
                <div className="seat-map">
                  {seatLoading && (
                    <div className="empty-state seat-state">
                      <strong>Carregando assentos</strong>
                      <span>Estamos conferindo os lugares disponíveis desta sessão.</span>
                    </div>
                  )}

                  {!seatLoading && seats.length === 0 && (
                    <div className="empty-state seat-state">
                      <strong>Nenhum assento disponível</strong>
                      <span>Atualize a sessão ou escolha outro filme.</span>
                    </div>
                  )}

                  {seats.map((seat) => (
                    <Fragment key={seat.label}>
                      <button
                        className={`seat-button ${seat.status === "sold" ? "sold" : ""} ${seat.status === "reserved" ? "reserved" : ""} ${selectedSeats.includes(seat.label) ? "selected" : ""}`}
                        disabled={seat.status !== "available"}
                        onClick={() => toggleSeat(seat.label)}
                        type="button"
                      >
                        {seat.label}
                      </button>
                      {isBeforeCenterAisle(seat.label) && <span className="seat-aisle" aria-hidden="true" />}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}

            {checkoutStep === "details" && (
              <form onSubmit={handleStartPayment}>
                <button
                  className="wide-action"
                  disabled={buying || seatLoading || selectedSeats.length === 0 || selectedEvent.capacity - selectedEvent.soldCount <= 0}
                  type="submit"
                >
                  {buying ? "Gerando pagamento" : selectedSeats.length > 0 ? `Ir para pagamento · ${formatSeatList(selectedSeats)}` : "Escolha um assento"}
                </button>
              </form>
            )}

            {checkoutStep === "payment" && payment && (
              <div className="payment-surface">
                <div className="qr-box payment-qr">
                  <QRCodeSVG value={payment.qrPayload} size={168} />
                </div>

                <div className="payment-details">
                  <p className="section-label">Pagamento simulado</p>
                  <h3>Use este código para simular o Pix</h3>
                  <p>
                    Depois de confirmar, serão emitidos {payment.seatLabels.length} ingresso(s) para {formatSeatList(payment.seatLabels)}.
                  </p>
                  {payment.status === "PENDING" && (
                    <p>Estes assentos ficam reservados até {new Date(payment.expiresAt).toLocaleTimeString("pt-BR")}.</p>
                  )}
                  <div className="payment-code-list">
                    <code>{payment.pixCode}</code>
                  </div>
                  <button className="ghost-button" disabled={buying || !payment} onClick={copyPaymentCode} type="button">
                    {paymentCopyStatus === "copied" ? "Código copiado" : "Copiar código Pix"}
                  </button>
                  <button className="ghost-button danger-button" disabled={buying || !payment || payment.status === "FAILED"} onClick={handleRejectPayment} type="button">
                    Simular pagamento recusado
                  </button>
                  {payment.status === "FAILED" && (
                    <button className="ghost-button" disabled={buying} onClick={handleRetryPayment} type="button">
                      Tentar pagamento novamente
                    </button>
                  )}
                  {paymentCopyStatus === "failed" && (
                    <p className="copy-hint danger">Seu navegador bloqueou a cópia. Selecione o código acima manualmente.</p>
                  )}
                  {paymentFailure && <p className="feedback danger">{paymentFailure}</p>}
                </div>
              </div>
            )}

            {checkoutStep === "payment" && (
              <form onSubmit={handleConfirmPayment}>
                <button className="wide-action" disabled={buying || !payment || payment.status === "FAILED"} type="submit">
                  {buying ? "Emitindo ingressos" : "Confirmar pagamento aprovado"}
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && tickets.length > 0 && (
              <div className="feedback success">Pagamento confirmado. {tickets.length} ingresso(s) emitido(s).</div>
            )}

            {checkoutStep === "ticket" && (
              <form onSubmit={handleBuyAnother}>
                <button className="ghost-button" disabled={buying} type="submit">
                  Comprar outro ingresso
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && tickets.length > 0 && (
              <div className="ticket-surface">
                {tickets.map((issuedTicket) => (
                  <div className="ticket-card" key={issuedTicket.ticketId}>
                    <div className="qr-box">
                      <QRCodeSVG value={buildShareLink(issuedTicket.token)} size={168} />
                    </div>

                    <div className="ticket-details">
                      <div className="ticket-heading">
                        <p className="section-label">Ingresso emitido</p>
                        <h3>QR Code do ingresso · Assento {issuedTicket.seatLabel}</h3>
                      </div>

                      <div className="ticket-actions">
                        <p className="copy-hint">Link compartilhável do ingresso</p>
                        <code>{buildShareLink(issuedTicket.token)}</code>
                        <button className="ghost-button" onClick={() => copyTicketLink(issuedTicket.token)} type="button">
                          {copyStatus === "copied" ? "Link copiado" : "Copiar link compartilhável"}
                        </button>
                        <button className="ghost-button danger-button" disabled={buying} onClick={() => handleCancelTicket(issuedTicket)} type="button">
                          {buying ? "Cancelando" : "Cancelar ingresso"}
                        </button>
                        {copyStatus === "failed" && (
                          <p className="copy-hint danger">Seu navegador bloqueou a cópia. Selecione o código acima para compartilhar.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state tall">
            <strong>Escolha um filme</strong>
            <span>Os detalhes aparecem aqui antes do pagamento.</span>
          </div>
        )}
      </section>

      <section className="panel my-tickets-panel">
        <div className="panel-title-row">
          <div>
            <p className="section-label">Meus ingressos</p>
            <h3>Ingressos emitidos</h3>
          </div>
          <button aria-busy={myTicketsLoading} className={`ghost-button ${myTicketsLoading ? "is-loading" : ""}`} disabled={myTicketsLoading} onClick={loadMyTickets} type="button">
            {myTicketsLoading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        {myTicketsError && <p className="feedback danger">{myTicketsError}</p>}

        <div className="my-ticket-list">
          {!myTicketsLoading && !myTicketsError && myTickets.length === 0 && (
            <div className="empty-state">
              <strong>Nenhum ingresso emitido</strong>
              <span>Depois do pagamento simulado aprovado, seus ingressos aparecem aqui.</span>
            </div>
          )}

          {myTickets.map((item) => (
            <div className="my-ticket-card" key={item.ticketId}>
              {item.imageUrl ? <img alt="" src={item.imageUrl} /> : <div className="image-fallback">Filme</div>}
              <div className="my-ticket-info">
                <strong>{item.title}</strong>
                <span>{new Date(item.startsAt).toLocaleString("pt-BR")}</span>
                <span>{item.venue} · Assento {item.seatLabel ?? "-"}</span>
                <span>Status: {item.status}</span>
                <small>Link compartilhável</small>
                <code>{buildShareLink(item.token)}</code>
                <button className="ghost-button compact-button" onClick={() => copyTicketLink(item.token)} type="button">
                  Copiar link
                </button>
              </div>
              <div className="my-ticket-qr" aria-label={`QR Code do ingresso para ${item.title}`}>
                <QRCodeSVG value={buildShareLink(item.token)} size={112} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildShareLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}#ticket=${encodeURIComponent(token)}`;
}

function isBeforeCenterAisle(label: string): boolean {
  return label.endsWith("5");
}

function toggleSeatInList(currentSeats: string[], seatLabel: string): string[] {
  if (currentSeats.includes(seatLabel)) {
    return currentSeats.filter((seat) => seat !== seatLabel);
  }

  return [...currentSeats, seatLabel].sort((left, right) => left.localeCompare(right, "pt-BR", {numeric: true}));
}

function formatSeatList(seats: string[]): string {
  if (seats.length === 0) return "nenhum assento";
  if (seats.length === 1) return `assento ${seats[0]}`;
  return `assentos ${seats.join(", ")}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed.");
  } finally {
    document.body.removeChild(textarea);
  }
}

function CapacityBar({event, compact = false}: {event: Event; compact?: boolean}) {
  const percent = Math.min(100, Math.round((event.soldCount / event.capacity) * 100));

  return (
    <div className={`capacity-meter ${compact ? "compact" : ""}`}>
      <div className="capacity-copy">
        <span>{event.soldCount} ingressos vendidos</span>
        <span>{event.capacity - event.soldCount} ainda disponíveis</span>
      </div>
      <div className="capacity-track" aria-label={`${event.soldCount} de ${event.capacity} ingressos vendidos`}>
        <span style={{width: `${percent}%`}} />
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="catalog-skeleton" aria-label="Carregando sessões" role="status">
      {[0, 1, 2].map((item) => <span aria-hidden="true" className="skeleton-poster" key={item} />)}
      <span className="sr-only">Carregando sessões em cartaz.</span>
    </div>
  );
}
