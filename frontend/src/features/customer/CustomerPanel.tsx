import {Fragment, FormEvent, useEffect, useState} from "react";
import {QRCodeSVG} from "qrcode.react";

import {
  approvePixPayment,
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
  const [selectedSeat, setSelectedSeat] = useState("");
  const [filters, setFilters] = useState({q: "", dateFrom: "", dateTo: "", maxPrice: ""});
  const [ticket, setTicket] = useState<TicketShare | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [myTickets, setMyTickets] = useState<CustomerTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [seatLoading, setSeatLoading] = useState(false);
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
    try {
      setMyTickets(await listCustomerTickets(session));
    } catch {
      setMyTickets([]);
    }
  }

  function selectEvent(event: Event) {
    setSelectedEvent(event);
    setSeats([]);
    setSelectedSeat("");
    setTicket(null);
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
      setSelectedSeat((current) => (result.some((seat) => seat.label === current && seat.status === "available") ? current : ""));
      setError(null);
    } catch (seatError) {
      setError(seatError instanceof Error ? seatError.message : "Erro ao carregar assentos.");
      setSeats([]);
      setSelectedSeat("");
    } finally {
      setSeatLoading(false);
    }
  }

  useEffect(() => {
    if (selectedEvent) {
      loadSeats(selectedEvent);
      return;
    }

    setSeats([]);
    setSelectedSeat("");
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent || checkoutStep !== "details") return;

    const interval = window.setInterval(() => {
      loadSeats(selectedEvent);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [selectedEvent?.id, checkoutStep]);

  async function startPayment() {
    if (!selectedEvent || !selectedSeat) {
      setError("Escolha um assento antes do pagamento.");
      return;
    }

    setBuying(true);
    setTicket(null);
    setPayment(null);
    setError(null);
    setPaymentFailure(null);
    setPaymentCopyStatus("idle");

    try {
      const nextPayment = await createPixPayment(session, selectedEvent.id, selectedSeat);
      setPayment(nextPayment);
      setCheckoutStep("payment");
      await loadSeats(selectedEvent);
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
    await startPayment();
  }

  async function handleRejectPayment() {
    if (!payment) return;

    setBuying(true);
    setTicket(null);
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
    setTicket(null);
    setCopyStatus("idle");

    try {
      if (!payment) {
        throw new Error("Gere uma cobrança Pix antes de confirmar o pagamento.");
      }

      const purchased = await approvePixPayment(session, payment.id);
      setTicket(await getTicketShare(session, purchased.id));
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

    setTicket(null);
    setPayment(null);
    setCheckoutStep("details");
    setSelectedSeat("");
    await loadSeats(selectedEvent);
  }

  async function handleCancelTicket() {
    if (!ticket || !selectedEvent) return;

    setBuying(true);
    setError(null);

    try {
      await cancelTicket(session, ticket.ticketId);
      setTicket(null);
      setCheckoutStep("details");
      setSelectedSeat("");
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
    if (!selectedEvent) return;

    try {
      await copyTextToClipboard(payment?.pixCode ?? "");
      setPaymentCopyStatus("copied");
    } catch {
      setPaymentCopyStatus("failed");
    }

    window.setTimeout(() => setPaymentCopyStatus("idle"), 2200);
  }

  async function copyTicketCode() {
    if (!ticket) return;

    try {
      await copyTextToClipboard(ticket.token);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }

    window.setTimeout(() => setCopyStatus("idle"), 2200);
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
          <button className="ghost-button" disabled={loading} onClick={loadEvents} type="button">
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
          <button disabled={loading} type="submit">
            Filtrar
          </button>
        </form>

        {error && <p className="feedback danger">{error}</p>}

        <div className="poster-grid">
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
                        className={`seat-button ${seat.status === "sold" ? "sold" : ""} ${seat.status === "reserved" ? "reserved" : ""} ${selectedSeat === seat.label ? "selected" : ""}`}
                        disabled={seat.status !== "available"}
                        onClick={() => setSelectedSeat(seat.label)}
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
                  disabled={buying || seatLoading || !selectedSeat || selectedEvent.capacity - selectedEvent.soldCount <= 0}
                  type="submit"
                >
                  {buying ? "Gerando pagamento" : selectedSeat ? `Ir para pagamento · Assento ${selectedSeat}` : "Escolha um assento"}
                </button>
              </form>
            )}

            {checkoutStep === "payment" && (
              <div className="payment-surface">
                <div className="qr-box payment-qr">
                  <QRCodeSVG value={payment?.qrPayload ?? ""} size={168} />
                </div>

                <div className="payment-details">
                  <p className="section-label">Pagamento simulado</p>
                  <h3>Use este código para simular o Pix</h3>
                  <p>Depois de confirmar, o ingresso será emitido para o assento {payment?.seatLabel ?? selectedSeat}.</p>
                  {payment?.status === "PENDING" && <p>Este assento fica reservado até {new Date(payment.expiresAt).toLocaleTimeString("pt-BR")}.</p>}
                  <code>{payment?.pixCode}</code>
                  <button className="ghost-button" disabled={!payment || buying} onClick={copyPaymentCode} type="button">
                    {paymentCopyStatus === "copied" ? "Código copiado" : "Copiar código Pix"}
                  </button>
                  <button className="ghost-button danger-button" disabled={!payment || buying || payment.status === "FAILED"} onClick={handleRejectPayment} type="button">
                    Simular pagamento recusado
                  </button>
                  {payment?.status === "FAILED" && (
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
                  {buying ? "Emitindo ingresso" : "Confirmar pagamento aprovado"}
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && ticket && (
              <div className="feedback success">Pagamento confirmado. Ingresso emitido.</div>
            )}

            {checkoutStep === "ticket" && (
              <form onSubmit={handleBuyAnother}>
                <button className="ghost-button" disabled={buying} type="submit">
                  Comprar outro ingresso
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && ticket && (
              <div className="ticket-surface">
                <div className="ticket-card">
                  <div className="qr-box">
                    <QRCodeSVG value={buildShareLink(ticket.token)} size={168} />
                  </div>

                  <div className="ticket-details">
                    <div className="ticket-heading">
                      <p className="section-label">Ingresso emitido</p>
                      <h3>QR Code do ingresso · Assento {ticket.seatLabel}</h3>
                    </div>

                    <div className="ticket-actions">
                      <p className="copy-hint">Link compartilhável do ingresso</p>
                      <code>{buildShareLink(ticket.token)}</code>
                      <button className="ghost-button" onClick={copyTicketCode} type="button">
                        {copyStatus === "copied" ? "Código copiado" : "Copiar código do ingresso"}
                      </button>
                      <button className="ghost-button" onClick={() => copyTicketLink(ticket.token)} type="button">
                        Copiar link compartilhável
                      </button>
                      <button className="ghost-button danger-button" disabled={buying} onClick={handleCancelTicket} type="button">
                        {buying ? "Cancelando" : "Cancelar ingresso"}
                      </button>
                      {copyStatus === "failed" && (
                        <p className="copy-hint danger">Seu navegador bloqueou a cópia. Selecione o código acima para compartilhar.</p>
                      )}
                    </div>
                  </div>
                </div>
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
          <button className="ghost-button" onClick={loadMyTickets} type="button">
            Atualizar
          </button>
        </div>

        <div className="my-ticket-list">
          {myTickets.length === 0 && (
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
