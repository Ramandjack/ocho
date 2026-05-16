import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";

const STATUS_LABEL = {
  draft:     "borrador",
  active:    "activo",
  completed: "completado",
  archived:  "archivado",
};

const TYPE_LABEL = {
  web:    "Web",
  app:    "App",
  design: "Diseño",
  other:  "Otro",
};

const PERM_LABEL = {
  owner:  "propietario",
  editor: "editor",
  viewer: "lector",
};

export default function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    apiFetch("/api/user/projects")
      .then(res => setProjects(res.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="view-loading">Cargando proyectos…</div>;
  }

  return (
    <div className="projects-view">
      <header className="view-header">
        <h1 className="view-title">Proyectos</h1>
        <p className="view-sub">Espacios de trabajo asignados a tu cuenta.</p>
      </header>

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
