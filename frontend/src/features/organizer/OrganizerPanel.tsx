import {FormEvent, useEffect, useState} from "react";

import {cancelEvent, createEvent, deleteEvent, listOrganizerEvents, searchExternalCatalog, updateEvent} from "../../lib/api";
import type {AuthSession, CreateEventInput, Event, ExternalCatalogItem, UpdateEventInput} from "../../lib/types";

type Props = {
  session: AuthSession;
};

function defaultStartsAt() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(20, 0, 0, 0);
  return toDatetimeLocal(date.toISOString());
}

const initialForm = {
  startsAt: defaultStartsAt(),
  venue: "",
  capacity: "50",
  price: "25.00",
  description: "",
};

export function OrganizerPanel({session}: Props) {
  const [query, setQuery] = useState("lost");
  const [items, setItems] = useState<ExternalCatalogItem[]>([]);
  const [selected, setSelected] = useState<ExternalCatalogItem | null>(null);
  const [form, setForm] = useState(initialForm);
  const [publishedEvent, setPublishedEvent] = useState<Event | null>(null);
  const [managedEvents, setManagedEvents] = useState<Event[]>([]);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [managementLoading, setManagementLoading] = useState(false);
  const [cancellingEventId, setCancellingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const dashboard = buildOrganizerDashboard(managedEvents);
  const visibleManagedEvents = managedEvents;

  async function loadManagedEvents() {
    setManagementLoading(true);
    setManagementError(null);

    try {
      setManagedEvents(await listOrganizerEvents(session));
    } catch (loadError) {
      setManagementError(loadError instanceof Error ? loadError.message : "Erro ao carregar sessões.");
    } finally {
      setManagementLoading(false);
    }
  }

  useEffect(() => {
    loadManagedEvents();
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPublishedEvent(null);

    try {
      const result = await searchExternalCatalog(session, query);
      setItems(result);
      const firstItem = result[0] ?? null;
      setSelected(firstItem);
      setForm((current) => ({...current, description: firstItem?.description ?? ""}));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Erro ao buscar títulos. Tente outra busca.");
      setItems([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError("Escolha um filme ou série antes de criar a sessão.");
      return;
    }

    setSaving(true);
    setError(null);

    const startsAt = new Date(form.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setSaving(false);
      setError("Escolha uma data e horário futuros para publicar a sessão.");
      return;
    }

    const payload: CreateEventInput = {
      title: selected.title,
      description: form.description || selected.description || `Sessão baseada em ${selected.title}.`,
      imageUrl: selected.imageUrl,
      startsAt: startsAt.toISOString(),
      venue: form.venue,
      capacity: Number(form.capacity),
      price: form.price,
      externalSource: selected.externalSource,
      externalId: selected.externalId,
    };

    try {
      setPublishedEvent(await createEvent(session, payload));
      setForm(initialForm);
      await loadManagedEvents();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Erro ao publicar sessão.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(event: Event) {
    setEditingEvent(event);
    setEditForm({
      startsAt: toDatetimeLocal(event.startsAt),
      venue: event.venue,
      capacity: String(event.capacity),
      price: event.price,
      description: event.description,
    });
  }

  async function handleUpdateManaged(event: FormEvent) {
    event.preventDefault();
    if (!editingEvent) return;

    setSaving(true);
    setManagementError(null);

    const startsAt = new Date(editForm.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setSaving(false);
      setManagementError("Escolha uma data e horário futuros para salvar a sessão.");
      return;
    }

    const payload: UpdateEventInput = {
      description: editForm.description,
      startsAt: startsAt.toISOString(),
      venue: editForm.venue,
      capacity: Number(editForm.capacity),
      price: editForm.price,
    };

    try {
      await updateEvent(session, editingEvent.id, payload);
      setEditingEvent(null);
      await loadManagedEvents();
    } catch (updateError) {
      setManagementError(updateError instanceof Error ? updateError.message : "Erro ao editar sessão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelManaged(eventId: string) {
    if (cancellingEventId) return;

    setCancellingEventId(eventId);
    setManagementError(null);

    try {
      await cancelEvent(session, eventId);
      if (editingEvent?.id === eventId) setEditingEvent(null);
      await loadManagedEvents();
    } catch (cancelError) {
      setManagementError(cancelError instanceof Error ? cancelError.message : "Erro ao cancelar sessão.");
    } finally {
      setCancellingEventId(null);
    }
  }

  async function handleDeleteManaged(event: Event) {
    if (deletingEventId || !window.confirm(`Excluir definitivamente a sessão "${event.title}"?`)) return;

    setDeletingEventId(event.id);
    setManagementError(null);
    try {
      await deleteEvent(session, event.id);
      setManagedEvents((current) => current.filter((item) => item.id !== event.id));
    } catch (deleteError) {
      setManagementError(deleteError instanceof Error ? deleteError.message : "Erro ao excluir sessão.");
    } finally {
      setDeletingEventId(null);
    }
  }

  return (
    <div className="flow-grid organizer-grid">
      <header className="flow-header">
        <p className="section-label">Organizador</p>
        <h2>Criar sessão</h2>
      </header>

      <section className="panel">
        <form className="inline-form" onSubmit={handleSearch}>
          <label>
            Buscar filme ou série
            <input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} required />
          </label>
          <button aria-busy={loading} className={loading ? "is-loading" : ""} disabled={loading} type="submit">
            {loading ? "Buscando" : "Buscar"}
          </button>
        </form>

        {error && <p className="feedback danger">{error}</p>}

        <div className="catalog-list">
          {loading && (
            <div className="loading-state" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>Buscando títulos no catálogo...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="empty-state">
              <strong>Comece pela busca</strong>
              <span>Busque no catálogo para preencher pôster, nome e sinopse inicial.</span>
            </div>
          )}

          {items.map((item) => (
            <button
              className={`catalog-item ${selected?.externalId === item.externalId ? "selected" : ""}`}
              key={item.externalId}
              onClick={() => {
                setSelected(item);
                setForm((current) => ({...current, description: item.description ?? ""}));
              }}
              type="button"
            >
              <span>{item.title}</span>
              <small>{item.description ?? "Sem sinopse disponível."}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel detail-panel">
        {selected ? (
          <>
            <div className="selected-media">
              {selected.imageUrl ? <img alt="" src={selected.imageUrl} /> : <div className="image-fallback">Sem imagem</div>}
              <div>
                <p className="section-label">Base da sessão</p>
                <h3>{selected.title}</h3>
                <p>{selected.description ?? "Revise os dados antes de publicar."}</p>
              </div>
            </div>

            <form className="event-form" onSubmit={handlePublish}>
              <label>
                Quando acontece
                <input
                  min={toDatetimeLocal(new Date().toISOString())}
                  value={form.startsAt}
                  onChange={(event) => setForm({...form, startsAt: event.target.value})}
                  required
                  type="datetime-local"
                />
              </label>
              <label>
                Sala ou cinema
                <input value={form.venue} onChange={(event) => setForm({...form, venue: event.target.value})} required />
              </label>
              <label className="full-field">
                Descrição da sessão
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({...form, description: event.target.value})}
                  required
                  rows={5}
                />
              </label>
              <label>
                Capacidade
                <input
                  min={1}
                  value={form.capacity}
                  onChange={(event) => setForm({...form, capacity: event.target.value})}
                  required
                  type="number"
                />
              </label>
              <label>
                Preço do ingresso
                <input
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm({...form, price: event.target.value})}
                  required
                  type="number"
                />
              </label>
              <button aria-busy={saving} className={saving ? "is-loading" : ""} disabled={saving} type="submit">
                {saving ? "Publicando" : "Publicar sessão"}
              </button>
            </form>

            {publishedEvent && (
              <p className="feedback success">Sessão publicada: {publishedEvent.title}.</p>
            )}
          </>
        ) : (
          <div className="empty-state tall">
            <strong>Escolha um título para começar</strong>
            <span>Depois você ajusta data, sala, preço e descrição antes de publicar.</span>
          </div>
        )}
      </section>

      <section className="panel organizer-management">
        <div className="panel-title-row">
          <div>
            <p className="section-label">Gerenciamento</p>
            <h3>Sessões cadastradas</h3>
          </div>
          <button aria-busy={managementLoading} className={`ghost-button ${managementLoading ? "is-loading" : ""}`} disabled={managementLoading} onClick={loadManagedEvents} type="button">
            {managementLoading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        {managementError && <p className="feedback danger">{managementError}</p>}

        <div className="dashboard-strip">
          <DashboardMetric label="Sessões" value={dashboard.totalEvents} />
          <DashboardMetric label="Ativas" value={dashboard.activeEvents} />
          <DashboardMetric label="Canceladas" value={dashboard.cancelledEvents} />
          <DashboardMetric label="Vendidos" value={dashboard.soldTickets} />
          <DashboardMetric label="Ocupação média" value={`${dashboard.averageOccupancy}%`} />
        </div>

        <div className="management-list">
          {visibleManagedEvents.length === 0 && (
            <div className="empty-state">
              <strong>Nenhuma sessão cadastrada</strong>
              <span>As sessões publicadas aparecem aqui para edição ou cancelamento.</span>
            </div>
          )}

          {visibleManagedEvents.map((event) => (
            <div className="management-row" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>
                  {new Date(event.startsAt).toLocaleString("pt-BR")} · {event.venue}
                </span>
                <StatusBadge status={event.status} />
              </div>
              <div className="management-actions">
                <button className="ghost-button" disabled={event.status === "CANCELLED" || cancellingEventId !== null} onClick={() => startEdit(event)} type="button">
                  Editar
                </button>
                <button aria-busy={cancellingEventId === event.id} className={`ghost-button danger-button ${cancellingEventId === event.id ? "is-loading" : ""}`} disabled={event.status === "CANCELLED" || cancellingEventId !== null} onClick={() => handleCancelManaged(event.id)} type="button">
                  {cancellingEventId === event.id ? "Cancelando" : "Cancelar"}
                </button>
                {event.status === "CANCELLED" && (
                  <button aria-busy={deletingEventId === event.id} className={`ghost-button danger-button ${deletingEventId === event.id ? "is-loading" : ""}`} disabled={deletingEventId !== null} onClick={() => handleDeleteManaged(event)} type="button">
                    {deletingEventId === event.id ? "Excluindo" : "Excluir"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {editingEvent && (
          <form className="event-form" onSubmit={handleUpdateManaged}>
            <label>
              Quando acontece
              <input
                min={toDatetimeLocal(new Date().toISOString())}
                value={editForm.startsAt}
                onChange={(event) => setEditForm({...editForm, startsAt: event.target.value})}
                required
                type="datetime-local"
              />
            </label>
            <label>
              Sala ou cinema
              <input value={editForm.venue} onChange={(event) => setEditForm({...editForm, venue: event.target.value})} required />
            </label>
            <label className="full-field">
              Descrição da sessão
              <textarea
                value={editForm.description}
                onChange={(event) => setEditForm({...editForm, description: event.target.value})}
                required
                rows={4}
              />
            </label>
            <label>
              Capacidade
              <input
                min={1}
                value={editForm.capacity}
                onChange={(event) => setEditForm({...editForm, capacity: event.target.value})}
                required
                type="number"
              />
            </label>
            <label>
              Preço do ingresso
              <input
                min={0}
                step="0.01"
                value={editForm.price}
                onChange={(event) => setEditForm({...editForm, price: event.target.value})}
                required
                type="number"
              />
            </label>
            <button aria-busy={saving} className={saving ? "is-loading" : ""} disabled={saving} type="submit">
              {saving ? "Salvando" : "Salvar alterações"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function DashboardMetric({label, value}: {label: string; value: string | number}) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({status}: {status: Event["status"]}) {
  const label = status === "PUBLISHED" ? "Publicada" : status === "CANCELLED" ? "Cancelada" : "Rascunho";

  return <span className={`status-badge ${status.toLowerCase()}`}>{label}</span>;
}

function buildOrganizerDashboard(events: Event[]) {
  const activeEvents = events.filter((event) => event.status === "PUBLISHED");
  const capacity = activeEvents.reduce((total, event) => total + event.capacity, 0);
  const soldTickets = activeEvents.reduce((total, event) => total + event.soldCount, 0);

  return {
    totalEvents: events.length,
    activeEvents: activeEvents.length,
    cancelledEvents: events.filter((event) => event.status === "CANCELLED").length,
    soldTickets,
    averageOccupancy: capacity > 0 ? Math.round((soldTickets / capacity) * 100) : 0,
  };
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
