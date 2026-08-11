import {FormEvent, useState} from "react";

import {createEvent, searchExternalCatalog} from "../../lib/api";
import type {AuthSession, CreateEventInput, Event, ExternalCatalogItem} from "../../lib/types";

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Escolha uma obra antes de montar o evento.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: CreateEventInput = {
      title: selected.title,
      description: form.description || selected.description || `Evento baseado em ${selected.title}.`,
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
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Erro ao publicar evento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flow-grid organizer-grid">
      <header className="flow-header">
        <p className="section-label">Organizador</p>
        <h2>Criar evento</h2>
      </header>

      <section className="panel">
        <form className="inline-form" onSubmit={handleSearch}>
          <label>
            Buscar título
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
              <span>Busque um título para preencher pôster, nome e descrição inicial.</span>
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
                <p className="section-label">Base do evento</p>
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
                Onde acontece
                <input value={form.venue} onChange={(event) => setForm({...form, venue: event.target.value})} required />
              </label>
              <label className="full-field">
                Descrição do evento
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
                {saving ? "Publicando" : "Publicar evento"}
              </button>
            </form>

            {publishedEvent && (
              <p className="feedback success">Evento publicado: {publishedEvent.title}.</p>
            )}
          </>
        ) : (
          <div className="empty-state tall">
            <strong>Escolha um título para começar</strong>
            <span>Depois você ajusta data, local, preço e descrição antes de publicar.</span>
          </div>
        )}
      </section>
    </div>
  );
}
