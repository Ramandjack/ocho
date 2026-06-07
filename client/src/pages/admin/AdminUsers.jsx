import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { normalizeRole, getInitials, formatDate, exportCSV, ToastContainer, ModalRow, ConfirmModal } from "./adminUtils.jsx";

export default function AdminUsers() {
  const { users, setUsers } = useAdminData();
  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal]               = useState(null);
  const [view, setView]                 = useState("all"); // "all" | "pending"
  const [confirmState, setConfirmState] = useState(null);
  const { toasts, show } = useToast();

  const pending = useMemo(() => users.filter(u => (u.status || "active") === "pending"), [users]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return users.filter(u => {
      const text = `${u.full_name || ""} ${u.email || ""} ${u.company || ""}`.toLowerCase();
      return (!s || text.includes(s))
        && (roleFilter === "all"   || normalizeRole(u.role) === roleFilter)
        && (statusFilter === "all" || (u.status || "active") === statusFilter);
    });
  }, [users, search, roleFilter, statusFilter]);

  async function changeRole(uuid, newRole) {
    if (!window.confirm(`¿Cambiar rol a "${newRole}"?`)) return;
    try {
      await apiFetch(`/api/admin/users/${uuid}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      setUsers(prev => prev.map(u => u.uuid === uuid ? { ...u, role: newRole } : u));
      show(`Rol actualizado a ${newRole}`, "success");
      setModal(null);
    } catch (err) { show(err.message, "danger"); }
  }

  async function changeStatus(uuid, newStatus) {
    const labels = { banned: "banear", active: "activar", pending: "poner en pendiente", rejected: "rechazar" };
    if (!window.confirm(`¿${labels[newStatus] || newStatus} este usuario?`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}/status`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      setUsers(prev => prev.map(u => u.uuid === uuid ? { ...u, status: newStatus } : u));
      show(res.message || `Usuario ${newStatus}`, "success");
      setModal(null);
    } catch (err) { show(err.message, "danger"); }
  }

  async function approveUser(uuid) {
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}/approve`, { method: "PATCH" });
      setUsers(prev => prev.map(u => u.uuid === uuid
        ? { ...u, status: "active", approved_at: new Date().toISOString() }
        : u
      ));
      show(res.message || "Usuario aprobado", "success");
      setModal(null);
    } catch (err) { show(err.message, "danger"); }
  }

  async function rejectUser(uuid) {
    if (!window.confirm("¿Rechazar esta solicitud de acceso?")) return;
    try {
      const res = await apiFetch(`/api/admin/users/${uuid}/reject`, { method: "PATCH" });
      setUsers(prev => prev.map(u => u.uuid === uuid ? { ...u, status: "rejected" } : u));
      show(res.message || "Solicitud rechazada", "success");
      setModal(null);
    } catch (err) { show(err.message, "danger"); }
  }

  async function deleteUser(uuid, name) {
    try {
      await apiFetch(`/api/admin/users/${uuid}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.uuid !== uuid));
      show("Usuario eliminado", "success");
      setModal(null);
    } catch (err) { show(err.message, "danger"); }
  }

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Gestión de usuarios</h1>
          <p>{users.length} usuarios registrados</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {pending.length > 0 && (
            <button
              type="button"
              className={`admin-btn${view === "pending" ? " primary" : " warning"}`}
              onClick={() => setView(v => v === "pending" ? "all" : "pending")}
            >
              {pending.length} solicitud{pending.length !== 1 ? "es" : ""} pendiente{pending.length !== 1 ? "s" : ""}
            </button>
          )}
          <button type="button" className="admin-btn" onClick={() => exportCSV(filtered, "ocho_usuarios.csv", show)}>
            ↓ Exportar CSV
          </button>
        </div>
      </section>

      {/* Solicitudes pendientes */}
      {view === "pending" && (
        <section className="admin-full" style={{ marginBottom: 0 }}>
          <article className="admin-card" style={{ borderColor: "var(--admin-warning, #f59e0b)" }}>
            <h3 style={{ marginBottom: 12 }}>Solicitudes de acceso pendientes</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Usuario</th><th>Empresa</th><th>Interés</th><th>Perfil</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr><td colSpan={5} className="admin-muted" style={{ textAlign: "center", padding: 24 }}>Sin solicitudes pendientes.</td></tr>
                  ) : pending.map(u => {
                    const name = u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
                    return (
                      <tr key={u.uuid}>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar">{getInitials(name)}</div>
                            <div>
                              <strong>{name}</strong>
                              <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="admin-muted">{u.company || "—"}</td>
                        <td className="admin-muted" style={{ fontSize: "0.82rem" }}>{u.interest || "—"}</td>
                        <td className="admin-muted" style={{ fontSize: "0.82rem", maxWidth: 200 }}>
                          {u.profile ? u.profile.slice(0, 80) + (u.profile.length > 80 ? "…" : "") : "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" className="admin-btn green" onClick={() => approveUser(u.uuid)}>
                              ✓ Aprobar
                            </button>
                            <button type="button" className="admin-btn danger" onClick={() => rejectUser(u.uuid)}>
                              ✕ Rechazar
                            </button>
                            <button type="button" className="admin-btn" onClick={() => setModal({ user: u })}>Ver</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      <section className="admin-full">
        <article className="admin-card">
          <div className="admin-controls">
            <input
              className="admin-control"
              type="search"
              placeholder="Buscar por nombre, email, empresa…"
              aria-label="Buscar usuarios"
              style={{ flex: 1, minWidth: 160 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="admin-control" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">Todos los roles</option>
              <option value="admin">Admin</option>
              <option value="client">Client</option>
              <option value="member">Member</option>
            </select>
            <select className="admin-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="pending">Pendiente</option>
              <option value="rejected">Rechazado</option>
              <option value="banned">Suspendido</option>
            </select>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario</th><th>Rol</th><th>Estado</th>
                  <th>Último acceso</th><th>Segmento</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr><td colSpan={6} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin resultados.</td></tr>
                ) : filtered.map(u => {
                  const role   = normalizeRole(u.role);
                  const status = u.status || "active";
                  const name   = u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
                  const statusColor = { active: "success", pending: "warning", rejected: "danger", banned: "danger" }[status] || "";
                  return (
                    <tr key={u.uuid}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">{getInitials(name)}</div>
                          <div>
                            <strong>{name}</strong>
                            <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className={`admin-pill ${role === "admin" ? "warning" : ""}`}>{role}</span></td>
                      <td><span className={`admin-pill ${statusColor}`}>{status}</span></td>
                      <td className="admin-muted" style={{ fontSize: "0.88rem" }}>{u.last_login_at ? formatDate(u.last_login_at) : "Nunca"}</td>
                      <td className="admin-muted" style={{ fontSize: "0.82rem" }}>{u.segment || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {status === "pending" && (
                            <>
                              <button type="button" className="admin-btn green" onClick={() => approveUser(u.uuid)}>✓ Aprobar</button>
                              <button type="button" className="admin-btn danger" onClick={() => rejectUser(u.uuid)}>✕ Rechazar</button>
                            </>
                          )}
                          {status === "active" && role !== "admin" && (
                            <button type="button" className="admin-btn danger" onClick={() => changeStatus(u.uuid, "banned")}>⊘ Banear</button>
                          )}
                          {status === "banned" && (
                            <button type="button" className="admin-btn" onClick={() => changeStatus(u.uuid, "active")}>✓ Activar</button>
                          )}
                          {status === "rejected" && (
                            <button type="button" className="admin-btn" onClick={() => approveUser(u.uuid)}>✓ Aprobar</button>
                          )}
                          <button type="button" className="admin-btn" onClick={() => changeRole(u.uuid, role === "admin" ? "member" : "admin")}>
                            {role === "admin" ? "↓ Member" : "↑ Admin"}
                          </button>
                          <button type="button" className="admin-btn" onClick={() => setModal({ user: u })}>Ver</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {modal && (
        <UserModal
          user={modal.user}
          onClose={() => setModal(null)}
          changeRole={changeRole}
          changeStatus={changeStatus}
          approveUser={approveUser}
          rejectUser={rejectUser}
          onDeleteConfirm={(uuid, name) => setConfirmState({
            title: `¿Eliminar a "${name}"?`,
            message: "Esta acción es permanente e irreversible. El usuario perderá todo acceso.",
            danger: true,
            confirmLabel: "Eliminar usuario",
            onConfirm: () => deleteUser(uuid, name),
          })}
        />
      )}

      <ToastContainer toasts={toasts} />

      {confirmState && (
        <ConfirmModal
          {...confirmState}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
        />
      )}
    </>
  );
}

function UserModal({ user, onClose, changeRole, changeStatus, approveUser, rejectUser, onDeleteConfirm }) {
  const name   = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
  const role   = normalizeRole(user.role);
  const status = user.status || "active";

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="admin-card admin-modal-card modal-inner">
        <button type="button" className="admin-modal-close" onClick={onClose}>✕</button>
        <div className="modal-header">
          <div className="user-avatar large">{getInitials(name)}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 4px" }}>{name}</h2>
            <span className="admin-muted">{user.email}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {status === "pending" && (
              <>
                <button type="button" className="admin-btn green" onClick={() => approveUser(user.uuid)}>✓ Aprobar</button>
                <button type="button" className="admin-btn danger" onClick={() => rejectUser(user.uuid)}>✕ Rechazar</button>
              </>
            )}
            {status === "active" && (
              <button type="button" className="admin-btn danger" onClick={() => changeStatus(user.uuid, "banned")}>⊘ Banear</button>
            )}
            {status === "banned" && (
              <button type="button" className="admin-btn" onClick={() => changeStatus(user.uuid, "active")}>✓ Activar</button>
            )}
            {status === "rejected" && (
              <button type="button" className="admin-btn" onClick={() => approveUser(user.uuid)}>✓ Aprobar igual</button>
            )}
            <button type="button" className="admin-btn" onClick={() => changeRole(user.uuid, role === "admin" ? "member" : "admin")}>
              {role === "admin" ? "↓ Member" : "↑ Admin"}
            </button>
            <button type="button" className="admin-btn danger" onClick={() => onDeleteConfirm(user.uuid, name)}>Eliminar</button>
          </div>
        </div>
        <div className="modal-grid">
          <ModalRow label="Rol"              value={user.role || "member"} />
          <ModalRow label="Estado"           value={status} />
          <ModalRow label="Segmento"         value={user.segment} />
          <ModalRow label="Ciudad"           value={user.city} />
          <ModalRow label="País"             value={user.country} />
          <ModalRow label="Empresa"          value={user.company} />
          <ModalRow label="Cargo"            value={user.role_title} />
          <ModalRow label="Teléfono"         value={user.phone} />
          <ModalRow label="Interés"          value={user.interest} />
          <ModalRow label="Fuente"           value={user.source} />
          <ModalRow label="Último login"     value={user.last_login_at ? formatDate(user.last_login_at) : "Nunca"} />
          <ModalRow label="Aprobado"         value={user.approved_at ? formatDate(user.approved_at) : "—"} />
          <ModalRow label="Newsletter"       value={user.newsletter_consent ? "✓ Sí" : "No"} />
        </div>
        {user.profile && (
          <div className="modal-row full" style={{ marginTop: 12 }}>
            <span className="modal-label">Perfil</span>
            <p className="admin-muted">{user.profile}</p>
          </div>
        )}
      </div>
    </div>
  );
}
