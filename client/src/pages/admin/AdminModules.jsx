import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { ToastContainer } from "./adminUtils.jsx";

const EMPTY = { key: "", label: "", description: "", icon: "", active: true };

export default function AdminModules() {
  const [modules, setModules]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(null);
  const [assignModal, setAssign] = useState(null);
  const [assignUuid, setAssignUuid] = useState("");
  const [assignEnabled, setAssignEnabled] = useState(true);
  const [saving, setSaving]     = useState(false);
  const { toasts, show } = useToast();

  const load = useCallback(async () => {
    try {
      const [mRes, uRes] = await Promise.all([
        apiFetch("/api/admin/modules"),
        apiFetch("/api/admin/users"),
      ]);
      setModules(mRes.modules ?? []);
      setUsers(uRes.users ?? []);
    } catch (err) { show(err.message, "danger"); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  async function toggle(id, current) {
    try {
      const res = await apiFetch(`/api/admin/modules/${id}/toggle`, { method: "PATCH" });
      setModules(prev => prev.map(m => (m.nocodb_id ?? m.id) === id ? { ...m, active: res.active ?? !current } : m));
      show(`Módulo ${res.active ? "activado" : "desactivado"}`, "success");
    } catch (err) { show(err.message, "danger"); }
  }

  async function saveModule(e) {
    e.preventDefault();
    if (!form.key?.trim() || !form.label?.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/modules", {
        method: "POST",
        body: JSON.stringify({ key: form.key.trim().toLowerCase(), label: form.label.trim(), description: form.description, icon: form.icon, active: form.active }),
      });
      setModules(prev => [...prev, res.module]);
      show("Módulo creado", "success");
      setForm(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  async function assignModule(e) {
    e.preventDefault();
    if (!assignUuid || !assignModal) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/modules/assign", {
        method: "POST",
        body: JSON.stringify({ user_uuid: assignUuid, module_key: assignModal.key, enabled: assignEnabled }),
      });
      show(`Módulo "${assignModal.label}" ${assignEnabled ? "habilitado" : "deshabilitado"} para el usuario`, "success");
      setAssign(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="view-loading">Cargando módulos…</div>;

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Módulos</h1>
          <p>Controlá qué funcionalidades están activas en el sistema.</p>
        </div>
        {!form && (
          <button type="button" className="admin-btn primary" onClick={() => setForm({ ...EMPTY })}>
            + Nuevo módulo
          </button>
        )}
      </section>

      {form && (
        <section className="admin-full">
          <article className="admin-card">
            <h2>Nuevo módulo</h2>
            <form onSubmit={saveModule} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="admin-controls">
                <input className="admin-control" style={{ flex: 1 }} placeholder="Key (ej: crm, billing) *" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} required />
                <input className="admin-control" style={{ flex: 1 }} placeholder="Nombre visible *" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required />
                <input className="admin-control" placeholder="Ícono (emoji o texto)" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
              </div>
              <input className="admin-control" placeholder="Descripción (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Creando…" : "Crear módulo"}</button>
                <button type="button" className="admin-btn" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          </article>
        </section>
      )}

      <section className="admin-full">
        <article className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Módulo</th><th>Key</th><th>Estado global</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {!modules.length ? (
                  <tr><td colSpan={4} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin módulos creados.</td></tr>
                ) : modules.map(m => {
                  const id = m.nocodb_id ?? m.id;
                  return (
                    <tr key={id}>
                      <td>
                        <strong>{m.icon ? `${m.icon} ` : ""}{m.label}</strong>
                        {m.description && <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{m.description}</span>}
                      </td>
                      <td><code style={{ fontSize: "0.82rem", opacity: 0.7 }}>{m.key}</code></td>
                      <td>
                        <span className={`admin-pill ${m.active ? "success" : "danger"}`}>
                          {m.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="admin-btn" onClick={() => toggle(id, m.active)}>
                            {m.active ? "Desactivar" : "Activar"}
                          </button>
                          <button type="button" className="admin-btn" onClick={() => { setAssign(m); setAssignUuid(""); setAssignEnabled(true); }}>
                            Asignar usuario
                          </button>
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

      {assignModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setAssign(null)}>
          <div className="admin-card admin-modal-card modal-inner">
            <button type="button" className="admin-modal-close" onClick={() => setAssign(null)}>✕</button>
            <h2 style={{ marginBottom: 16 }}>Asignar módulo "{assignModal.label}"</h2>
            <form onSubmit={assignModule} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <select className="admin-control" value={assignUuid} onChange={e => setAssignUuid(e.target.value)} required>
                <option value="">Seleccionar usuario…</option>
                {users.map(u => <option key={u.uuid} value={u.uuid}>{u.full_name || u.email}</option>)}
              </select>
              <select className="admin-control" value={String(assignEnabled)} onChange={e => setAssignEnabled(e.target.value === "true")}>
                <option value="true">Habilitar para este usuario</option>
                <option value="false">Deshabilitar para este usuario</option>
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving || !assignUuid}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button type="button" className="admin-btn" onClick={() => setAssign(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </>
  );
}
