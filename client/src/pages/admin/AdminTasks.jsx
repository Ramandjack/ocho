import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { ToastContainer, ConfirmModal } from "./adminUtils.jsx";

const STATUS_OPTIONS   = ["pending", "in_progress", "waiting_client", "done"];
const PRIORITY_OPTIONS = ["low", "medium", "high"];
const STATUS_LABEL     = { pending: "pendiente", in_progress: "en curso", waiting_client: "esperando cliente", done: "completado" };
const PRIORITY_LABEL   = { low: "baja", medium: "media", high: "alta" };

const SESSION_LABEL = {
  active:            "En curso",
  paused:            "Pausado",
  in_review:         "En revisión",
  changes_requested: "Cambios solicitados",
  approved:          "Aprobado",
};

const EMPTY = { title: "", description: "", status: "pending", priority: "medium", project_id: "", assigned_to: "", due_date: "" };

export default function AdminTasks() {
  const { tasks, setTasks, users, projects } = useAdminData();
  const [form, setForm]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [changesModal, setChangesModal] = useState(null);
  const [changesText, setChangesText] = useState("");
  const [sendingChanges, setSendingChanges] = useState(false);
  const { toasts, show } = useToast();

  const userMap    = Object.fromEntries(users.map(u => [u.uuid, u.full_name || u.email]));
  const projectMap = Object.fromEntries(projects.map(p => [String(p.nocodb_id ?? p.id), p.title]));
  const sessionByTask = Object.fromEntries(sessions.map(s => [s.task_id, s]));

  function loadSessions() {
    apiFetch("/api/admin/workspace/sessions")
      .then(res => setSessions(res.sessions ?? []))
      .catch(() => {});
  }

  // Guard contra el doble-invoke de StrictMode en desarrollo (ver AdminDataContext.jsx).
  const didLoadSessions = useRef(false);
  useEffect(() => {
    if (didLoadSessions.current) return;
    didLoadSessions.current = true;
    loadSessions();
  }, []);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function approveSession(taskId) {
    try {
      await apiFetch(`/api/admin/tasks/${taskId}/workspace/session`, {
        method: "PATCH",
        body:   JSON.stringify({ action: "approve" }),
      });
      setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === taskId ? { ...t, status: "done" } : t));
      loadSessions();
      show("Tarea aprobada", "success");
    } catch (err) { show(err.message, "danger"); }
  }

  async function submitChanges(e) {
    e.preventDefault();
    const comment = changesText.trim();
    if (!comment) return;
    setSendingChanges(true);
    try {
      await apiFetch(`/api/admin/tasks/${changesModal.taskId}/workspace/session`, {
        method: "PATCH",
        body:   JSON.stringify({ action: "request_changes", comment }),
      });
      loadSessions();
      show("Cambios solicitados", "success");
      setChangesModal(null);
      setChangesText("");
    } catch (err) { show(err.message, "danger"); }
    finally { setSendingChanges(false); }
  }

  async function saveTask(e) {
    e.preventDefault();
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const body = {
        title:       form.title.trim(),
        description: form.description || "",
        status:      form.status,
        priority:    form.priority,
        project_id:  form.project_id ? Number(form.project_id) : null,
        assigned_to: form.assigned_to || null,
        due_date:    form.due_date || null,
      };
      if (form.id) {
        const res = await apiFetch(`/api/admin/tasks/${form.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === form.id ? { ...t, ...res.task } : t));
        show("Tarea actualizada", "success");
      } else {
        const res = await apiFetch("/api/admin/tasks", { method: "POST", body: JSON.stringify(body) });
        setTasks(prev => [res.task, ...prev]);
        show("Tarea creada", "success");
      }
      setForm(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  async function deleteTask(id, title) {
    try {
      await apiFetch(`/api/admin/tasks/${id}`, { method: "DELETE" });
      setTasks(prev => prev.filter(t => (t.nocodb_id ?? t.id) !== id));
      show("Tarea eliminada", "success");
    } catch (err) { show(err.message, "danger"); }
  }

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Tareas</h1>
          <p>{tasks.length} tareas en el sistema</p>
        </div>
        {!form && (
          <button type="button" className="admin-btn primary" onClick={() => setForm({ ...EMPTY })}>
            + Nueva tarea
          </button>
        )}
      </section>

      {form && !form.id && (
        <section className="admin-full">
          <article className="admin-card">
            <h2>Nueva tarea</h2>
            <form onSubmit={saveTask} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="admin-controls">
                <input className="admin-control" style={{ flex: 1 }} placeholder="Título *" value={form.title} onChange={e => setF("title", e.target.value)} required autoFocus />
                <select className="admin-control" value={form.priority} onChange={e => setF("priority", e.target.value)}>
                  {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
                <select className="admin-control" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="admin-controls">
                <select className="admin-control" style={{ flex: 1 }} value={form.assigned_to} onChange={e => setF("assigned_to", e.target.value)}>
                  <option value="">Sin asignar</option>
                  {users.map(u => <option key={u.uuid} value={u.uuid}>{u.full_name || u.email}</option>)}
                </select>
                <select className="admin-control" style={{ flex: 1 }} value={form.project_id} onChange={e => setF("project_id", e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map(p => {
                    const id = String(p.nocodb_id ?? p.id);
                    return <option key={id} value={id}>{p.title}</option>;
                  })}
                </select>
                <input className="admin-control" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Guardando…" : "Crear tarea"}</button>
                <button type="button" className="admin-btn" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          </article>
        </section>
      )}

      {form?.id && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setForm(null)}>
          <div className="admin-card admin-modal-card modal-inner" style={{ maxWidth: 520, width: "95vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Editar tarea</h2>
              <button type="button" className="admin-modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <form onSubmit={saveTask} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="admin-control" placeholder="Título *" value={form.title} onChange={e => setF("title", e.target.value)} required autoFocus />
              <div className="admin-controls">
                <select className="admin-control" value={form.priority} onChange={e => setF("priority", e.target.value)}>
                  {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
                <select className="admin-control" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="admin-controls">
                <select className="admin-control" style={{ flex: 1 }} value={form.assigned_to} onChange={e => setF("assigned_to", e.target.value)}>
                  <option value="">Sin asignar</option>
                  {users.map(u => <option key={u.uuid} value={u.uuid}>{u.full_name || u.email}</option>)}
                </select>
                <select className="admin-control" style={{ flex: 1 }} value={form.project_id} onChange={e => setF("project_id", e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map(p => {
                    const id = String(p.nocodb_id ?? p.id);
                    return <option key={id} value={id}>{p.title}</option>;
                  })}
                </select>
                <input className="admin-control" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="admin-btn" onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="admin-full">
        <article className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Tarea</th><th>Prioridad</th><th>Estado</th><th>Workspace</th><th>Asignado a</th><th>Proyecto</th><th>Vence</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {!tasks.length ? (
                  <tr><td colSpan={8} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin tareas.</td></tr>
                ) : tasks.map(t => {
                  const id = t.nocodb_id ?? t.id;
                  const session = sessionByTask[id];
                  return (
                    <tr key={id}>
                      <td><strong>{t.title}</strong></td>
                      <td>
                        <span className={`admin-pill ${t.priority === "high" ? "danger" : t.priority === "medium" ? "warning" : ""}`}>
                          {PRIORITY_LABEL[t.priority] ?? t.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-pill ${t.status === "done" ? "success" : t.status === "in_progress" ? "warning" : ""}`}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </td>
                      <td>
                        {session ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span className={`admin-pill ${session.status === "in_review" ? "warning" : session.status === "changes_requested" ? "danger" : session.status === "approved" ? "success" : ""}`}>
                              {SESSION_LABEL[session.status] ?? session.status}
                            </span>
                            {session.status === "in_review" && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button type="button" className="admin-btn primary" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => approveSession(id)}>
                                  Aprobar
                                </button>
                                <button type="button" className="admin-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => { setChangesModal({ taskId: id, title: t.title }); setChangesText(""); }}>
                                  Pedir cambios
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="admin-muted" style={{ fontSize: "0.85rem" }}>—</span>
                        )}
                      </td>
                      <td className="admin-muted" style={{ fontSize: "0.85rem" }}>{userMap[t.assigned_to] || "—"}</td>
                      <td className="admin-muted" style={{ fontSize: "0.85rem" }}>{projectMap[String(t.project_id)] || "—"}</td>
                      <td className="admin-muted" style={{ fontSize: "0.85rem" }}>{t.due_date || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="admin-btn" onClick={() => setForm({ id, title: t.title, description: t.description || "", status: t.status, priority: t.priority, project_id: String(t.project_id || ""), assigned_to: t.assigned_to || "", due_date: t.due_date || "" })}>
                            Editar
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => setConfirmState({
                            title: `¿Eliminar "${t.title}"?`,
                            message: "Esta acción no se puede deshacer.",
                            danger: true,
                            confirmLabel: "Eliminar",
                            onConfirm: () => deleteTask(id, t.title),
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

      {changesModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setChangesModal(null)}>
          <div className="admin-card admin-modal-card modal-inner" style={{ maxWidth: 480, width: "95vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Pedir cambios</h2>
              <button type="button" className="admin-modal-close" onClick={() => setChangesModal(null)}>✕</button>
            </div>
            <p className="admin-muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              "{changesModal.title}" — este mensaje se le envía al cliente en el hilo de la tarea.
            </p>
            <form onSubmit={submitChanges} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <textarea
                className="admin-control"
                style={{ minHeight: 100, resize: "vertical" }}
                placeholder="¿Qué hay que corregir? *"
                value={changesText}
                onChange={e => setChangesText(e.target.value)}
                required
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="admin-btn" onClick={() => setChangesModal(null)}>Cancelar</button>
                <button type="submit" className="admin-btn primary" disabled={sendingChanges || !changesText.trim()}>
                  {sendingChanges ? "Enviando…" : "Enviar"}
                </button>
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
