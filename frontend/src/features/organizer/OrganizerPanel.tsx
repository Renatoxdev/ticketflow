import {FormEvent, useEffect, useState} from "react";

import {cancelEvent, createEvent, listOrganizerEvents, searchExternalCatalog, updateEvent} from "../../lib/api";
import type {AuthSession, CreateEventInput, Event, ExternalCatalogItem, UpdateEventInput} from "../../lib/types";

type Props = {
  session: AuthSession;
};

const initialForm = {
  startsAt: "",
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
  const [error, setError] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);

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

    const payload: CreateEventInput = {
      title: selected.title,
      description: form.description || selected.description || `Sessão baseada em ${selected.title}.`,
      imageUrl: selected.imageUrl,
      startsAt: new Date(form.startsAt).toISOString(),
      venue: form.venue,
      capacity: Number(form.capacity),
      price: form.price,
      externalSource: selected.externalSource,
      externalId: selected.externalId,
    };

    try {
      setPublishedEvent(await createEvent(session, payload));
      setForm(initialForm);
      loadManagedEvents();
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

    const payload: UpdateEventInput = {
      description: editForm.description,
      startsAt: new Date(editForm.startsAt).toISOString(),
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
    setManagementError(null);

    try {
      await cancelEvent(session, eventId);
      if (editingEvent?.id === eventId) setEditingEvent(null);
      await loadManagedEvents();
    } catch (cancelError) {
      setManagementError(cancelError instanceof Error ? cancelError.message : "Erro ao cancelar sessão.");
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
          <button disabled={loading} type="submit">
            {loading ? "Buscando" : "Buscar"}
          </button>
        </form>

        {error && <p className="feedback danger">{error}</p>}

        <div className="catalog-list">
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
              <button disabled={saving} type="submit">
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
          <button className="ghost-button" disabled={managementLoading} onClick={loadManagedEvents} type="button">
            {managementLoading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        {managementError && <p className="feedback danger">{managementError}</p>}

        <div className="management-list">
          {managedEvents.length === 0 && (
            <div className="empty-state">
              <strong>Nenhuma sessão cadastrada</strong>
              <span>As sessões publicadas aparecem aqui para edição ou cancelamento.</span>
            </div>
          )}

          {managedEvents.map((event) => (
            <div className="management-row" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>
                  {new Date(event.startsAt).toLocaleString("pt-BR")} · {event.venue} · {event.status}
                </span>
              </div>
              <div className="management-actions">
                <button className="ghost-button" disabled={event.status === "CANCELLED"} onClick={() => startEdit(event)} type="button">
                  Editar
                </button>
                <button className="ghost-button danger-button" disabled={event.status === "CANCELLED"} onClick={() => handleCancelManaged(event.id)} type="button">
                  Cancelar
                </button>
              </div>
            </div>
          ))}
        </div>

        {editingEvent && (
          <form className="event-form" onSubmit={handleUpdateManaged}>
            <label>
              Quando acontece
              <input
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
            <button disabled={saving} type="submit">
              {saving ? "Salvando" : "Salvar alterações"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
