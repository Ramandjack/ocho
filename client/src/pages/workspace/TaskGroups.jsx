import { useState } from "react";
import TaskCard from "./TaskCard.jsx";

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d.getTime() === now.getTime();
}

function sortTasks(list) {
  return [...list].sort((a, b) => {
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
  });
}

/**
 * Agrupa tareas por urgencia/estado en vez de mostrarlas como una lista cronológica.
 * Prioridad de bucket (mutuamente excluyente): completadas > bloqueadas > esperando
 * cliente > hoy > próximas — así una tarea bloqueada no se cuela en "Hoy" aunque venza hoy.
 */
function groupTasks(tasks) {
  const done      = tasks.filter(t => t.status === "done");
  const rest1     = tasks.filter(t => t.status !== "done");
  const blocked   = rest1.filter(t => t.is_blocked);
  const rest2     = rest1.filter(t => !t.is_blocked);
  const waiting   = rest2.filter(t => t.status === "waiting_client");
  const rest3     = rest2.filter(t => t.status !== "waiting_client");
  const today     = rest3.filter(t => isToday(t.due_date));
  const upcoming  = rest3.filter(t => !isToday(t.due_date));

  return [
    { key: "today",    label: "Hoy",                items: sortTasks(today) },
    { key: "upcoming", label: "Próximas",            items: sortTasks(upcoming) },
    { key: "waiting",  label: "Esperando feedback",  items: sortTasks(waiting) },
    { key: "blocked",  label: "Bloqueadas",          items: sortTasks(blocked) },
    { key: "done",     label: "Completadas",         items: sortTasks(done), collapsedByDefault: true },
  ];
}

export default function TaskGroups({ tasks, commonCardProps }) {
  const groups = groupTasks(tasks);
  const [showDone, setShowDone] = useState(false);

  if (!tasks.length) return null;

  // Si "Completadas" es el único grupo con contenido (p. ej. el usuario filtró
  // explícitamente por "Completadas"), no tiene sentido arrancar colapsado —
  // eso es lo único que hay para mostrar.
  const onlyDoneHasItems = groups.every(g => g.key === "done" || g.items.length === 0);

  return (
    <div className="task-groups">
      {groups.map(g => {
        if (!g.items.length) return null;
        const collapsed = g.collapsedByDefault && !onlyDoneHasItems && !showDone;

        return (
          <div key={g.key} className="task-group">
            <div className="task-group-head">
              <span className="task-group-label">{g.label}</span>
              <span className="task-group-count">{g.items.length}</span>
              {g.collapsedByDefault && (
                <button
                  type="button"
                  className="task-group-toggle"
                  onClick={() => setShowDone(v => !v)}
                >
                  {collapsed ? "Mostrar" : "Ocultar"}
                </button>
              )}
            </div>

            {!collapsed && (
              <div className="task-group-body">
                {g.items.map(task => (
                  <TaskCard
                    key={task.nocodb_id ?? task.id}
                    task={task}
                    projectName={task._projectName}
                    compact={false}
                    {...commonCardProps}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
