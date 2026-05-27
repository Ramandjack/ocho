import { useEffect, useRef, useState } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { timeAgo } from "../../lib/utils.js";

const PHASES = [
  { id: "discovery",   label: "Discovery" },
  { id: "brief",       label: "Brief" },
  { id: "design",      label: "Diseño" },
  { id: "development", label: "Desarrollo" },
  { id: "testing",     label: "Testing" },
  { id: "launch",      label: "Lanzamiento" },
];

const PHASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));

const STATUS_LABEL = {
  pending:     "pendiente",
  in_progress: "en curso",
  done:        "completado",
};

const NEXT_STATUS = {
  pending:     "in_progress",
  in_progress: "done",
  done:        "pending",
};

const PROJECT_STATUS_LABEL = {
  draft:     "borrador",
  active:    "activo",
  completed: "completado",
  archived:  "archivado",
};

const TYPE_LABEL = {
  web:         "Web",
  saas:        "SaaS",
  ecommerce:   "Ecommerce",
  marketplace: "Marketplace",
  ia:          "IA",
};

export default function WorkspaceView() {
  const { id } = useParams();
  const { user } = useOutletContext();

  const [project, setProject]   = useState(null);
  const [tasks, setTasks]       = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [msgText, setMsgText]   = useState("");
  const [sending, setSending]   = useState(false);
  const [msgError, setMsgError] = useState(null);

  const msgEndRef  = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/user/projects/${id}`),
      apiFetch(`/api/user/projects/${id}/messages`).catch(() => ({ messages: [] })),
    ])
      .then(([projRes, msgRes]) => {
        setProject(projRes.project);
        setTasks(projRes.tasks ?? []);
        setMessages(msgRes.messages ?? []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function cycleStatus(task) {
    const next = NEXT_STATUS[task.status] ?? "pending";
    const tid  = task.nocodb_id ?? task.id;
    setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: next } : t));
    try {
      await apiFetch(`/api/user/tasks/${tid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: task.status } : t));
    }
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const content = msgText.trim();
    if (!content || sending) return;

    setSending(true);
    setMsgError(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      nocodb_id:   tempId,
      content,
      author_name: user?.first_name || user?.full_name?.split(" ")[0] || "Vos",
      author_role: user?.role || "client",
      CreatedAt:   new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimistic]);
    setMsgText("");

    try {
      const res = await apiFetch(`/api/user/projects/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages(prev => prev.map(m => (m.nocodb_id ?? m.id) === tempId ? res.message : m));
    } catch (err) {
      setMessages(prev => prev.filter(m => (m.nocodb_id ?? m.id) !== tempId));
      setMsgText(content);
      setMsgError(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (loading) return <div className="view-loading">Cargando proyecto…</div>;
  if (error)   return <div className="view-loading">{error}</div>;
  if (!project) return null;

  const done  = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const currentPhase      = project.phase || "discovery";
  const currentPhaseIndex = PHASE_INDEX[currentPhase] ?? 0;

  return (
    <div className="canvas-view">
      <Link to="/panel/projects" className="canvas-back">← Proyectos</Link>

      {/* ── Canvas header ──────────────────────────────────── */}
      <div className="canvas-header">
        <div className="canvas-header-meta">
          {project.type && (
            <span className="canvas-type-badge">
              {TYPE_LABEL[project.type] ?? project.type}
            </span>
          )}
          <span className={`canvas-status-badge ${project.status ?? ""}`}>
            {PROJECT_STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>

        <h1 className="canvas-title">{project.title}</h1>

        {project.description && (
          <p className="canvas-desc">{project.description}</p>
        )}

        {/* Phase tracker */}
        <div className="canvas-phases">
          {PHASES.map((phase, i) => {
            const state =
              i < currentPhaseIndex  ? "done"   :
              i === currentPhaseIndex ? "active" : "";
            return (
              <div key={phase.id} className={`canvas-phase ${state}`}>
                <div className="canvas-phase-connector" />
                <div className="canvas-phase-dot-wrap">
                  <div className="canvas-phase-dot" />
                </div>
                <span className="canvas-phase-label">{phase.label}</span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="canvas-progress">
            <div className="canvas-progress-track">
              <div className="canvas-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="canvas-progress-label">
              {pct}% · {done} de {total} tareas completadas
            </span>
          </div>
        )}
      </div>

      {/* ── Canvas grid ────────────────────────────────────── */}
      <div className="canvas-grid">

        {/* Tasks panel */}
        <section className="canvas-panel">
          <header className="canvas-panel-header">
            <span className="canvas-panel-title">Tareas</span>
            {total > 0 && (
              <span className="canvas-panel-count">{done}/{total}</span>
            )}
          </header>

          {!tasks.length ? (
            <p className="canvas-panel-empty">Sin tareas asignadas en este proyecto.</p>
          ) : (
            <ul className="canvas-task-list">
              {tasks.map(task => {
                const tid = task.nocodb_id ?? task.id;
                return (
                  <li key={tid} className={`canvas-task-item ${task.status ?? "pending"}`}>
                    <button
                      className={`canvas-task-pill ${task.status ?? "pending"}`}
                      onClick={() => cycleStatus(task)}
                      title="Cambiar estado"
                    >
                      {STATUS_LABEL[task.status] ?? task.status}
                    </button>
                    <div className="canvas-task-body">
                      <span className="canvas-task-title">{task.title}</span>
                      {task.due_date && (
                        <span className="canvas-task-due">
                          {new Date(task.due_date).toLocaleDateString("es-AR", {
                            day: "numeric", month: "short",
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Feedback thread */}
        <section className="canvas-panel">
          <header className="canvas-panel-header">
            <span className="canvas-panel-title">Feedback</span>
          </header>

          <div className="canvas-thread">
            {!messages.length ? (
              <p className="canvas-thread-empty">
                Usá este espacio para dejar comentarios,<br />preguntas o feedback sobre el proyecto.
              </p>
            ) : (
              messages.map(msg => {
                const isTeam = ["admin", "member"].includes(
                  String(msg.author_role || "").toLowerCase()
                );
                const msgId = msg.nocodb_id ?? msg.id;
                return (
                  <div
                    key={msgId}
                    className={`canvas-msg ${isTeam ? "team" : "client"}`}
                  >
                    <div className="canvas-msg-meta">
                      <span className="canvas-msg-author">
                        {isTeam ? "OCHO" : (msg.author_name || "Vos")}
                      </span>
                      <span className="canvas-msg-time">
                        {timeAgo(msg.CreatedAt || msg.created_at)}
                      </span>
                    </div>
                    <p className="canvas-msg-content">{msg.content}</p>
                  </div>
                );
              })
            )}
            <div ref={msgEndRef} />
          </div>

          <form className="canvas-msg-form" onSubmit={sendMessage}>
            {msgError && (
              <p className="canvas-msg-error">{msgError}</p>
            )}
            <div className="canvas-msg-input-row">
              <textarea
                ref={textareaRef}
                className="canvas-msg-input"
                placeholder="Escribí tu feedback o consulta… (Enter para enviar)"
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={handleKey}
                disabled={sending}
                rows={2}
              />
              <button
                className="canvas-msg-send"
                type="submit"
                disabled={sending || !msgText.trim()}
              >
                {sending ? "…" : "Enviar"}
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
