import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";

const STATUS_LABEL = {
  draft:     "borrador",
  active:    "activo",
  completed: "completado",
  archived:  "archivado",
};

const TYPE_LABEL = {
  web:         "Web",
  saas:        "SaaS",
  ecommerce:   "Ecommerce",
  marketplace: "Marketplace",
  ia:          "IA",
};

const PERM_LABEL = {
  owner:  "propietario",
  editor: "editor",
  viewer: "lector",
};

const TYPE_OPTIONS = ["web", "saas", "ecommerce", "marketplace", "ia"];

function NewProjectForm({ onAdd, onClose }) {
  const [fields, setFields] = useState({ title: "", type: "web", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(k, v) { setFields(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!fields.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({
          title:       fields.title.trim(),
          type:        fields.type,
          description: fields.description.trim(),
          status:      "active",
        }),
      });
      onAdd(res.project);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="resource-add-form" onSubmit={submit}>
      <div className="resource-form-row">
        <input
          className="resource-form-input"
          placeholder="Nombre del proyecto"
          value={fields.title}
          onChange={e => set("title", e.target.value)}
          autoFocus
          required
        />
        <select
          className="resource-form-select"
          value={fields.type}
          onChange={e => set("type", e.target.value)}
        >
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      <input
        className="resource-form-input"
        placeholder="Descripción (opcional)"
        value={fields.description}
        onChange={e => set("description", e.target.value)}
      />

      <div className="resource-form-row">
        <div style={{ flex: 1 }} />
        <div className="resource-form-actions">
          <button type="button" className="resource-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="resource-form-save" disabled={saving}>
            {saving ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </div>

      {error && <p className="resource-form-error">{error}</p>}
    </form>
  );
}

export default function ProjectsView() {
  const { user }            = useOutletContext();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    apiFetch("/api/user/projects")
      .then(res => setProjects(res.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(project) {
    setProjects(prev => [project, ...prev]);
  }

  if (loading) {
    return <div className="view-loading">Cargando proyectos…</div>;
  }

  return (
    <div className="projects-view">
      <header className="view-header">
        <div className="resources-header-row">
          <div>
            <h1 className="view-title">Proyectos</h1>
            <p className="view-sub">Espacios de trabajo asignados a tu cuenta.</p>
          </div>
          {isAdmin && !adding && (
            <button className="resources-add-btn" onClick={() => setAdding(true)}>
              + Nuevo proyecto
            </button>
          )}
        </div>
      </header>

      {adding && (
        <NewProjectForm onAdd={handleAdd} onClose={() => setAdding(false)} />
      )}

      {!projects.length ? (
        <p className="view-empty">Todavía no tenés proyectos asignados.</p>
      ) : (
        <div className="projects-grid">
          {projects.map(p => (
            <Link
              key={p.nocodb_id ?? p.id}
              to={`/panel/projects/${p.nocodb_id ?? p.id}`}
              className="project-card"
            >
              <div className="project-card-head">
                <span className="project-card-title">{p.title}</span>
                <span className={`project-card-status ${p.status ?? ""}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>

              {p.description && (
                <p className="project-card-desc">{p.description}</p>
              )}

              <div className="project-card-meta">
                <span className="project-card-type">
                  {TYPE_LABEL[p.type] ?? p.type ?? "—"}
                </span>
                <span className="project-card-perm">
                  {PERM_LABEL[p.permission] ?? p.permission ?? "lector"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
