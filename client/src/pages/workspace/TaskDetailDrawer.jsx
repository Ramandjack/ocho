import { Link } from "react-router-dom";
import TaskComments from "./TaskComments.jsx";

const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

const STATUS_LABEL = {
  pending:        "Pendiente",
  in_progress:    "En curso",
  waiting_client: "Esperando cliente",
  done:           "Completado",
};

const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" };

export default function TaskDetailDrawer({ task, projectName, currentUserUuid, onClose, onEdit, show }) {
  if (!task) return null;
  const taskId = task.nocodb_id ?? task.id;

  return (
    <div className="task-drawer-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <aside className="task-drawer">
        <div className="task-drawer-header">
          <span className="task-drawer-eyebrow">
            {projectName}
            {projectName && task.phase && <span className="sep"> › </span>}
            {task.phase && PHASE_LABEL[task.phase]}
          </span>
          <button className="task-form-close" onClick={onClose} type="button" aria-label="Cerrar">✕</button>
        </div>

        <h2 className="task-drawer-title">{task.title}</h2>
        {task.description && <p className="task-drawer-desc">{task.description}</p>}

        <div className="task-drawer-meta">
          <span className="next-action-pill">{STATUS_LABEL[task.status] || task.status}</span>
          <span className={`next-action-pill${task.priority === "high" ? " crit" : ""}`}>
            Prioridad {PRIORITY_LABEL[task.priority] || task.priority}
          </span>
          {task.estimated_hours != null && <span className="next-action-pill">≈ {task.estimated_hours}h</span>}
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
            <p className="task-drawer-section-label">Desbloquea</p>
            <ul className="task-drawer-list">
              {task.unlocks.map(u => <li key={u.id}>{u.title}</li>)}
            </ul>
          </div>
        )}

        {task.links?.length > 0 && (
          <div className="task-drawer-section">
            <p className="task-drawer-section-label">Links / entregables</p>
            <ul className="task-drawer-list">
              {task.links.map((l, i) => (
                <li key={i}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="task-drawer-section">
          <TaskComments taskId={taskId} currentUserUuid={currentUserUuid} show={show} />
        </div>

        <Link to={`/panel/tasks/${taskId}/workspace`} className="task-form-save task-drawer-edit-btn">
          Abrir Workspace →
        </Link>

        {onEdit && (
          <button className="task-form-cancel task-drawer-edit-btn" onClick={() => onEdit(task)} type="button">
            Editar tarea
          </button>
        )}
      </aside>
    </div>
  );
}
