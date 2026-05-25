import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const TYPES = [
  { value: "all",        label: "Todo" },
  { value: "article",    label: "Artículos" },
  { value: "collection", label: "Colecciones" },
  { value: "toolkit",    label: "Toolkits" },
  { value: "newsletter", label: "Newsletters" },
];

const TYPE_LABEL = {
  article: "Artículo", collection: "Colección",
  toolkit: "Toolkit",  newsletter: "Newsletter",
};

const TYPE_COLOR = {
  article:    { bg: "rgba(96,165,250,.12)",  text: "#60a5fa" },
  collection: { bg: "rgba(167,139,250,.12)", text: "#a78bfa" },
  toolkit:    { bg: "rgba(45,212,191,.12)",  text: "#2dd4bf" },
  newsletter: { bg: "rgba(251,146,60,.12)",  text: "#fb923c" },
};

function formatDate(str) {
  if (!str) return "";
  return new Date(str).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function TypeBadge({ type }) {
  const c = TYPE_COLOR[type] || { bg: "rgba(255,255,255,.08)", text: "rgba(255,255,255,.5)" };
  return (
    <span className="content-badge" style={{ background: c.bg, color: c.text }}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function ContentCard({ item, onClick }) {
  const date = item.published_at || item.updated_at || item.CreatedAt;
  return (
    <button className="content-card" onClick={() => onClick(item)}>
      {item.cover_url && (
        <div className="content-card-cover">
          <img src={item.cover_url} alt={item.title} loading="lazy" />
        </div>
      )}
      <div className="content-card-body">
        <TypeBadge type={item.type} />
        <h3 className="content-card-title">{item.title}</h3>
        {item.excerpt && <p className="content-card-excerpt">{item.excerpt}</p>}
        <div className="content-card-meta">
          {item.author_name && <span>{item.author_name}</span>}
          {date && <span>{formatDate(date)}</span>}
        </div>
        {item.tags && (
          <div className="content-card-tags">
            {item.tags.split(",").map(t => t.trim()).filter(Boolean).slice(0, 3).map(tag => (
              <span key={tag} className="content-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function ReaderModal({ item, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = item.published_at || item.updated_at || item.CreatedAt;

  return (
    <div className="content-reader-overlay" onClick={onClose}>
      <article className="content-reader" onClick={e => e.stopPropagation()}>
        <button className="content-reader-close" onClick={onClose}>✕</button>

        {item.cover_url && (
          <img src={item.cover_url} alt={item.title} className="content-reader-cover" />
        )}

        <div className="content-reader-header">
          <TypeBadge type={item.type} />
          <h1 className="content-reader-title">{item.title}</h1>
          {item.excerpt && <p className="content-reader-excerpt">{item.excerpt}</p>}
          <div className="content-reader-meta">
            {item.author_name && <span>Por {item.author_name}</span>}
            {date && <span>{formatDate(date)}</span>}
          </div>
          {item.tags && (
            <div className="content-card-tags">
              {item.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                <span key={tag} className="content-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {item.body ? (
          <div className="content-reader-body">
            {item.body.split("\n").map((line, i) => (
              line.trim() === ""
                ? <br key={i} />
                : <p key={i}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="view-empty" style={{ marginTop: "1.5rem" }}>Sin contenido.</p>
        )}
      </article>
    </div>
  );
}

export default function ContentView() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [reading, setReading]   = useState(null);

  useEffect(() => {
    apiFetch("/api/user/content")
      .then(r => { if (r.success) setItems(r.content || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(it => {
    const matchType   = filter === "all" || it.type === filter;
    const matchSearch = !search ||
      it.title?.toLowerCase().includes(search.toLowerCase()) ||
      it.excerpt?.toLowerCase().includes(search.toLowerCase()) ||
      it.tags?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const featured  = filtered[0];
  const rest      = filtered.slice(1);

  if (loading) return <div className="view-loading">Cargando contenidos…</div>;

  return (
    <div className="content-view">
      <div className="view-header">
        <h1 className="view-title">Contenidos</h1>
        <p className="view-sub">Artículos, colecciones, toolkits y newsletters del equipo OCHO.</p>
      </div>

      {/* Filtros */}
      <div className="content-view-filters">
        <div className="content-view-tabs">
          {TYPES.map(t => (
            <button
              key={t.value}
              className={`content-view-tab${filter === t.value ? " active" : ""}`}
              onClick={() => setFilter(t.value)}
            >
              {t.label}
              {t.value !== "all" && (
                <span className="content-view-count">
                  {items.filter(i => i.type === t.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          className="content-view-search"
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="view-empty">
          {items.length === 0
            ? "Todavía no hay contenidos publicados."
            : "Sin resultados para este filtro."}
        </p>
      ) : (
        <>
          {/* Featured — primer resultado */}
          {featured && !search && filter === "all" && (
            <button className="content-featured" onClick={() => setReading(featured)}>
              {featured.cover_url && (
                <div className="content-featured-cover">
                  <img src={featured.cover_url} alt={featured.title} />
                </div>
              )}
              <div className="content-featured-body">
                <TypeBadge type={featured.type} />
                <h2 className="content-featured-title">{featured.title}</h2>
                {featured.excerpt && <p className="content-featured-excerpt">{featured.excerpt}</p>}
                <div className="content-card-meta">
                  {featured.author_name && <span>{featured.author_name}</span>}
                  {(featured.published_at || featured.updated_at) && (
                    <span>{formatDate(featured.published_at || featured.updated_at)}</span>
                  )}
                </div>
              </div>
            </button>
          )}

          {/* Grid */}
          <div className="content-grid">
            {(search || filter !== "all" ? filtered : rest).map(item => (
              <ContentCard key={item.uuid || item.id} item={item} onClick={setReading} />
            ))}
          </div>
        </>
      )}

      {reading && <ReaderModal item={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
