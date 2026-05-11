import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import "./admin-console.css";

const POLL_MS = 60_000;

const SEGMENT_LABELS = {
  newsletter_only: "Newsletter",
  ai_interest: "IA / Sistemas",
  ecommerce_interest: "Ecommerce",
  editorial_interest: "Editorial",
  marketing_leads: "Marketing",
};

function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
}

function leadRecordId(lead) {
  return lead.nocodb_record_id || lead.Id || "";
}

function stageClass(stage) {
  if (stage === "new") return "warning";
  if (stage === "qualified") return "success";
  if (stage === "closed") return "danger";
  return "";
}

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStageFilter, setLeadStageFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const logActivity = useCallback((message) => {
    const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    setActivityLog((prev) => [{ time, message }, ...prev].slice(0, 20));
  }, []);

  const showToast = useCallback((message, type = "") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, leadsData] = await Promise.all([
        apiFetch("/api/admin/users"),
        apiFetch("/api/admin/leads"),
      ]);
      setUsers(usersData.users || []);
      setLeads(leadsData.leads || []);
    } catch (err) {
      showToast(`Error cargando datos: ${err.message}`, "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const t = setInterval(() => {
      loadAll();
      logActivity("Auto-refresco de datos.");
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadAll, logActivity]);

  const filteredUsers = useMemo(() => {
    const s = userSearch.toLowerCase();
    return users.filter((u) => {
      const name = `${u.full_name || ""} ${u.email || ""} ${u.company || ""}`.toLowerCase();
      const matchSearch = !s || name.includes(s);
      const matchRole = userRoleFilter === "all" || normalizeRole(u.role) === userRoleFilter;
      const matchStatus = userStatusFilter === "all" || (u.status || "active") === userStatusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  const filteredLeads = useMemo(() => {
    const s = leadSearch.toLowerCase();
    return leads.filter((l) => {
      const text = `${l.name || ""} ${l.email || ""} ${l.company || ""} ${l.project_type || ""}`.toLowerCase();
      const matchSearch = !s || text.includes(s);
      const matchStage = leadStageFilter === "all" || (l.stage || "new") === leadStageFilter;
      return matchSearch && matchStage;
    });
  }, [leads, leadSearch, leadStageFilter]);

  const stats = useMemo(() => {
    const activeUsers = users.filter((u) => (u.status || "active") === "active").length;
    const admins = users.filter((u) => normalizeRole(u.role) === "admin").length;
    const pending = users.filter((u) => u.status === "pending").length;
    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => (l.stage || "new") === "new").length;
    return { activeUsers, admins, pending, totalLeads, newLeads };
  }, [users, leads]);

  const segmentRows = useMemo(() => {
    const segments = {};
    for (const u of users) {
      const seg = u.segment || "newsletter_only";
      segments[seg] = (segments[seg] || 0) + 1;
    }
    const total = users.length || 1;
    return Object.entries(segments)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: SEGMENT_LABELS[key] || key,
        count,
        pct: Math.round((count / total) * 100),
      }));
  }, [users]);

  const budgetRows = useMemo(() => {
    const budgets = {};
    for (const l of leads) {
      const b = l.budget || "Sin especificar";
      budgets[b] = (budgets[b] || 0) + 1;
    }
    const total = leads.length || 1;
    return Object.entries(budgets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100) }));
  }, [leads]);

  async function changeRole(uuid, newRole) {
    if (!uuid) return;
    if (!window.confirm(`¿Cambiar rol de este usuario a "${newRole}"?`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      if (res.success) {
        setUsers((prev) => prev.map((u) => (u.uuid === uuid ? { ...u, role: newRole } : u)));
        logActivity(`Rol cambiado a "${newRole}" para UUID ${uuid.slice(0, 8)}…`);
        showToast(`Rol actualizado a ${newRole}`, "success");
        setModal(null);
      } else {
        showToast(res.message || "Error actualizando rol", "danger");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "danger");
    }
  }

  async function changeStatus(uuid, newStatus) {
    if (!uuid) return;
    const labels = { banned: "banear", active: "activar", pending: "poner en pendiente" };
    if (!window.confirm(`¿Estás seguro que querés ${labels[newStatus] || newStatus} este usuario?`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.success) {
        setUsers((prev) => prev.map((u) => (u.uuid === uuid ? { ...u, status: newStatus } : u)));
        logActivity(`Status → "${newStatus}" · ${uuid.slice(0, 8)}…`);
        showToast(res.message || `Usuario ${newStatus}`, "success");
        setModal(null);
      } else {
        showToast(res.message || "Error actualizando status", "danger");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "danger");
    }
  }

  async function deleteUser(uuid, userName) {
    if (!uuid) return;
    if (!window.confirm(`⚠️ ¿Eliminar permanentemente a "${userName}"?\n\nEsta acción NO se puede deshacer.`)) return;
    if (!window.confirm(`Confirmación final: ¿seguro que querés eliminar a "${userName}"?`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}`, { method: "DELETE" });
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u.uuid !== uuid));
        logActivity(`Usuario eliminado · ${uuid.slice(0, 8)}…`);
        showToast("Usuario eliminado correctamente", "success");
        setModal(null);
      } else {
        showToast(res.message || "Error eliminando usuario", "danger");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "danger");
    }
  }

  async function updateLeadStage(recordId, newStage) {
    if (!recordId) {
      showToast("ID de lead no disponible para esta operación.", "danger");
      return;
    }
    try {
      const res = await apiFetch(`/api/admin/leads/${recordId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.success) {
        setLeads((prev) =>
          prev.map((l) => ((l.nocodb_record_id || l.Id) === recordId ? { ...l, stage: newStage } : l))
        );
        showToast(`Lead marcado como "${newStage}"`, "success");
      } else {
        showToast(res.message || "Error actualizando lead", "danger");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "danger");
    }
  }

  function exportCSV(rows, filename) {
    if (!rows.length) {
      showToast("No hay datos para exportar.", "danger");
      return;
    }
    const keys = Object.keys(rows[0]).filter((k) => !["password_hash", "passwordHash"].includes(k));
    const header = keys.join(",");
    const body = rows
      .map((row) =>
        keys
          .map((k) => {
            const v = row[k] ?? "";
            const str = String(v).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(`Exportado: ${filename}`);
    showToast(`Exportado ${rows.length} registros.`, "success");
  }

  const adminName = user?.full_name || `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Admin";

  return (
    <div className="admin-body protected-page">
      <div id="adminLoadingBar" style={{ display: loading ? "block" : "none" }} />

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-word">OCHO</span>
            <span className="admin-role-badge">Admin</span>
          </div>

          <nav className="admin-nav">
            <div className="admin-nav-group">
              <span className="admin-nav-label">Visión general</span>
              <a href="#overview" className="active">
                Dashboard
              </a>
              <a href="#users">Usuarios</a>
              <a href="#leads">Leads</a>
              <a href="#analytics">Analítica</a>
              <a href="#content">Contenidos</a>
              <a href="#security">Seguridad</a>
              <a href="#settings">Sistema</a>
            </div>
            <div className="admin-nav-group">
              <span className="admin-nav-label">Acciones</span>
              <Link to="/panel">← Panel cliente</Link>
              <Link to="/logout" id="logoutBtn">
                Cerrar sesión
              </Link>
            </div>
          </nav>

          <div className="admin-user-box">
            <strong>{adminName}</strong>
            <span>{user?.email}</span>
            <span>Rol: {user?.role}</span>
          </div>
        </aside>

        <main className="admin-main">
          <section className="admin-topbar" id="overview">
            <div>
              <p className="eyebrow">Admin Console</p>
              <h1>Centro de control de OCHO.</h1>
              <p>Gestión de usuarios, leads, contenido, seguridad y configuración del sistema.</p>
            </div>
            <div className="admin-top-actions">
              <button
                type="button"
                className="admin-btn primary"
                onClick={() => {
                  logActivity("Datos recargados manualmente.");
                  loadAll();
                }}
              >
                ↻ Refrescar
              </button>
              <button type="button" className="admin-btn" onClick={() => exportCSV(filteredUsers, "ocho_usuarios.csv")}>
                ↓ Exportar usuarios
              </button>
              <button type="button" className="admin-btn" onClick={() => exportCSV(filteredLeads, "ocho_leads.csv")}>
                ↓ Exportar leads
              </button>
            </div>
          </section>

          <section className="admin-grid stats">
            <article className="admin-card">
              <div className="admin-stat-label">Usuarios activos</div>
              <div className="admin-stat-value">{stats.activeUsers}</div>
              <div className="admin-stat-meta">con acceso operativo</div>
            </article>
            <article className="admin-card">
              <div className="admin-stat-label">Leads totales</div>
              <div className="admin-stat-value">{stats.totalLeads}</div>
              <div className="admin-stat-meta">captados desde formularios</div>
            </article>
            <article className="admin-card">
              <div className="admin-stat-label">Leads nuevos</div>
              <div className="admin-stat-value">{stats.newLeads}</div>
              <div className="admin-stat-meta">sin contactar aún</div>
            </article>
            <article className="admin-card">
              <div className="admin-stat-label">Administradores</div>
              <div className="admin-stat-value">{stats.admins}</div>
              <div className="admin-stat-meta">usuarios privilegiados</div>
            </article>
            <article className="admin-card">
              <div className="admin-stat-label">Pendientes</div>
              <div className="admin-stat-value">{stats.pending}</div>
              <div className="admin-stat-meta">en revisión o espera</div>
            </article>
          </section>

          <section className="admin-sections" id="users">
            <article className="admin-card">
              <h2>Gestión de usuarios</h2>
              <div className="admin-controls">
                <input
                  className="admin-control"
                  type="search"
                  placeholder="Buscar por nombre, email, empresa…"
                  style={{ flex: 1, minWidth: 160 }}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                <select className="admin-control" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                  <option value="all">Todos los roles</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
                <select
                  className="admin-control"
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="pending">Pendiente</option>
                  <option value="banned">Suspendido</option>
                </select>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Último acceso</th>
                      <th>Segmento</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredUsers.length ? (
                      <tr>
                        <td colSpan={6} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>
                          Sin usuarios que coincidan.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const role = normalizeRole(u.role);
                        const status = u.status || "active";
                        const name =
                          u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
                        const lastLogin = u.last_login_at ? formatDate(u.last_login_at) : "Nunca";
                        const isAdmin = role === "admin";
                        return (
                          <tr key={u.uuid}>
                            <td>
                              <div className="user-cell">
                                <div className="user-avatar" aria-hidden="true">
                                  {getInitials(name)}
                                </div>
                                <div>
                                  <strong>{name}</strong>
                                  <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`admin-pill ${isAdmin ? "warning" : ""}`}>{role}</span>
                            </td>
                            <td>
                              <span
                                className={`admin-pill ${
                                  status === "active" ? "success" : status === "pending" ? "warning" : "danger"
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="admin-muted" style={{ fontSize: "0.88rem" }}>
                              {lastLogin}
                            </td>
                            <td className="admin-muted" style={{ fontSize: "0.82rem" }}>
                              {u.segment || "—"}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    className="admin-btn"
                                    onClick={() => changeRole(u.uuid, "member")}
                                    title="Quitar admin"
                                  >
                                    ↓ Member
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-btn"
                                    onClick={() => changeRole(u.uuid, "admin")}
                                    title="Hacer admin"
                                  >
                                    ↑ Admin
                                  </button>
                                )}
                                {status === "banned" ? (
                                  <button
                                    type="button"
                                    className="admin-btn"
                                    style={{ color: "var(--aok)" }}
                                    onClick={() => changeStatus(u.uuid, "active")}
                                  >
                                    ✓ Activar
                                  </button>
                                ) : (
                                  <button type="button" className="admin-btn danger" onClick={() => changeStatus(u.uuid, "banned")}>
                                    ⊘ Banear
                                  </button>
                                )}
                                <button type="button" className="admin-btn" onClick={() => setModal({ type: "user", user: u })}>
                                  Ver
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="admin-card">
              <h2>Segmentos de usuarios</h2>
              <div id="segmentBreakdown">
                {!segmentRows.length ? (
                  <p className="admin-muted" style={{ fontSize: "0.9rem" }}>
                    Sin datos.
                  </p>
                ) : (
                  segmentRows.map((row) => (
                    <div key={row.key} className="segment-row">
                      <span className="segment-label">{row.label}</span>
                      <div className="segment-bar-wrap">
                        <div className="segment-bar" style={{ width: `${row.pct}%` }} />
                      </div>
                      <span className="segment-count">
                        {row.count} · {row.pct}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="admin-full" id="leads">
            <article className="admin-card">
              <h2>Leads captados</h2>
              <div className="admin-controls">
                <input
                  className="admin-control"
                  type="search"
                  placeholder="Buscar por nombre, email, empresa…"
                  style={{ flex: 1, minWidth: 160 }}
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
                <select className="admin-control" value={leadStageFilter} onChange={(e) => setLeadStageFilter(e.target.value)}>
                  <option value="all">Todos los stages</option>
                  <option value="new">Nuevo</option>
                  <option value="contacted">Contactado</option>
                  <option value="qualified">Calificado</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Empresa</th>
                      <th>Proyecto</th>
                      <th>Budget</th>
                      <th>Stage</th>
                      <th>Fecha</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredLeads.length ? (
                      <tr>
                        <td colSpan={7} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>
                          Sin leads que coincidan.
                        </td>
                      </tr>
                    ) : (
                      [...filteredLeads]
                        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                        .map((lead, leadIdx) => {
                          const stage = lead.stage || "new";
                          const rid = leadRecordId(lead);
                          return (
                            <tr key={rid || `lead-${leadIdx}-${lead.email || ""}`}>
                              <td>
                                <strong>{lead.name || "—"}</strong>
                                <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>
                                  {lead.email}
                                </span>
                              </td>
                              <td>{lead.company || "—"}</td>
                              <td>
                                <span className="admin-pill">{lead.project_type || "—"}</span>
                              </td>
                              <td className="admin-muted" style={{ fontSize: "0.88rem" }}>
                                {lead.budget || "—"}
                              </td>
                              <td>
                                <span className={`admin-pill ${stageClass(stage)}`}>{stage}</span>
                              </td>
                              <td className="admin-muted" style={{ fontSize: "0.82rem" }}>
                                {lead.created_at ? formatDate(lead.created_at) : "—"}
                              </td>
                              <td>
                                <button type="button" className="admin-btn" onClick={() => setModal({ type: "lead", lead })}>
                                  Ver
                                </button>
                                {stage === "new" && rid ? (
                                  <button
                                    type="button"
                                    className="admin-btn"
                                    style={{ marginTop: 4, display: "block" }}
                                    onClick={() => updateLeadStage(rid, "contacted")}
                                  >
                                    Contactado
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="admin-kpis" id="analytics">
            <article className="admin-card">
              <h2>Distribución de presupuestos</h2>
              <div id="budgetBreakdown">
                {!budgetRows.length ? (
                  <p className="admin-muted" style={{ fontSize: "0.9rem" }}>
                    Sin leads aún.
                  </p>
                ) : (
                  budgetRows.map((row) => (
                    <div key={row.key} className="segment-row">
                      <span className="segment-label">{row.key}</span>
                      <div className="segment-bar-wrap">
                        <div
                          className="segment-bar"
                          style={{ width: `${row.pct}%`, background: "var(--admin-warning)" }}
                        />
                      </div>
                      <span className="segment-count">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="admin-card">
              <h2>Actividad de esta sesión</h2>
              <div className="admin-list" id="activityLog">
                {!activityLog.length ? (
                  <p className="admin-muted" style={{ fontSize: "0.9rem" }}>
                    Sin actividad registrada en esta sesión.
                  </p>
                ) : (
                  activityLog.map((entry, i) => (
                    <div key={`${entry.time}-${i}`} className="admin-list-item">
                      <strong>
                        {entry.time} · {entry.message}
                      </strong>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="admin-full" id="content">
            <article className="admin-card">
              <h2>Gestión de contenidos</h2>
              <div className="admin-controls">
                <button type="button" className="admin-btn">
                  Nuevo artículo
                </button>
                <button type="button" className="admin-btn">
                  Nueva colección
                </button>
                <button type="button" className="admin-btn">
                  Publicar newsletter
                </button>
                <button type="button" className="admin-btn">
                  Programar contenido
                </button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Autor</th>
                      <th>Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Introducción al sistema OCHO</td>
                      <td>Artículo</td>
                      <td>
                        <span className="admin-pill success">Publicado</span>
                      </td>
                      <td>Admin</td>
                      <td>Hoy · 09:10</td>
                    </tr>
                    <tr>
                      <td>Biblioteca visual · selección mayo</td>
                      <td>Colección</td>
                      <td>
                        <span className="admin-pill warning">Borrador</span>
                      </td>
                      <td>Editor</td>
                      <td>Ayer · 17:54</td>
                    </tr>
                    <tr>
                      <td>Recursos descargables para branding</td>
                      <td>Toolkit</td>
                      <td>
                        <span className="admin-pill success">Publicado</span>
                      </td>
                      <td>Admin</td>
                      <td>02 Abr · 12:31</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="admin-full" id="security">
            <article className="admin-card">
              <h2>Seguridad y control de acceso</h2>
              <div className="admin-list">
                <div className="admin-list-item">
                  <strong>Política de contraseñas</strong>
                  <p>Longitud mínima 6 caracteres · Hash bcrypt · Reset administrado.</p>
                  <span className="admin-pill success">Operativa</span>
                </div>
                <div className="admin-list-item">
                  <strong>JWT activo</strong>
                  <p>Token firmado · Expiración 7 días · HttpOnly cookie.</p>
                  <span className="admin-pill success">Activo</span>
                </div>
                <div className="admin-list-item">
                  <strong>CORS configurado</strong>
                  <p>Orígenes permitidos: ocho.com.ar, api.ocho.com.ar, localhost.</p>
                  <span className="admin-pill success">Configurado</span>
                </div>
              </div>
            </article>
          </section>

          <section className="admin-full" id="settings">
            <article className="admin-card">
              <h2>Configuración del sistema</h2>
              <div className="admin-system-grid">
                <div className="admin-card" style={{ padding: 16 }}>
                  <h2>Usuarios</h2>
                  <div className="admin-config-list">
                    <div className="admin-config-row">
                      <span>Registro abierto</span>
                      <span className="admin-switch on" />
                    </div>
                    <div className="admin-config-row">
                      <span>Validación manual</span>
                      <span className="admin-switch" />
                    </div>
                    <div className="admin-config-row">
                      <span>2FA administradores</span>
                      <span className="admin-switch" />
                    </div>
                  </div>
                </div>
                <div className="admin-card" style={{ padding: 16 }}>
                  <h2>Contenido</h2>
                  <div className="admin-config-list">
                    <div className="admin-config-row">
                      <span>Borrador por defecto</span>
                      <span className="admin-switch on" />
                    </div>
                    <div className="admin-config-row">
                      <span>Moderación de uploads</span>
                      <span className="admin-switch" />
                    </div>
                    <div className="admin-config-row">
                      <span>Archivado automático</span>
                      <span className="admin-switch" />
                    </div>
                  </div>
                </div>
                <div className="admin-card" style={{ padding: 16 }}>
                  <h2>Infraestructura</h2>
                  <div className="admin-config-list">
                    <div className="admin-config-row">
                      <span>API principal</span>
                      <span className="admin-muted" style={{ fontSize: "0.85rem" }}>
                        api.ocho.com.ar
                      </span>
                    </div>
                    <div className="admin-config-row">
                      <span>Base de datos</span>
                      <span className="admin-muted" style={{ fontSize: "0.85rem" }}>
                        NocoDB
                      </span>
                    </div>
                    <div className="admin-config-row">
                      <span>Automatización</span>
                      <span className="admin-muted" style={{ fontSize: "0.85rem" }}>
                        n8n + webhooks
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>

      {modal?.type === "user" && (
        <UserModal
          user={modal.user}
          onClose={() => setModal(null)}
          changeRole={changeRole}
          changeStatus={changeStatus}
          deleteUser={deleteUser}
        />
      )}

      {modal?.type === "lead" && <LeadModal lead={modal.lead} onClose={() => setModal(null)} />}

      <div className="admin-toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="admin-toast"
            style={{
              color: t.type === "success" ? "var(--admin-success)" : t.type === "danger" ? "var(--admin-danger)" : "#fff",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalRow({ label, value }) {
  return (
    <div className="modal-row">
      <span className="modal-label">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function UserModal({ user, onClose, changeRole, changeStatus, deleteUser }) {
  const name = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
  const role = normalizeRole(user.role);
  const status = user.status || "active";

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="admin-card admin-modal-card modal-inner">
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="modal-header">
          <div className="user-avatar large">{getInitials(name)}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 4px" }}>{name}</h2>
            <span className="admin-muted">{user.email}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {role !== "admin" ? (
              <button type="button" className="admin-btn" onClick={() => changeRole(user.uuid, "admin")}>
                ↑ Admin
              </button>
            ) : (
              <button type="button" className="admin-btn" onClick={() => changeRole(user.uuid, "member")}>
                ↓ Member
              </button>
            )}
            {status === "banned" ? (
              <button type="button" className="admin-btn" style={{ color: "var(--aok)" }} onClick={() => changeStatus(user.uuid, "active")}>
                ✓ Activar
              </button>
            ) : (
              <button type="button" className="admin-btn danger" onClick={() => changeStatus(user.uuid, "banned")}>
                ⊘ Banear
              </button>
            )}
            <button type="button" className="admin-btn danger" onClick={() => deleteUser(user.uuid, name)}>
              🗑 Eliminar
            </button>
          </div>
        </div>
        <div className="modal-grid">
          <ModalRow label="Rol" value={user.role || "member"} />
          <ModalRow label="Estado" value={status} />
          <ModalRow label="Segmento" value={user.segment || "—"} />
          <ModalRow label="Ciudad" value={user.city || "—"} />
          <ModalRow label="País" value={user.country || "—"} />
          <ModalRow label="Empresa" value={user.company || "—"} />
          <ModalRow label="Rol (profesional)" value={user.role_title || "—"} />
          <ModalRow label="Teléfono" value={user.phone || "—"} />
          <ModalRow label="Interés" value={user.interest || "—"} />
          <ModalRow label="Fuente" value={user.source || "—"} />
          <ModalRow label="Último login" value={user.last_login_at ? formatDate(user.last_login_at) : "Nunca"} />
          <ModalRow label="Newsletter consent" value={user.newsletter_consent ? "✓ Sí" : "No"} />
          <ModalRow label="Data consent" value={user.data_consent ? "✓ Sí" : "No"} />
        </div>
        {user.profile ? (
          <div className="modal-row full" style={{ marginTop: 12 }}>
            <span className="modal-label">Perfil</span>
            <p className="admin-muted">{user.profile}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LeadModal({ lead, onClose }) {
  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="admin-card admin-modal-card modal-inner">
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="modal-header">
          <h2 style={{ margin: "0 0 4px" }}>{lead.name || "Lead"}</h2>
          <span className="admin-muted">{lead.email}</span>
        </div>
        <div className="modal-grid">
          <ModalRow label="Empresa" value={lead.company || "—"} />
          <ModalRow label="Proyecto" value={lead.project_type || "—"} />
          <ModalRow label="Presupuesto" value={lead.budget || "—"} />
          <ModalRow label="Stage" value={lead.stage || "new"} />
          <ModalRow label="Segmento" value={lead.segment || "—"} />
          <ModalRow label="Fuente" value={lead.source || "—"} />
          <ModalRow label="Fecha" value={lead.created_at ? formatDate(lead.created_at) : "—"} />
        </div>
        {lead.message ? (
          <div style={{ marginTop: 16 }}>
            <span className="modal-label">Mensaje</span>
            <div className="admin-card" style={{ padding: 14, marginTop: 8, fontSize: "0.94rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {lead.message}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
