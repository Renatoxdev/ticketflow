import {FormEvent, useEffect, useState} from "react";
import {QRCodeSVG} from "qrcode.react";

import {checkout, getTicketShare, listEvents} from "../../lib/api";
import type {AuthSession, Event, TicketShare} from "../../lib/types";

type Props = {
  session: AuthSession;
};

export function CustomerPanel({session}: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ticket, setTicket] = useState<TicketShare | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"details" | "payment" | "ticket">("details");
  const [paymentCopyStatus, setPaymentCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);

    try {
      const result = await listEvents();
      setEvents(result);
      setSelectedEvent((current) => current ?? result[0] ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar sessões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function selectEvent(event: Event) {
    setSelectedEvent(event);
    setTicket(null);
    setCheckoutStep("details");
    setCopyStatus("idle");
    setPaymentCopyStatus("idle");
  }

  function handleStartPayment(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;
    setTicket(null);
    setError(null);
    setPaymentCopyStatus("idle");
    setCheckoutStep("payment");
  }

  async function handleConfirmPayment(event: FormEvent) {
    event.preventDefault();
    if (!selectedEvent) return;

    setBuying(true);
    setError(null);
    setTicket(null);
    setCopyStatus("idle");

    try {
      const purchased = await checkout(session, selectedEvent.id);
      setTicket(await getTicketShare(session, purchased.id));
      setCheckoutStep("ticket");
      loadEvents();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Erro ao emitir ingresso.");
    } finally {
      setBuying(false);
    }
  }

  async function copyPaymentCode() {
    if (!selectedEvent) return;

    try {
      await copyTextToClipboard(buildPaymentCode(selectedEvent));
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
              <form onSubmit={handleStartPayment}>
                <button className="wide-action" disabled={selectedEvent.capacity - selectedEvent.soldCount <= 0} type="submit">
                  Ir para pagamento
                </button>
              </form>
            )}

            {checkoutStep === "payment" && (
              <div className="payment-surface">
                <div className="qr-box payment-qr">
                  <QRCodeSVG value={buildPaymentCode(selectedEvent)} size={168} />
                </div>

                <div className="payment-details">
                  <p className="section-label">Pagamento simulado</p>
                  <h3>Use este código para simular o PIX</h3>
                  <p>Depois de confirmar, o ingresso será emitido e a ocupação da sessão será atualizada.</p>
                  <code>{buildPaymentCode(selectedEvent)}</code>
                  <button className="ghost-button" onClick={copyPaymentCode} type="button">
                    {paymentCopyStatus === "copied" ? "Código copiado" : "Copiar código PIX"}
                  </button>
                  {paymentCopyStatus === "failed" && (
                    <p className="copy-hint danger">Seu navegador bloqueou a cópia. Selecione o código acima manualmente.</p>
                  )}
                </div>
              </div>
            )}

            {checkoutStep === "payment" && (
              <form onSubmit={handleConfirmPayment}>
                <button className="wide-action" disabled={buying} type="submit">
                  {buying ? "Emitindo ingresso" : "Confirmar pagamento simulado"}
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && ticket && (
              <div className="feedback success">Pagamento confirmado. Ingresso emitido.</div>
            )}

            {checkoutStep === "ticket" && (
              <form onSubmit={handleStartPayment}>
                <button className="ghost-button" disabled={buying} type="submit">
                  Comprar outro ingresso
                </button>
              </form>
            )}

            {checkoutStep === "ticket" && ticket && (
              <div className="ticket-surface">
                <div className="ticket-card">
                  <div className="qr-box">
                    <QRCodeSVG value={ticket.qrPayload} size={168} />
                  </div>

                  <div className="ticket-details">
                    <div className="ticket-heading">
                      <p className="section-label">Ingresso emitido</p>
                      <h3>QR Code do ingresso</h3>
                    </div>

                    <div className="ticket-actions">
                      <code>{ticket.token}</code>
                      <button className="ghost-button" onClick={copyTicketCode} type="button">
                        {copyStatus === "copied" ? "Código copiado" : "Copiar código do ingresso"}
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
    </div>
  );
}

function buildPaymentCode(event: Event): string {
  const priceCode = event.price.replace(".", "").padStart(4, "0");
  return `PIX-SIMULADO-TICKETFLOW-${event.id.slice(0, 8)}-${priceCode}`;
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
