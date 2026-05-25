import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { ToastContainer } from "./adminUtils.jsx";

const STATUS_OPTIONS  = ["draft", "active", "completed", "archived"];
const TYPE_OPTIONS    = ["web", "saas", "ecommerce", "marketplace", "ia"];
const PERM_OPTIONS    = ["viewer", "editor"];
const STATUS_LABEL    = { draft: "borrador", active: "activo", completed: "completado", archived: "archivado" };
const TYPE_LABEL      = { web: "Web", saas: "SaaS", ecommerce: "Ecommerce", marketplace: "Marketplace", ia: "IA" };

const EMPTY_FORM = { title: "", description: "", status: "active", type: "web", due_date: "" };

export default function AdminProjects() {
  const [projects, setProjects]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState(null);       // null = hidden, {} = new, {...} = edit
  const [assignModal, setAssign]  = useState(null);       // project to assign
  const [assignUuid, setAssignUuid]   = useState("");
  const [assignPerm, setAssignPerm]   = useState("viewer");
  const [saving, setSaving]       = useState(false);
  const { toasts, show } = useToast();

  const load = useCallback(async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        apiFetch("/api/admin/projects"),
        apiFetch("/api/admin/users"),
      ]);
      setProjects(pRes.projects ?? []);
      setUsers(uRes.users ?? []);
    } catch (err) { show(err.message, "danger"); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function saveProject(e) {
    e.preventDefault();
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      if (form.id) {
        const res = await apiFetch(`/api/admin/projects/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: form.title, description: form.description, status: form.status, type: form.type, due_date: form.due_date || null }),
        });
        setProjects(prev => prev.map(p => (p.nocodb_id ?? p.id) === form.id ? { ...p, ...res.project } : p));
        show("Proyecto actualizado", "success");
      } else {
        const res = await apiFetch("/api/admin/projects", {
          method: "POST",
          body: JSON.stringify({ title: form.title, description: form.description, status: form.status, type: form.type, due_date: form.due_date || null }),
        });
        setProjects(prev => [res.project, ...prev]);
        show("Proyecto creado", "success");
      }
      setForm(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  async function deleteProject(id, title) {
    if (!window.confirm(`¿Eliminar "${title}"?`)) return;
    try {
      await apiFetch(`/api/admin/projects/${id}`, { method: "DELETE" });
      setProjects(prev => prev.filter(p => (p.nocodb_id ?? p.id) !== id));
      show("Proyecto eliminado", "success");
    } catch (err) { show(err.message, "danger"); }
  }

  async function assignUser(e) {
    e.preventDefault();
    if (!assignUuid) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/projects/${assignModal.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ user_uuids: [assignUuid], permission: assignPerm }),
      });
      show("Usuario asignado", "success");
      setAssign(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="view-loading">Cargando proyectos…</div>;

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Proyectos</h1>
          <p>{projects.length} proyectos en el sistema</p>
        </div>
        {!form && (
          <button type="button" className="admin-btn primary" onClick={() => setForm({ ...EMPTY_FORM })}>
            + Nuevo proyecto
          </button>
        )}
      </section>

      {form && (
        <section className="admin-full">
          <article className="admin-card">
            <h2>{form.id ? "Editar proyecto" : "Nuevo proyecto"}</h2>
            <form onSubmit={saveProject} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="admin-controls">
                <input className="admin-control" style={{ flex: 1 }} placeholder="Título *" value={form.title} onChange={e => setF("title", e.target.value)} required />
                <select className="admin-control" value={form.type} onChange={e => setF("type", e.target.value)}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <select className="admin-control" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <input className="admin-control" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value)} />
              </div>
              <input className="admin-control" placeholder="Descripción (opcional)" value={form.description || ""} onChange={e => setF("description", e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear proyecto"}</button>
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
                <tr><th>Proyecto</th><th>Tipo</th><th>Estado</th><th>Vence</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {!projects.length ? (
                  <tr><td colSpan={5} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin proyectos.</td></tr>
                ) : projects.map(p => {
                  const id = p.nocodb_id ?? p.id;
                  return (
                    <tr key={id}>
                      <td>
                        <strong>{p.title}</strong>
                        {p.description && <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{p.description}</span>}
                      </td>
                      <td><span className="admin-pill">{TYPE_LABEL[p.type] ?? p.type}</span></td>
                      <td>
                        <span className={`admin-pill ${p.status === "active" ? "success" : p.status === "archived" ? "danger" : ""}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="admin-muted" style={{ fontSize: "0.85rem" }}>{p.due_date || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="admin-btn" onClick={() => setForm({ id, title: p.title, description: p.description || "", status: p.status, type: p.type, due_date: p.due_date || "" })}>
                            Editar
                          </button>
                          <button type="button" className="admin-btn" onClick={() => { setAssign({ id, title: p.title }); setAssignUuid(""); setAssignPerm("viewer"); }}>
                            Asignar
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => deleteProject(id, p.title)}>
                            Eliminar
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
            <h2 style={{ marginBottom: 16 }}>Asignar usuario a "{assignModal.title}"</h2>
            <form onSubmit={assignUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <select className="admin-control" value={assignUuid} onChange={e => setAssignUuid(e.target.value)} required>
                <option value="">Seleccionar usuario…</option>
                {users.map(u => (
                  <option key={u.uuid} value={u.uuid}>
                    {u.full_name || u.email} ({u.email})
                  </option>
                ))}
              </select>
              <select className="admin-control" value={assignPerm} onChange={e => setAssignPerm(e.target.value)}>
                {PERM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving || !assignUuid}>
                  {saving ? "Asignando…" : "Asignar"}
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
