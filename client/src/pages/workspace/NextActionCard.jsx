const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" };

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d   = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - now) / 86400000);
  if (diffDays < 0)  return { text: "vencida", tone: "crit" };
  if (diffDays === 0) return { text: "vence hoy", tone: "warn" };
  return { text: `vence ${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`, tone: "" };
}

export default function NextActionCard({ task, onStart, onOpen }) {
  if (!task) {
    return (
      <section className="next-action next-action-empty">
        <p className="next-action-empty-text">No tenés tareas urgentes ahora — todo al día.</p>
      </section>
    );
  }

  const due = formatDue(task.due_date);
  const unlocksCount = task.unlocks?.length || 0;
  const isInProgress = task.status === "in_progress";

  return (
    <section className="next-action">
      <p className="next-action-eyebrow">Mi siguiente acción</p>
      <div className="next-action-breadcrumb">
        {task.project_title && <b>{task.project_title}</b>}
        {task.project_title && task.phase && <span className="sep">›</span>}
        {task.phase && <span>{PHASE_LABEL[task.phase] || task.phase}</span>}
      </div>

      <h3 className="next-action-title">{task.title}</h3>

      <div className="next-action-meta">
        <span className={`next-action-pill${task.priority === "high" ? " crit" : ""}`}>
          Prioridad {PRIORITY_LABEL[task.priority] || task.priority}
        </span>
        {task.estimated_hours != null && (
          <span className="next-action-pill">≈ {task.estimated_hours}h</span>
        )}
        {due && <span className={`next-action-pill${due.tone ? ` ${due.tone}` : ""}`}>{due.text}</span>}
      </div>

      {unlocksCount > 0 && (
        <p className="next-action-unlocks">
          Esta tarea desbloquea {unlocksCount} tarea{unlocksCount !== 1 ? "s" : ""} más.
        </p>
      )}

      <button
        type="button"
        className="next-action-btn"
        onClick={() => (isInProgress ? onOpen(task) : onStart(task))}
      >
        {isInProgress ? "Continuar →" : "Comenzar →"}
      </button>
    </section>
  );
}
