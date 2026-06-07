import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

async function patchStatus(id, status) {
  return apiFetch(`/api/user/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

function projectName(projectId, projectMap) {
  const p = projectMap[String(projectId)];
  return p?.title ?? null;
}

function FocusCard({ task, projectMap, onDone, onSkip, hasNext }) {
  const [completing, setCompleting] = useState(false);
  const name = projectName(task.project_id, projectMap);

  async function handleDone() {
    setCompleting(true);
    await onDone(task);
    setCompleting(false);
  }

  return (
    <div className="focus-card">
      {name && <span className="focus-card-project">{name}</span>}
      <h2 className="focus-card-title">{task.title}</h2>
      {task.description && (
        <p className="focus-card-desc">{task.description}</p>
      )}
      {task.due_date && (
        <span className="focus-card-due">
          Vence {new Date(task.due_date).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
        </span>
      )}
      <div className="focus-card-actions">
        <button
          className="focus-btn-done"
          onClick={handleDone}
          disabled={completing}
        >
          {completing ? "Completando…" : "Completar ✓"}
        </button>
        {hasNext && (
          <button className="focus-btn-skip" onClick={() => onSkip(task)}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}

function QueueItem({ task, projectMap, onDone }) {
  const name = projectName(task.project_id, projectMap);
  return (
    <li className="focus-queue-item">
      <div className="focus-queue-body">
        <span className="focus-queue-title">{task.title}</span>
        {name && <span className="focus-queue-project">{name}</span>}
      </div>
      <button
        className="focus-queue-done"
        onClick={() => onDone(task)}
        aria-label={`Completar "${task.title}"`}
      >✓</button>
    </li>
  );
}

function PendingItem({ task, projectMap, onStart }) {
  const name = projectName(task.project_id, projectMap);
  return (
    <li className="focus-pending-item">
      <div className="focus-queue-body">
        <span className="focus-queue-title">{task.title}</span>
        {name && <span className="focus-queue-project">{name}</span>}
      </div>
      <button className="focus-pending-start" onClick={() => onStart(task)}>
        Empezar
      </button>
    </li>
  );
}

export default function WorkspaceFocusView() {
  const [tasks, setTasks]       = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/user/tasks"),
      apiFetch("/api/user/projects"),
    ])
      .then(([tRes, pRes]) => {
        setTasks(tRes.tasks ?? []);
        setProjects(pRes.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const projectMap = {};
  projects.forEach(p => {
    projectMap[String(p.nocodb_id ?? p.id)] = p;
  });

  const inProgress = tasks.filter(t => t.status === "in_progress");
  const pending    = tasks.filter(t => t.status === "pending");

  function taskId(task) { return task.nocodb_id ?? task.id; }

  function updateTaskStatus(id, status) {
    setTasks(prev => prev.map(t => taskId(t) === id ? { ...t, status } : t));
  }

  async function handleDone(task) {
    const id = taskId(task);
    updateTaskStatus(id, "done");
    setFocusIndex(0);
    try {
      await patchStatus(id, "done");
    } catch {
      updateTaskStatus(id, "in_progress");
    }
  }

  async function handleStart(task) {
    const id = taskId(task);
    updateTaskStatus(id, "in_progress");
    setFocusIndex(0);
    try {
      await patchStatus(id, "in_progress");
    } catch {
      updateTaskStatus(id, "pending");
    }
  }

  function handleSkip(task) {
    setFocusIndex(i => (i + 1) % inProgress.length);
  }

  if (loading) return (
    <div className="focus-view">
      <header className="view-header">
        <div className="skeleton-block" style={{ height: "1.5rem", width: "10rem" }} />
      </header>
      <div className="focus-card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="skeleton-block" style={{ height: "0.8rem", width: "5rem" }} />
        <div className="skeleton-block" style={{ height: "1.35rem", width: "80%" }} />
        <div className="skeleton-block" style={{ height: "0.875rem", width: "60%" }} />
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div className="skeleton-block" style={{ height: "2.2rem", width: "8rem", borderRadius: "6px" }} />
          <div className="skeleton-block" style={{ height: "2.2rem", width: "7rem", borderRadius: "6px" }} />
        </div>
      </div>
    </div>
  );

  const safeIndex  = inProgress.length ? focusIndex % inProgress.length : 0;
  const focusTask  = inProgress[safeIndex] ?? null;
  const queueTasks = inProgress.filter((_, i) => i !== safeIndex);

  const allDone    = tasks.length > 0 && tasks.every(t => t.status === "done");

  return (
    <div className="focus-view">
      <header className="view-header">
        <h1 className="view-title">Workspace</h1>
        <p className="view-sub">
          {inProgress.length
            ? `${inProgress.length} tarea${inProgress.length !== 1 ? "s" : ""} en curso.`
            : pending.length
            ? "No hay tareas en curso. Elegí una para empezar."
            : "Nada pendiente por ahora."}
        </p>
      </header>

      {allDone ? (
        <div className="focus-complete">
          <p className="focus-complete-title">Todo completo.</p>
          <p className="focus-complete-sub">No quedan tareas pendientes en tus proyectos.</p>
        </div>
      ) : focusTask ? (
        <>
          <FocusCard
            task={focusTask}
            projectMap={projectMap}
            onDone={handleDone}
            onSkip={handleSkip}
            hasNext={inProgress.length > 1}
          />

          {queueTasks.length > 0 && (
            <section className="focus-queue-section">
              <h3 className="focus-section-label">En cola</h3>
              <ul className="focus-queue-list">
                {queueTasks.map(t => (
                  <QueueItem
                    key={taskId(t)}
                    task={t}
                    projectMap={projectMap}
                    onDone={handleDone}
                  />
                ))}
              </ul>
            </section>
          )}

          {pending.length > 0 && (
            <section className="focus-queue-section">
              <h3 className="focus-section-label">Pendientes</h3>
              <ul className="focus-queue-list">
                {pending.map(t => (
                  <PendingItem
                    key={taskId(t)}
                    task={t}
                    projectMap={projectMap}
                    onStart={handleStart}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="focus-queue-section">
              <h3 className="focus-section-label">Disponibles para empezar</h3>
              <ul className="focus-queue-list">
                {pending.map(t => (
                  <PendingItem
                    key={taskId(t)}
                    task={t}
                    projectMap={projectMap}
                    onStart={handleStart}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
