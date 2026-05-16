import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";

const STATUS_LABEL = {
  pending:     "pendiente",
  in_progress: "en curso",
  done:        "completado",
};

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function DashboardView() {
  const { user }  = useOutletContext();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/user/dashboard")
      .then(res => setData(res.dashboard))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name || user?.full_name?.split(" ")[0] || "Hola";

  if (loading) {
    return <div className="dashboard-loading">Cargando sistema…</div>;
  }

  const tasks         = data?.recent_tasks         ?? [];
  const notifications = data?.recent_notifications ?? [];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <p className="dashboard-greeting">Hola, {firstName}.</p>
        <p className="dashboard-sub">Estado actual de tu sistema.</p>
      </header>

      <section className="dashboard-stats">
        <StatCard value={data?.projects_count     ?? 0} label="proyectos" />
        <StatCard value={data?.tasks_total        ?? 0} label="tareas" />
        <StatCard value={data?.tasks_in_progress  ?? 0} label="en curso" />
        <StatCard value={data?.notifications_unread ?? 0} label="sin leer" />
      </section>

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
    </div>
  );
}
