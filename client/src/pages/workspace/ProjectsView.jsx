import { useEffect, useRef, useState } from "react";
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
  editor: "editor",
  viewer: "lector",
};

const TYPE_OPTIONS = ["web", "saas", "ecommerce", "marketplace", "ia"];

function NewProjectForm({ onSuccess, onClose }) {
  const [title, setTitle]             = useState("");
  const [type, setType]               = useState("web");
  const [description, setDescription] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [titleDirty, setTitleDirty]   = useState(false);

  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const titleInvalid = titleDirty && !title.trim();

  async function submit(e) {
    e.preventDefault();
    setTitleDirty(true);
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({
          title:       title.trim(),
          type,
          description: description.trim(),
          status:      "active",
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="project-form" onSubmit={submit} noValidate>

      {/* Fila título + tipo */}
      <div className="project-form-row">
        <div className="project-form-field" style={{ flex: 1 }}>
          <input
            ref={titleRef}
            className={`project-form-input${titleInvalid ? " invalid" : ""}`}
            placeholder="Nombre del proyecto"
            value={title}
            onChange={e => { setTitle(e.target.value); setTitleDirty(true); }}
            disabled={saving}
            autoComplete="off"
          />
          {titleInvalid && (
            <span className="project-form-hint">El nombre es obligatorio.</span>
          )}
        </div>

        <select
          className="project-form-select"
          value={type}
          onChange={e => setType(e.target.value)}
          disabled={saving}
        >
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {/* Descripción */}
      <input
        className="project-form-input"
        placeholder="Descripción (opcional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        disabled={saving}
        autoComplete="off"
      />

      {/* Footer */}
      <div className="project-form-footer">
        {error ? (
          <span className="project-form-error">{error}</span>
        ) : (
          <span className="project-form-hint dim">Esc para cancelar</span>
        )}
        <div className="project-form-actions">
          <button
            type="button"
            className="project-form-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="project-form-save"
            disabled={saving}
          >
            {saving ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function ProjectsView() {
  const { user }                    = useOutletContext();
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [adding, setAdding]         = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  async function fetchProjects() {
    try {
      const res = await apiFetch("/api/user/projects");
      setProjects(res.projects ?? []);
    } catch {
      /* mantener lista actual si falla */
    }
  }

  useEffect(() => {
    fetchProjects().finally(() => setLoading(false));
  }, []);

  async function handleSuccess() {
    setAdding(false);
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }

  if (loading) {
    return <div className="view-loading">Cargando proyectos…</div>;
  }

  return (
    <div className="projects-view">
      <header className="view-header">
        <div className="projects-header-row">
          <div>
            <h1 className="view-title">Proyectos</h1>
            <p className="view-sub">
              {refreshing ? "Actualizando…" : "Espacios de trabajo asignados a tu cuenta."}
            </p>
          </div>
          {isAdmin && !adding && (
            <button className="projects-add-btn" onClick={() => setAdding(true)}>
              + Nuevo proyecto
            </button>
          )}
        </div>
      </header>

      {adding && (
        <NewProjectForm
          onSuccess={handleSuccess}
          onClose={() => setAdding(false)}
        />
      )}

      {!projects.length && !adding ? (
        <div className="projects-empty">
          <p className="view-empty">Todavía no tenés proyectos asignados.</p>
          {isAdmin && (
            <button className="projects-empty-cta" onClick={() => setAdding(true)}>
              Crear tu primer proyecto
            </button>
          )}
        </div>
      ) : (
        <div className={`projects-grid${refreshing ? " refreshing" : ""}`}>
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
