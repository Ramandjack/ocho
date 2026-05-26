import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { formatDate } from "./adminUtils.jsx";
import { CONTENT_TYPE_HEX as TYPE_COLOR, CONTENT_TYPE_LABEL as TYPE_LABELS } from "../../lib/constants.js";

const SEGMENT_LABELS = {
  newsletter_only:    "Newsletter",
  ai_interest:        "IA / Sistemas",
  ecommerce_interest: "Ecommerce",
  editorial_interest: "Editorial",
  marketing_leads:    "Marketing",
};

export default function AdminDashboard() {
  const { users, leads, activity, content, refresh } = useAdminData();

  const stats = useMemo(() => ({
    activeUsers:      users.filter(u => (u.status || "active") === "active").length,
    admins:           users.filter(u => String(u.role || "").toLowerCase() === "admin").length,
    pending:          users.filter(u => u.status === "pending").length,
    banned:           users.filter(u => u.status === "banned").length,
    totalLeads:       leads.length,
    newLeads:         leads.filter(l => (l.stage || "new") === "new").length,
    totalContent:     content.length,
    publishedContent: content.filter(c => c.status === "published").length,
    draftContent:     content.filter(c => c.status === "draft").length,
  }), [users, leads, content]);

  const contentByType = useMemo(() => {
    const map = {};
    for (const c of content) { map[c.type] = (map[c.type] || 0) + 1; }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [content]);

  const recentContent = useMemo(() =>
    [...content]
      .sort((a, b) => new Date(b.updated_at || b.CreatedAt || 0) - new Date(a.updated_at || a.CreatedAt || 0))
      .slice(0, 5),
  [content]);

  const segmentRows = useMemo(() => {
    const map = {};
    for (const u of users) {
      const seg = u.segment || "newsletter_only";
      map[seg] = (map[seg] || 0) + 1;
    }
    const total = users.length || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key, label: SEGMENT_LABELS[key] || key, count,
        pct: Math.round((count / total) * 100),
      }));
  }, [users]);

  const budgetRows = useMemo(() => {
    const map = {};
    for (const l of leads) {
      const b = l.budget || "Sin especificar";
      map[b] = (map[b] || 0) + 1;
    }
    const total = leads.length || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100) }));
  }, [leads]);

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>Centro de control de OCHO.</h1>
          <p>Visión general del sistema.</p>
        </div>
        <button type="button" className="admin-btn primary" onClick={() => refresh()}>
          ↻ Refrescar
        </button>
      </section>

      <section className="admin-grid stats">
        {[
          { label: "Usuarios activos",  value: stats.activeUsers,      meta: "con acceso operativo" },
          { label: "Pendientes",        value: stats.pending,          meta: "en revisión" },
          { label: "Leads totales",     value: stats.totalLeads,       meta: "captados" },
          { label: "Leads nuevos",      value: stats.newLeads,         meta: "sin contactar" },
          { label: "Contenidos",        value: stats.totalContent,     meta: `${stats.publishedContent} publicados` },
          { label: "Borradores",        value: stats.draftContent,     meta: "pendientes de publicar" },
        ].map(({ label, value, meta }) => (
          <article key={label} className="admin-card">
            <div className="admin-stat-label">{label}</div>
            <div className="admin-stat-value">{value}</div>
            <div className="admin-stat-meta">{meta}</div>
          </article>
        ))}
      </section>

      <section className="admin-full">
        <article className="admin-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Contenido reciente</h2>
            <Link to="/admin/content" className="admin-link-sm">Ver todo →</Link>
          </div>
          {!recentContent.length ? (
            <p className="admin-muted">Sin contenidos aún. <Link to="/admin/content" className="admin-link-sm">Crear primero</Link></p>
          ) : (
            <div className="admin-list">
              {recentContent.map(item => (
                <div key={item.uuid || item.id} className="admin-list-item content-dash-row">
                  <div className="content-dash-info">
                    <span className="content-dash-title">{item.title}</span>
                    <span className="content-dash-meta">{item.author_name || "—"}</span>
                  </div>
                  <div className="content-dash-right">
                    <span className="admin-badge" style={{ background: `${TYPE_COLOR[item.type]}22`, color: TYPE_COLOR[item.type] || "var(--am)" }}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className={`admin-badge ${item.status === "published" ? "green" : item.status === "archived" ? "gray" : "yellow"}`}>
                      {item.status === "published" ? "Publicado" : item.status === "archived" ? "Archivado" : "Borrador"}
                    </span>
                    <span className="admin-muted" style={{ fontSize: "0.75rem" }}>
                      {item.updated_at ? formatDate(item.updated_at) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="admin-kpis">
        <article className="admin-card">
          <h2>Segmentos de usuarios</h2>
          {!segmentRows.length ? (
            <p className="admin-muted">Sin datos.</p>
          ) : segmentRows.map(row => (
            <div key={row.key} className="segment-row">
              <span className="segment-label">{row.label}</span>
              <div className="segment-bar-wrap">
                <div className="segment-bar" style={{ width: `${row.pct}%` }} />
              </div>
              <span className="segment-count">{row.count} · {row.pct}%</span>
            </div>
          ))}
        </article>

        <article className="admin-card">
          <h2>Distribución de presupuestos</h2>
          {!budgetRows.length ? (
            <p className="admin-muted">Sin leads aún.</p>
          ) : budgetRows.map(row => (
            <div key={row.key} className="segment-row">
              <span className="segment-label">{row.key}</span>
              <div className="segment-bar-wrap">
                <div className="segment-bar" style={{ width: `${row.pct}%`, background: "var(--admin-warning)" }} />
              </div>
              <span className="segment-count">{row.count}</span>
            </div>
          ))}
        </article>
      </section>

      <section className="admin-kpis">
        <article className="admin-card">
          <h2>Contenido por tipo</h2>
          {!contentByType.length ? (
            <p className="admin-muted">Sin contenidos aún.</p>
          ) : contentByType.map(([type, count]) => {
            const total = content.length || 1;
            const pct   = Math.round((count / total) * 100);
            return (
              <div key={type} className="segment-row">
                <span className="segment-label">{TYPE_LABELS[type] || type}</span>
                <div className="segment-bar-wrap">
                  <div className="segment-bar" style={{ width: `${pct}%`, background: TYPE_COLOR[type] || "var(--admin-success)" }} />
                </div>
                <span className="segment-count">{count} · {pct}%</span>
              </div>
            );
          })}
        </article>

        <article className="admin-card">
          <h2>Estado de contenidos</h2>
          {!content.length ? (
            <p className="admin-muted">Sin contenidos aún.</p>
          ) : [
            { label: "Publicados", count: stats.publishedContent, color: "var(--admin-success)" },
            { label: "Borradores", count: stats.draftContent,     color: "var(--admin-warning)" },
            { label: "Archivados", count: content.filter(c => c.status === "archived").length, color: "var(--am)" },
          ].map(row => {
            const pct = Math.round((row.count / (content.length || 1)) * 100);
            return (
              <div key={row.label} className="segment-row">
                <span className="segment-label">{row.label}</span>
                <div className="segment-bar-wrap">
                  <div className="segment-bar" style={{ width: `${pct}%`, background: row.color }} />
                </div>
                <span className="segment-count">{row.count}</span>
              </div>
            );
          })}
        </article>
      </section>

      <section className="admin-full">
        <article className="admin-card">
          <h2>Actividad reciente</h2>
          <div className="admin-list">
            {!activity.length ? (
              <p className="admin-muted">Sin actividad reciente.</p>
            ) : activity.slice(0, 20).map((entry, i) => (
              <div key={i} className="admin-list-item">
                <strong>{entry.action}</strong>
                <span className="admin-muted"> · {entry.entity} #{entry.entity_id}</span>
                {entry.detail && <p className="admin-muted" style={{ fontSize: "0.82rem", marginTop: 2 }}>{entry.detail}</p>}
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
