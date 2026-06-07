import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { timeAgo } from "../../lib/utils.js";
import { CONTENT_TYPE_COLOR as TYPE_COLOR, CONTENT_TYPE_LABEL as TYPE_LABEL } from "../../lib/constants.js";

const STATUS_LABEL = {
  pending:     "pendiente",
  in_progress: "en curso",
  done:        "completado",
};

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

const TAGS = ["CONTENIDO", "RECURSOS EXCLUSIVOS", "EDITORIAL", "CRM COMMUNITY"];

export default function DashboardView() {
  const { user, show }              = useOutletContext();
  const [data, setData]             = useState(null);
  const [content, setContent]       = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    apiFetch("/api/user/dashboard")
      .then(r => {
        setData(r.dashboard);
        setContent(r.dashboard?.recent_content ?? []);
      })
      .catch(err => show(err.message || "Error cargando el dashboard", "error"))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name || user?.full_name?.split(" ")[0] || "Usuario";
  const initials  = (
    (user?.first_name?.[0] || user?.full_name?.[0] || "U") +
    (user?.last_name?.[0]  || user?.full_name?.split(" ")?.[1]?.[0] || "")
  ).toUpperCase();

  if (loading) {
    return (
      <div className="dashboard">
        <div className="skeleton-block" style={{ height: "220px", borderRadius: "var(--radius-sm, 8px)" }} />
        <div className="dashboard-stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="stat-card" style={{ gap: "0.6rem" }}>
              <div className="skeleton-block" style={{ height: "2.4rem", width: "3rem" }} />
              <div className="skeleton-block" style={{ height: "0.7rem", width: "5rem" }} />
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          {[0, 1].map(i => (
            <div key={i} className="dashboard-section" style={{ gap: "0.75rem" }}>
              <div className="skeleton-block" style={{ height: "0.7rem", width: "8rem" }} />
              {[0, 1, 2].map(j => (
                <div key={j} className="skeleton-block" style={{ height: "2rem" }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tasks         = data?.recent_tasks         ?? [];
  const notifications = data?.recent_notifications ?? [];

  return (
    <div className="dashboard">

      {/* ── Hero editorial ───────────────────────────────────── */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-member">
          <span className="dashboard-hero-line" />
          <span className="dashboard-hero-member-label">Member Area</span>
        </div>

        <h1 className="dashboard-hero-title">
          Bienvenido al ecosistema privado de OCHO.
        </h1>

        <p className="dashboard-hero-sub">
          Un espacio para acceder a contenido curado, recursos estratégicos,
          piezas editoriales y futuras herramientas del sistema.
        </p>

        <div className="dashboard-hero-tags">
          {TAGS.map(t => (
            <span key={t} className="dashboard-hero-tag">{t}</span>
          ))}
        </div>

        <div className="dashboard-hero-chip">
          <span className="dashboard-hero-avatar">{initials}</span>
          <span className="dashboard-hero-chip-text">
            Hola, <strong>{firstName}</strong> — acceso activo
          </span>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="dashboard-stats">
        <StatCard value={data?.projects_count      ?? 0} label="proyectos" />
        <StatCard value={data?.tasks_total         ?? 0} label="tareas" />
        <StatCard value={data?.tasks_in_progress   ?? 0} label="en curso" />
        <StatCard value={data?.notifications_unread ?? 0} label="sin leer" />
      </section>

      {/* ── Grid de actividad ────────────────────────────────── */}
      <div className="dashboard-grid">
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h2 className="dashboard-section-title">Tareas recientes</h2>
            <Link to="/panel/tasks" className="dashboard-section-link">Ver todas</Link>
          </div>

          {!tasks.length ? (
            <p className="dashboard-empty">Todavía no tenés tareas asignadas.</p>
          ) : (
            <ul className="dashboard-list">
              {tasks.map(task => (
                <li key={task.nocodb_id ?? task.id} className="dashboard-list-item">
                  <span className="dashboard-list-title">{task.title}</span>
                  <span className={`dashboard-status ${task.status ?? ""}`}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h2 className="dashboard-section-title">Actividad reciente</h2>
          </div>

          {!notifications.length ? (
            <p className="dashboard-empty">Sin actividad reciente en el sistema.</p>
          ) : (
            <ul className="dashboard-list">
              {notifications.map(n => (
                <li
                  key={n.nocodb_id ?? n.id}
                  className={`dashboard-list-item${!n.read ? " unread" : ""}`}
                >
                  <span className="dashboard-list-title">{n.title}</span>
                  <span className="dashboard-list-time">
                    {timeAgo(n.CreatedAt ?? n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Contenido reciente ───────────────────────────────── */}
      {content.length > 0 && (
        <section className="dashboard-content-section">
          <div className="dashboard-section-head">
            <h2 className="dashboard-section-title">Contenido reciente</h2>
            <Link to="/panel/content" className="dashboard-section-link">Ver todo</Link>
          </div>

          <div className="dashboard-content-grid">
            {content.map(item => {
              const color = TYPE_COLOR[item.type] || { bg: "rgba(255,255,255,.06)", text: "rgba(255,255,255,.5)" };
              const date  = item.published_at || item.updated_at || item.CreatedAt;
              return (
                <Link key={item.uuid || item.id} to="/panel/content" className="dashboard-content-card">
                  {item.cover_url && (
                    <div className="dashboard-content-cover">
                      <img src={item.cover_url} alt={item.title} loading="lazy" />
                    </div>
                  )}
                  <div className="dashboard-content-body">
                    <span className="content-badge" style={{ background: color.bg, color: color.text }}>
                      {TYPE_LABEL[item.type] || item.type}
                    </span>
                    <p className="dashboard-content-title">{item.title}</p>
                    {item.excerpt && (
                      <p className="dashboard-content-excerpt">{item.excerpt}</p>
                    )}
                    {date && (
                      <span className="dashboard-content-date">
                        {new Date(date).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
