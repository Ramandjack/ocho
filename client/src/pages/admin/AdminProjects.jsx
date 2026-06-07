import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { ToastContainer, ConfirmModal } from "./adminUtils.jsx";

const STATUS_OPTIONS  = ["draft", "active", "completed", "archived"];
const TYPE_OPTIONS    = ["web", "saas", "ecommerce", "marketplace", "ia"];
const PERM_OPTIONS    = ["viewer", "editor"];
const STATUS_LABEL    = { draft: "borrador", active: "activo", completed: "completado", archived: "archivado" };
const TYPE_LABEL      = { web: "Web", saas: "SaaS", ecommerce: "Ecommerce", marketplace: "Marketplace", ia: "IA" };

const EMPTY_FORM = { title: "", description: "", status: "active", type: "web", due_date: "" };

function ThreadModal({ project, onClose, show }) {
  const [msgs, setMsgs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply]     = useState("");
  const [sending, setSending] = useState(false);
  const endRef                = useRef(null);

  useEffect(() => {
    apiFetch(`/api/admin/projects/${project.id}/messages`)
      .then(r => setMsgs(r.messages ?? []))
      .catch(err => show(err.message, "danger"))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const r = await apiFetch(`/api/admin/projects/${project.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: reply.trim() }),
      });
      setMsgs(prev => [...prev, r.message]);
      setReply("");
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="admin-card admin-modal-card modal-inner"
        style={{ maxWidth: 580, width: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 0 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Mensajes</h2>
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>{project.title}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Thread */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 200,
          maxHeight: "50vh",
          paddingRight: 4,
          marginBottom: 16,
        }}>
          {loading ? (
            <p className="admin-muted" style={{ fontSize: "0.85rem" }}>Cargando mensajes…</p>
          ) : !msgs.length ? (
            <p className="admin-muted" style={{ fontSize: "0.85rem" }}>Sin mensajes todavía.</p>
          ) : msgs.map((m, i) => {
            const isAdmin = ["admin", "member"].includes(String(m.author_role).toLowerCase());
            return (
              <div
                key={m.nocodb_id ?? m.id ?? i}
                style={{
                  padding: "0.55rem 0.75rem",
                  borderRadius: 8,
                  background: isAdmin
                    ? "rgba(232,213,176,0.09)"
                    : "rgba(255,255,255,0.04)",
                  alignSelf: isAdmin ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  border: isAdmin
                    ? "1px solid rgba(232,213,176,0.15)"
                    : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.9 }}>{m.author_name}</span>
                  <span className="admin-pill" style={{ fontSize: "0.68rem" }}>{m.author_role}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</p>
                {m.CreatedAt && (
                  <span style={{ fontSize: "0.7rem", opacity: 0.4, display: "block", marginTop: 4 }}>
                    {new Date(m.CreatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Reply form */}
        <form
          onSubmit={send}
          style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <input
            className="admin-control"
            style={{ flex: 1 }}
            placeholder="Escribir respuesta…"
            value={reply}
            onChange={e => setReply(e.target.value)}
            autoFocus
            disabled={sending}
          />
          <button
            type="submit"
            className="admin-btn primary"
            disabled={sending || !reply.trim()}
          >
            {sending ? "…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminProjects() {
  const { projects, setProjects, users } = useAdminData();
  const [form, setForm]               = useState(null);
  const [assignModal, setAssign]      = useState(null);
  const [threadModal, setThread]      = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [assignUuid, setAssignUuid]   = useState("");
  const [assignPerm, setAssignPerm]   = useState("viewer");
  const [saving, setSaving]           = useState(false);
  const { toasts, show } = useToast();

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
                          <button type="button" className="admin-btn" onClick={() => setThread({ id, title: p.title })}>
                            Mensajes
                          </button>
                          <button type="button" className="admin-btn" onClick={() => { setAssign({ id, title: p.title }); setAssignUuid(""); setAssignPerm("viewer"); }}>
                            Asignar
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => setConfirmState({
                            title: `¿Eliminar "${p.title}"?`,
                            message: "Esta acción no se puede deshacer.",
                            danger: true,
                            confirmLabel: "Eliminar",
                            onConfirm: () => deleteProject(id, p.title),
                          })}>
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

      {threadModal && (
        <ThreadModal
          project={threadModal}
          onClose={() => setThread(null)}
          show={show}
        />
      )}

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
