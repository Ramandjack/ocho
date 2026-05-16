import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const STATUSES = ["pending", "in_progress", "done"];

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

const FILTER_LABEL = {
  all:         "Todas",
  pending:     "Pendientes",
  in_progress: "En curso",
  done:        "Completadas",
};

function priorityDot(priority) {
  if (priority === "high")   return "•";
  if (priority === "medium") return "·";
  return "";
}

export default function TasksView() {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");

  useEffect(() => {
    apiFetch("/api/user/tasks")
      .then(res => setTasks(res.tasks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function cycleStatus(task) {
    const next = NEXT_STATUS[task.status] ?? "pending";
    const id = task.nocodb_id ?? task.id;

    setTasks(prev =>
      prev.map(t => (t.nocodb_id ?? t.id) === id ? { ...t, status: next } : t)
    );

    try {
      await apiFetch(`/api/user/tasks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setTasks(prev =>
        prev.map(t => (t.nocodb_id ?? t.id) === id ? { ...t, status: task.status } : t)
      );
    }
  }

  const visible = filter === "all"
    ? tasks
    : tasks.filter(t => t.status === filter);

  if (loading) {
    return <div className="view-loading">Cargando tareas…</div>;
  }

  return (
    <div className="tasks-view">
      <header className="view-header">
        <h1 className="view-title">Tareas</h1>
        <p className="view-sub">Todas las tareas asignadas a tu cuenta.</p>
      </header>

      <div className="task-filters">
        {["all", "pending", "in_progress", "done"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`task-filter-btn${filter === f ? " active" : ""}`}
          >
            {FILTER_LABEL[f]}
            {f !== "all" && (
              <span className="task-filter-count">
                {tasks.filter(t => t.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <p className="view-empty">
          {filter === "all"
            ? "Todavía no tenés tareas asignadas."
            : `Sin tareas con estado "${STATUS_LABEL[filter]}".`}
        </p>
      ) : (
        <ul className="task-list">
          {visible.map(task => {
            const id = task.nocodb_id ?? task.id;
            return (
              <li key={id} className="task-item">
                <button
                  className={`task-status-pill ${task.status ?? "pending"}`}
                  onClick={() => cycleStatus(task)}
                  title="Cambiar estado"
                >
                  {STATUS_LABEL[task.status] ?? task.status}
                </button>

                <div className="task-item-body">
                  <span className="task-item-title">
                    {task.priority === "high" && (
                      <span className="task-priority-dot high">•</span>
                    )}
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span className="task-item-due">
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
    </div>
  );
}
