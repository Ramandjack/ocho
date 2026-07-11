import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { computeProjectProgress } from "../../lib/projectProgress.js";
import TaskComments from "./TaskComments.jsx";
import DocumentEditor from "./DocumentEditor.jsx";
import CodeEditor from "./CodeEditor.jsx";
import DesignCanvas from "./DesignCanvas.jsx";
import FilesPanel from "./FilesPanel.jsx";

const TABS = [
  { key: "document", label: "Documento" },
  { key: "code",     label: "Código" },
  { key: "design",   label: "Diseño" },
  { key: "files",    label: "Archivos" },
];

const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" };

const SESSION_LABEL = {
  active:            "En curso",
  paused:            "Pausado",
  in_review:         "En revisión",
  changes_requested: "Cambios solicitados",
  approved:          "Aprobado",
  closed:            "Cerrado",
};

export default function TaskWorkspaceView() {
  const { id } = useParams();
  const { user, show } = useOutletContext();

  const [task,         setTask]         = useState(null);
  const [session,      setSession]      = useState(null);
  const [projectTasks, setProjectTasks] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [acting,       setActing]       = useState(false);
  const [comments,     setComments]     = useState([]);
  const [activeTab,    setActiveTab]    = useState("document");
  const [docsByKind,   setDocsByKind]   = useState({});
  const [docErrors,    setDocErrors]    = useState({});
  const [docLoading,   setDocLoading]   = useState({});

  const userUuid = user?.uuid ?? user?.sub ?? null;

  const loadDoc = useCallback(async (kind) => {
    setDocLoading(prev => ({ ...prev, [kind]: true }));
    try {
      const res = await apiFetch(`/api/user/tasks/${id}/workspace/document?kind=${kind}`);
      setDocsByKind(prev => ({ ...prev, [kind]: res.document }));
      setDocErrors(prev => ({ ...prev, [kind]: null }));
    } catch (err) {
      setDocErrors(prev => ({ ...prev, [kind]: err.message || "No se pudo cargar el documento" }));
    } finally {
      setDocLoading(prev => ({ ...prev, [kind]: false }));
    }
  }, [id]);

  function selectTab(kind) {
    setActiveTab(kind);
    if (kind !== "files" && !docsByKind[kind] && !docLoading[kind]) loadDoc(kind);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tRes     = await apiFetch("/api/user/tasks");
      const allTasks = tRes.tasks ?? [];
      const found    = allTasks.find(t => String(t.nocodb_id ?? t.id) === String(id));
      if (!found) { setError("Tarea no encontrada o sin acceso."); return; }

      setTask(found);
      setProjectTasks(allTasks.filter(t => String(t.project_id) === String(found.project_id)));

      const wRes = await apiFetch(`/api/user/tasks/${id}/workspace`);
      let sess = wRes.session;
      if (!sess) {
        const startRes = await apiFetch(`/api/user/tasks/${id}/workspace/start`, { method: "POST" });
        sess = startRes.session;
      }
      setSession(sess);

      await loadDoc("document");
    } catch (err) {
      setError(err.message || "Error cargando el workspace");
    } finally {
      setLoading(false);
    }
  }, [id, loadDoc]);

  // Evita el doble fetch (y el doble POST .../start) que dispara React StrictMode al
  // invocar dos veces el efecto de montaje en desarrollo — el ref solo se resetea
  // cuando cambia el id de la tarea, no en el segundo invoke de StrictMode.
  const loadedForId = useRef(null);
  useEffect(() => {
    if (loadedForId.current === id) return;
    loadedForId.current = id;
    load();
  }, [id, load]);

  async function doAction(action) {
    setActing(true);
    try {
      const res = await apiFetch(`/api/user/tasks/${id}/workspace/session`, {
        method: "PATCH",
        body:   JSON.stringify({ action }),
      });
      setSession(res.session);
      show?.(
        action === "submit_review" ? "Enviado a revisión"
          : action === "pause"     ? "Sesión pausada"
          : "Sesión reanudada",
        "success"
      );
    } catch (err) {
      show?.(err.message || "No se pudo actualizar la sesión", "error");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="ws-workspace">
        <div className="skeleton-block" style={{ height: "1.5rem", width: "12rem", marginBottom: "1rem" }} />
        <div className="skeleton-block" style={{ height: "60vh", borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !task) {
    return <div className="view-loading">{error || "Tarea no encontrada."}</div>;
  }

  const progress = computeProjectProgress(
    { current_phase: task.project_current_phase },
    projectTasks
  );

  const sessionStatus = session?.status || "active";
  const docLocked = ["in_review", "approved", "closed"].includes(sessionStatus);
  // Los archivos no son un borrador en revisión — se pueden seguir adjuntando
  // incluso con la tarea aprobada. Solo se bloquean si la sesión está cerrada.
  const filesLocked = sessionStatus === "closed";

  const lastAdminComment = [...comments].reverse().find(m => String(m.author_role || "").toLowerCase() === "admin");

  return (
    <div className="ws-workspace">
      <Link to="/panel/tasks" className="canvas-back">← Tareas</Link>

      <div className="ws-top">
        <div className="ws-top-left">
          <span className={`ws-session-pill ${sessionStatus}`}>{SESSION_LABEL[sessionStatus] || sessionStatus}</span>
          {task.project_title && <span className="ws-crumb">{task.project_title}</span>}
          {task.phase && <span className="ws-crumb">› {PHASE_LABEL[task.phase] || task.phase}</span>}
        </div>
        <div className="ws-top-actions">
          {sessionStatus === "active" && (
            <button className="task-form-cancel" disabled={acting} onClick={() => doAction("pause")}>
              Pausar
            </button>
          )}
          {(sessionStatus === "paused" || sessionStatus === "changes_requested") && (
            <button className="task-form-cancel" disabled={acting} onClick={() => doAction("resume")}>
              Reanudar
            </button>
          )}
          {(sessionStatus === "active" || sessionStatus === "paused") && (
            <button className="task-form-save" disabled={acting} onClick={() => doAction("submit_review")}>
              Enviar revisión
            </button>
          )}
        </div>
      </div>

      <div className="ws-grid">

        {/* ── Panel izquierdo — Contexto ─────────────────────── */}
        <aside className="ws-col ws-col-context">
          <h1 className="ws-task-title">{task.title}</h1>
          {task.description && <p className="ws-task-desc">{task.description}</p>}

          <div className="ws-meta-row">
            <span className={`next-action-pill${task.priority === "high" ? " crit" : ""}`}>
              Prioridad {PRIORITY_LABEL[task.priority] || task.priority}
            </span>
            {task.estimated_hours != null && (
              <span className="next-action-pill">≈ {task.estimated_hours}h</span>
            )}
            {task.due_date && (
              <span className="next-action-pill">
                Vence {new Date(task.due_date).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>

          {task.is_blocked && (
            <div className="task-drawer-section">
              <p className="task-drawer-section-label">🔒 Bloqueada</p>
              <p className="task-drawer-blocked-text">{task.blocked_reason}</p>
            </div>
          )}

          {task.dependencies?.length > 0 && (
            <div className="task-drawer-section">
              <p className="task-drawer-section-label">Depende de</p>
              <ul className="task-drawer-list">
                {task.dependencies.map(d => (
                  <li key={d.id}>
                    <span className={`task-drawer-dep-dot${d.status === "done" ? " done" : ""}`} />
                    {d.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.unlocks?.length > 0 && (
            <div className="task-drawer-section">
              <p className="task-drawer-section-label">Próximos pasos · desbloquea</p>
              <ul className="task-drawer-list">
                {task.unlocks.map(u => <li key={u.id}>{u.title}</li>)}
              </ul>
            </div>
          )}

          {task.links?.length > 0 && (
            <div className="task-drawer-section">
              <p className="task-drawer-section-label">Entregables esperados</p>
              <ul className="task-drawer-list">
                {task.links.map((l, i) => (
                  <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a></li>
                ))}
              </ul>
            </div>
          )}

          <div className="task-drawer-section">
            <p className="task-drawer-section-label">Progreso del proyecto</p>
            <div className="canvas-progress">
              <div className="canvas-progress-track">
                <div className="canvas-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <p className="ws-progress-value">{progress}%</p>
          </div>
        </aside>

        {/* ── Panel central — Área de trabajo ────────────────── */}
        <section className="ws-col ws-col-work">
          <div className="ws-tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`ws-tab${activeTab === tab.key ? " active" : ""}`}
                type="button"
                onClick={() => selectTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <button className="ws-tab" type="button" disabled title="Próximamente">Entregables</button>
          </div>

          {sessionStatus === "changes_requested" && (
            <div className="ws-review-banner">
              <p className="ws-review-banner-title">🔁 OCHO pidió cambios en esta tarea</p>
              {lastAdminComment && <p className="ws-review-banner-text">{lastAdminComment.content}</p>}
              <button className="task-form-save" type="button" disabled={acting} onClick={() => doAction("resume")}>
                Reanudar y corregir
              </button>
            </div>
          )}

          {sessionStatus === "in_review" && (
            <div className="ws-review-banner info">
              <p className="ws-review-banner-title">👀 Enviado a revisión</p>
              <p className="ws-review-banner-text">El equipo de OCHO está revisando este documento. Te avisamos cuando haya una respuesta.</p>
            </div>
          )}

          {sessionStatus === "approved" && (
            <div className="ws-review-banner success">
              <p className="ws-review-banner-title">✅ Tarea aprobada</p>
            </div>
          )}

          {sessionStatus === "closed" && (
            <div className="ws-review-banner">
              <p className="ws-review-banner-title">🔒 Sesión cerrada</p>
              <p className="ws-review-banner-text">Esta sesión de trabajo está cerrada — el documento quedó en modo solo lectura.</p>
            </div>
          )}

          {activeTab === "files" ? (
            <FilesPanel taskId={id} currentUserUuid={userUuid} locked={filesLocked} show={show} />
          ) : docErrors[activeTab] ? (
            <div className="ws-doc-placeholder">
              <p className="ws-doc-placeholder-title">{docErrors[activeTab]}</p>
            </div>
          ) : !docsByKind[activeTab] ? (
            <p className="ws-history-empty">Cargando…</p>
          ) : activeTab === "document" ? (
            <DocumentEditor
              documentId={docsByKind.document.id}
              initialContent={docsByKind.document.content}
              initialUpdatedAt={docsByKind.document.updated_at}
              locked={docLocked}
              show={show}
            />
          ) : activeTab === "code" ? (
            <CodeEditor
              documentId={docsByKind.code.id}
              initialContent={docsByKind.code.content}
              initialUpdatedAt={docsByKind.code.updated_at}
              locked={docLocked}
              show={show}
            />
          ) : activeTab === "design" ? (
            <DesignCanvas
              documentId={docsByKind.design.id}
              initialContent={docsByKind.design.content}
              initialUpdatedAt={docsByKind.design.updated_at}
              locked={docLocked}
              show={show}
            />
          ) : null}

          <div className="task-drawer-section">
            <TaskComments taskId={id} currentUserUuid={userUuid} show={show} onLoaded={setComments} />
          </div>
        </section>

        {/* ── Panel derecho — Product Coach ──────────────────── */}
        <aside className="ws-col ws-col-coach">
          <p className="pw-card-title">Product Coach</p>
          <p className="pw-card-empty">
            Las acciones de IA (mejorar, resumir, generar criterios de aceptación) se habilitan
            cuando el documento esté disponible. Nunca van a modificar contenido automáticamente —
            siempre vas a poder ver el cambio, aplicarlo o descartarlo.
          </p>
        </aside>

      </div>
    </div>
  );
}
