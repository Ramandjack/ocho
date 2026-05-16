import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";

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

export default function WorkspaceView() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    apiFetch(`/api/user/projects/${id}`)
      .then(res => {
        setProject(res.project);
        setTasks(res.tasks ?? []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function cycleStatus(task) {
    const next = NEXT_STATUS[task.status] ?? "pending";
    const tid = task.nocodb_id ?? task.id;

    setTasks(prev =>
      prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: next } : t)
    );

    try {
      await apiFetch(`/api/user/tasks/${tid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setTasks(prev =>
        prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: task.status } : t)
      );
    }
  }

  if (loading) return <div className="view-loading">Cargando proyecto…</div>;
  if (error)   return <div className="view-loading">{error}</div>;
  if (!project) return null;

  const done  = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="workspace-view">
      <Link to="/panel/projects" className="workspace-back">← Proyectos</Link>

      <header className="workspace-project-header">
        <div className="workspace-project-meta">
          <span className={`workspace-project-status ${project.status ?? ""}`}>
            {PROJECT_STATUS_LABEL[project.status] ?? project.status}
          </span>
          {project.permission && (
            <span className="workspace-project-perm">{project.permission}</span>
          )}
        </div>

        <h1 className="workspace-project-title">{project.title}</h1>

        {project.description && (
          <p className="workspace-project-desc">{project.description}</p>
        )}

        {total > 0 && (
          <div className="workspace-progress">
            <div className="workspace-progress-bar">
              <div className="workspace-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="workspace-progress-label">{done}/{total} completadas</span>
          </div>
        )}
      </header>

      <section className="workspace-tasks">
        <h2 className="workspace-tasks-title">Tareas</h2>

        {!tasks.length ? (
          <p className="view-empty">No hay tareas en este proyecto.</p>
        ) : (
          <ul className="task-list">
            {tasks.map(task => {
              const tid = task.nocodb_id ?? task.id;
              return (
                <li key={tid} className="task-item">
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
      </section>
    </div>
  );
}
