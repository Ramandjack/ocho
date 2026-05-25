import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { ToastContainer, formatDate } from "./adminUtils.jsx";

const SECURITY_EVENTS = new Set([
  "reset_password", "update_status", "delete", "login_failed", "login", "logout",
]);

function MetricCard({ label, value, sub, warn }) {
  return (
    <div className={`admin-stat-card${warn ? " warn" : ""}`}>
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

export default function AdminSecurity() {
  const { users, activity } = useAdminData();
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd]           = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const { toasts, show }              = useToast();

  useEffect(() => {
    if (resetTarget) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [resetTarget]);

  const banned       = users.filter(u => u.status === "banned");
  const pending      = users.filter(u => u.status === "pending");
  const neverLogged  = users.filter(u => !u.last_login_at && u.status !== "banned");
  const securityLogs = activity
    .filter(e => SECURITY_EVENTS.has(e.action))
    .slice(0, 40);

  async function handleReset(e) {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPwd.length < 8) { show("Mínimo 8 caracteres", "error"); return; }
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/admin/users/${resetTarget.uuid}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPwd }),
      });
      if (r.success) {
        show(`Contraseña actualizada para ${resetTarget.email}`, "success");
        setResetTarget(null);
        setNewPwd("");
      } else {
        show(r.message || "Error al resetear contraseña", "error");
      }
    } catch {
      show("Error de conexión", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function badgeStatus(status) {
    const map = { banned: "red", pending: "yellow", active: "green" };
    return <span className={`admin-badge ${map[status] || "gray"}`}>{status}</span>;
  }

  function eventLabel(action) {
    const map = {
      reset_password: "🔑 Reset contraseña",
      update_status:  "🔄 Cambio estado",
      delete:         "🗑 Eliminado",
      login:          "✅ Login",
      login_failed:   "⚠️ Login fallido",
      logout:         "👋 Logout",
    };
    return map[action] || action;
  }

  return (
    <div className="admin-section">
      <ToastContainer toasts={toasts} />

      <div className="admin-section-header">
        <h2>Seguridad y control de acceso</h2>
      </div>

      <div className="admin-stats-grid">
        <MetricCard label="Usuarios baneados"    value={banned.length}      warn={banned.length > 0} />
        <MetricCard label="Pendientes de activar" value={pending.length}     warn={pending.length > 0} />
        <MetricCard label="Nunca iniciaron sesión" value={neverLogged.length} warn={neverLogged.length > 2} />
        <MetricCard label="Total usuarios"         value={users.length} />
      </div>

      <div className="admin-card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="admin-card-title">Política de seguridad</h3>
        <div className="admin-policy-grid">
          <div className="admin-policy-item">
            <span className="admin-policy-key">Algoritmo</span>
            <span className="admin-policy-val">bcrypt · 10 rounds</span>
          </div>
          <div className="admin-policy-item">
            <span className="admin-policy-key">Longitud mínima</span>
            <span className="admin-policy-val">8 caracteres</span>
          </div>
          <div className="admin-policy-item">
            <span className="admin-policy-key">Sesión JWT</span>
            <span className="admin-policy-val">7 días · HttpOnly cookie</span>
          </div>
          <div className="admin-policy-item">
            <span className="admin-policy-key">CORS</span>
            <span className="admin-policy-val">Origen restringido por env</span>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="admin-card-title">Resetear contraseña de usuario</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Último login</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uuid}>
                  <td>{u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—"}</td>
                  <td>{u.email}</td>
                  <td>{badgeStatus(u.status)}</td>
                  <td>{u.last_login_at ? formatDate(u.last_login_at) : <span style={{ color: "var(--text-muted)" }}>Nunca</span>}</td>
                  <td>
                    <button
                      className="admin-btn-sm"
                      onClick={() => { setResetTarget(u); setNewPwd(""); }}
                    >
                      Cambiar contraseña
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(banned.length > 0 || neverLogged.length > 0) && (
        <div className="admin-card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="admin-card-title">Accesos sospechosos / alertas</h3>
          {banned.length > 0 && (
            <>
              <p className="admin-alert-label">Usuarios baneados</p>
              <ul className="admin-alert-list">
                {banned.map(u => (
                  <li key={u.uuid} className="admin-alert-item red">
                    {u.email} — baneado
                  </li>
                ))}
              </ul>
            </>
          )}
          {neverLogged.length > 0 && (
            <>
              <p className="admin-alert-label" style={{ marginTop: "0.75rem" }}>
                Cuentas activas que nunca iniciaron sesión
              </p>
              <ul className="admin-alert-list">
                {neverLogged.map(u => (
                  <li key={u.uuid} className="admin-alert-item yellow">
                    {u.email} · {u.role}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="admin-card">
        <h3 className="admin-card-title">Log de eventos de seguridad</h3>
        {securityLogs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Sin eventos registrados.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {securityLogs.map((e, i) => (
                  <tr key={e.id || i}>
                    <td>{eventLabel(e.action)}</td>
                    <td>{e.entity} {e.entity_id ? `· ${String(e.entity_id).slice(0, 8)}…` : ""}</td>
                    <td>{e.detail || "—"}</td>
                    <td>{(e.CreatedAt || e.created_at) ? formatDate(e.CreatedAt || e.created_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetTarget && (
        <div className="admin-modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Cambiar contraseña</h3>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              Usuario: <strong>{resetTarget.email}</strong>
            </p>
            <form onSubmit={handleReset}>
              <label className="admin-label">Nueva contraseña</label>
              <input
                type="password"
                className="admin-input"
                placeholder="Mínimo 8 caracteres"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                minLength={8}
                required
                autoFocus
              />
              <div className="admin-modal-actions">
                <button type="submit" className="admin-btn primary" disabled={submitting}>
                  {submitting ? "Guardando…" : "Actualizar contraseña"}
                </button>
                <button type="button" className="admin-btn" onClick={() => setResetTarget(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
