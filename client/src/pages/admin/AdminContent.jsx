import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { ToastContainer, formatDate } from "./adminUtils.jsx";

const TYPES = [
  { value: "article",    label: "Artículo" },
  { value: "collection", label: "Colección" },
  { value: "toolkit",    label: "Toolkit" },
  { value: "newsletter", label: "Newsletter" },
];

const STATUSES = [
  { value: "draft",     label: "Borrador" },
  { value: "published", label: "Publicado" },
  { value: "archived",  label: "Archivado" },
];

const TYPE_LABELS    = Object.fromEntries(TYPES.map(t => [t.value, t.label]));
const STATUS_LABELS  = Object.fromEntries(STATUSES.map(s => [s.value, s.label]));

const EMPTY_FORM = {
  title: "", type: "article", excerpt: "", body: "",
  tags: "", cover_url: "", author_name: "",
};

export default function AdminContent() {
  const { content, setContent } = useAdminData();
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const { toasts, show }          = useToast();

  useEffect(() => {
    if (modal) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [modal]);

  function openCreate(typePreset) {
    setForm({ ...EMPTY_FORM, type: typePreset || "article" });
    setEditTarget(null);
    setModal("create");
  }

  function openEdit(item) {
    setForm({
      title:       item.title       || "",
      type:        item.type        || "article",
      excerpt:     item.excerpt     || "",
      body:        item.body        || "",
      tags:        item.tags        || "",
      cover_url:   item.cover_url   || "",
      author_name: item.author_name || "",
    });
    setEditTarget(item);
    setModal("edit");
  }

  function closeModal() { setModal(null); setEditTarget(null); }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { show("El título es obligatorio", "error"); return; }
    setSubmitting(true);
    try {
      if (modal === "create") {
        const r = await apiFetch("/api/admin/content", {
          method: "POST",
          body: JSON.stringify(form),
        });
        if (r.success) {
          setContent(prev => [r.content, ...prev]);
          show("Contenido creado", "success");
          closeModal();
        } else {
          show(r.message || "Error al guardar", "error");
        }
      } else {
        const id = editTarget.uuid || editTarget.nocodb_id || editTarget.id;
        const r = await apiFetch(`/api/admin/content/${id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        if (r.success) {
          setContent(prev => prev.map(i =>
            (i.uuid || i.id) === (editTarget.uuid || editTarget.id) ? { ...i, ...form } : i
          ));
          show("Contenido actualizado", "success");
          closeModal();
        } else {
          show(r.message || "Error al guardar", "error");
        }
      }
    } catch (err) {
      show(err.message || "Error de conexión", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(item) {
    const id = item.uuid || item.nocodb_id || item.id;
    try {
      const r = await apiFetch(`/api/admin/content/${id}/publish`, { method: "PATCH" });
      if (r.success) {
        setContent(prev => prev.map(i =>
          (i.uuid || i.id) === (item.uuid || item.id)
            ? { ...i, status: "published", published_at: new Date().toISOString() }
            : i
        ));
        show(`"${item.title}" publicado`, "success");
      } else show(r.message || "Error al publicar", "error");
    } catch (err) { show(err.message || "Error de conexión", "error"); }
  }

  async function handleStatusChange(item, status) {
    const id = item.uuid || item.nocodb_id || item.id;
    try {
      const r = await apiFetch(`/api/admin/content/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (r.success) {
        setContent(prev => prev.map(i =>
          (i.uuid || i.id) === (item.uuid || item.id) ? { ...i, status } : i
        ));
        show("Estado actualizado", "success");
      } else show(r.message || "Error", "error");
    } catch (err) { show(err.message || "Error de conexión", "error"); }
  }

  async function handleDelete(item) {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    const id = item.uuid || item.nocodb_id || item.id;
    try {
      const r = await apiFetch(`/api/admin/content/${id}`, { method: "DELETE" });
      if (r.success) {
        setContent(prev => prev.filter(i => (i.uuid || i.id) !== (item.uuid || item.id)));
        show("Eliminado", "success");
      } else show(r.message || "Error", "error");
    } catch (err) { show(err.message || "Error de conexión", "error"); }
  }

  const filtered = content.filter(it => {
    const matchType   = filter === "all" || it.type === filter;
    const matchSearch = !search || it.title?.toLowerCase().includes(search.toLowerCase()) ||
                        it.author_name?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const countBy = type => content.filter(i => i.type === type).length;
  const published = content.filter(i => i.status === "published").length;
  const drafts    = content.filter(i => i.status === "draft").length;

  function statusBadge(status) {
    const cls = { published: "green", draft: "yellow", archived: "gray" }[status] || "gray";
    return <span className={`admin-badge ${cls}`}>{STATUS_LABELS[status] || status}</span>;
  }

  function typeBadge(type) {
    const cls = { article: "blue", collection: "purple", toolkit: "teal", newsletter: "orange" }[type] || "gray";
    return <span className={`admin-badge content-type-${cls}`}>{TYPE_LABELS[type] || type}</span>;
  }

  return (
    <div className="admin-section">
      <ToastContainer toasts={toasts} />

      <div className="admin-section-header">
        <h2>Gestión de contenidos</h2>
        <div className="content-header-actions">
          <button className="admin-btn secondary" onClick={() => openCreate("newsletter")}>
            Publicar Newsletter
          </button>
          <button className="admin-btn secondary" onClick={() => openCreate("collection")}>
            Nueva Colección
          </button>
          <button className="admin-btn primary" onClick={() => openCreate("article")}>
            + Nuevo Artículo
          </button>
        </div>
      </div>

      <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))" }}>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{content.length}</div>
          <div className="admin-stat-label">Total</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{published}</div>
          <div className="admin-stat-label">Publicados</div>
        </div>
        <div className="admin-stat-card" style={drafts > 0 ? { borderColor: "var(--admin-warning)", background: "rgba(255,211,107,.07)" } : {}}>
          <div className="admin-stat-value">{drafts}</div>
          <div className="admin-stat-label">Borradores</div>
        </div>
        {TYPES.map(t => (
          <div key={t.value} className="admin-stat-card">
            <div className="admin-stat-value">{countBy(t.value)}</div>
            <div className="admin-stat-label">{t.label}s</div>
          </div>
        ))}
      </div>

      <div className="content-filters">
        <div className="content-type-tabs">
          <button className={`content-tab${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
            Todos ({content.length})
          </button>
          {TYPES.map(t => (
            <button
              key={t.value}
              className={`content-tab${filter === t.value ? " active" : ""}`}
              onClick={() => setFilter(t.value)}
            >
              {t.label}s ({countBy(t.value)})
            </button>
          ))}
        </div>
        <input
          className="admin-input content-search"
          placeholder="Buscar por título o autor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="admin-card">
        {filtered.length === 0 ? (
          <p style={{ color: "var(--text-muted, rgba(255,255,255,.5))", fontSize: ".875rem", padding: "1rem 0" }}>
            {content.length === 0 ? "Todavía no hay contenidos. ¡Creá el primero!" : "Sin resultados para este filtro."}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Autor</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.uuid || item.id}>
                    <td>
                      <div className="content-title-cell">
                        <span className="content-title">{item.title}</span>
                        {item.excerpt && (
                          <span className="content-excerpt">{item.excerpt.slice(0, 60)}{item.excerpt.length > 60 ? "…" : ""}</span>
                        )}
                      </div>
                    </td>
                    <td>{typeBadge(item.type)}</td>
                    <td>{statusBadge(item.status)}</td>
                    <td>{item.author_name || "—"}</td>
                    <td>{item.updated_at ? formatDate(item.updated_at) : (item.CreatedAt ? formatDate(item.CreatedAt) : "—")}</td>
                    <td>
                      <div className="content-row-actions">
                        <button className="admin-btn-sm" onClick={() => openEdit(item)}>Editar</button>
                        {item.status !== "published" && (
                          <button className="admin-btn-sm green" onClick={() => handlePublish(item)}>Publicar</button>
                        )}
                        {item.status === "published" && (
                          <button className="admin-btn-sm" onClick={() => handleStatusChange(item, "archived")}>Archivar</button>
                        )}
                        {item.status === "archived" && (
                          <button className="admin-btn-sm" onClick={() => handleStatusChange(item, "draft")}>Reabrir</button>
                        )}
                        <button className="admin-btn-sm danger" onClick={() => handleDelete(item)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal content-modal" onClick={e => e.stopPropagation()}>
            <h3>{modal === "create" ? "Nuevo contenido" : `Editar — ${editTarget?.title}`}</h3>

            <form onSubmit={handleSubmit} className="content-form">
              <div className="content-form-row">
                <div className="content-form-group">
                  <label className="admin-label">Título *</label>
                  <input
                    className="admin-input"
                    value={form.title}
                    onChange={e => setField("title", e.target.value)}
                    placeholder="Título del contenido"
                    required
                    autoFocus
                  />
                </div>
                <div className="content-form-group narrow">
                  <label className="admin-label">Tipo</label>
                  <select className="admin-input" value={form.type} onChange={e => setField("type", e.target.value)}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="content-form-group">
                <label className="admin-label">Extracto / descripción corta</label>
                <input
                  className="admin-input"
                  value={form.excerpt}
                  onChange={e => setField("excerpt", e.target.value)}
                  placeholder="Una línea que resume el contenido"
                />
              </div>

              <div className="content-form-group">
                <label className="admin-label">Contenido / cuerpo</label>
                <textarea
                  className="admin-input content-body-input"
                  value={form.body}
                  onChange={e => setField("body", e.target.value)}
                  placeholder="Texto completo, Markdown soportado…"
                  rows={6}
                />
              </div>

              <div className="content-form-row">
                <div className="content-form-group">
                  <label className="admin-label">Autor</label>
                  <input
                    className="admin-input"
                    value={form.author_name}
                    onChange={e => setField("author_name", e.target.value)}
                    placeholder="Nombre del autor"
                  />
                </div>
                <div className="content-form-group">
                  <label className="admin-label">Tags</label>
                  <input
                    className="admin-input"
                    value={form.tags}
                    onChange={e => setField("tags", e.target.value)}
                    placeholder="IA, diseño, estrategia…"
                  />
                </div>
              </div>

              <div className="content-form-group">
                <label className="admin-label">URL de portada (imagen)</label>
                <input
                  className="admin-input"
                  value={form.cover_url}
                  onChange={e => setField("cover_url", e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="admin-modal-actions">
                <button type="submit" className="admin-btn primary" disabled={submitting}>
                  {submitting ? "Guardando…" : modal === "create" ? "Crear" : "Guardar cambios"}
                </button>
                <button type="button" className="admin-btn" onClick={closeModal}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
