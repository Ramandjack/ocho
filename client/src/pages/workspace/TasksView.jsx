import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
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

const FILTER_LABEL = {
  all:         "Todas",
  pending:     "Pendientes",
  in_progress: "En curso",
  done:        "Completadas",
};

const PRIORITY_OPTIONS = ["low", "medium", "high"];
const PRIORITY_LABEL   = { low: "Baja", medium: "Media", high: "Alta" };

function NewTaskForm({ projects, userUuid, onSuccess, onClose }) {
  const [title, setTitle]       = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate]   = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.nocodb_id ?? projects[0]?.id ?? "");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { titleRef.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title:       title.trim(),
          priority,
          due_date:    dueDate || null,
          project_id:  projectId ? Number(projectId) : null,
          assigned_to: userUuid,
          status:      "pending",
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="project-form" onSubmit={submit} noValidate>
      <div className="project-form-row">
        <div className="project-form-field" style={{ flex: 1 }}>
          <input
            ref={titleRef}
            className="project-form-input"
            placeholder="Título de la tarea"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={saving}
            autoComplete="off"
          />
        </div>
        <select
          className="project-form-select"
          value={priority}
          onChange={e => setPriority(e.target.value)}
          disabled={saving}
        >
          {PRIORITY_OPTIONS.map(p => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
      </div>

      <div className="project-form-row">
        {projects.length > 0 && (
          <select
            className="project-form-select"
            style={{ flex: 1 }}
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            disabled={saving}
          >
            <option value="">Sin proyecto</option>
            {projects.map(p => (
              <option key={p.nocodb_id ?? p.id} value={p.nocodb_id ?? p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        <input
          className="project-form-input"
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          disabled={saving}
          style={{ flex: 1 }}
        />
      </div>

      <div className="project-form-footer">
        {error ? (
          <span className="project-form-error">{error}</span>
        ) : (
          <span className="project-form-hint dim">Esc para cancelar</span>
        )}
        <div className="project-form-actions">
          <button type="button" className="project-form-cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="project-form-save" disabled={saving}>
            {saving ? "Creando…" : "Crear tarea"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function TasksView() {
  const { user, show }        = useOutletContext();
  const [tasks, setTasks]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [adding, setAdding]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  async function fetchTasks() {
    const res = await apiFetch("/api/user/tasks");
    setTasks(res.tasks ?? []);
  }

  useEffect(() => {
    Promise.all([
      apiFetch("/api/user/tasks"),
      apiFetch("/api/user/projects"),
    ])
      .then(([tRes, pRes]) => {
        setTasks(tRes.tasks ?? []);
        setProjects(pRes.projects ?? []);
      })
      .catch(err => show(err.message || "Error cargando las tareas", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleTaskSuccess() {
    setAdding(false);
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }

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
    } catch (err) {
      setTasks(prev =>
        prev.map(t => (t.nocodb_id ?? t.id) === id ? { ...t, status: task.status } : t)
      );
      show(err.message || "No se pudo actualizar el estado de la tarea", "error");
    }
  }

  const visible = filter === "all"
    ? tasks
    : tasks.filter(t => t.status === filter);

  if (loading) {
    return (
      <div className="tasks-view">
        <header className="view-header">
          <div className="skeleton-block" style={{ height: "1.5rem", width: "8rem" }} />
        </header>
        <div className="task-filters">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton-block" style={{ height: "2rem", width: "6rem", borderRadius: "999px" }} />
          ))}
        </div>
        <ul className="task-list">
          {[0, 1, 2, 3, 4].map(i => (
            <li key={i} className="task-item">
              <div className="skeleton-block" style={{ height: "1.6rem", width: "5.5rem", borderRadius: "999px", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton-block" style={{ height: "0.875rem", width: `${60 + (i % 3) * 15}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="tasks-view">
      <header className="view-header">
        <div className="projects-header-row">
          <div>
            <h1 className="view-title">Tareas</h1>
            <p className="view-sub">
              {refreshing ? "Actualizando…" : "Todas las tareas asignadas a tu cuenta."}
            </p>
          </div>
          {isAdmin && !adding && (
            <button className="projects-add-btn" onClick={() => setAdding(true)}>
              + Nueva tarea
            </button>
          )}
        </div>
      </header>

      {adding && (
        <NewTaskForm
          projects={projects}
          userUuid={user?.uuid ?? user?.sub}
          onSuccess={handleTaskSuccess}
          onClose={() => setAdding(false)}
        />
      )}

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
