import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import TaskCard from "./TaskCard.jsx";

/* ── Constants ──────────────────────────────────────────────── */

const NEXT_STATUS = {
  pending:     "in_progress",
  in_progress: "done",
  done:        "pending",
};

const PHASE_ORDER = ["discovery", "brief", "design", "development", "testing", "launch"];
const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

const PRIORITY_OPTIONS = ["low", "medium", "high"];
const PRIORITY_LABEL   = { low: "Baja", medium: "Media", high: "Alta" };

const LABEL_OPTIONS = [
  { value: "ux",            label: "UX" },
  { value: "research",      label: "Research" },
  { value: "dev",           label: "Dev" },
  { value: "qa",            label: "QA" },
  { value: "design-system", label: "Design System" },
  { value: "docs",          label: "Docs" },
  { value: "ops",           label: "Ops" },
];

const KANBAN_COLS = [
  { status: "pending",     label: "Pendiente" },
  { status: "in_progress", label: "En curso" },
  { status: "done",        label: "Completado" },
];

const STATUS_FILTER_LABEL = {
  all:         "Todas",
  pending:     "Pendientes",
  in_progress: "En curso",
  done:        "Completadas",
};

/* ── TaskForm ───────────────────────────────────────────────── */

function TaskForm({ projects, initial = {}, onSuccess, onClose, isAdmin = false, userUuid = null }) {
  const isEdit = Boolean(initial.nocodb_id ?? initial.id);
  const taskId = initial.nocodb_id ?? initial.id;

  const [title,       setTitle]       = useState(initial.title       || "");
  const [description, setDescription] = useState(initial.description || "");
  const [priority,    setPriority]    = useState(initial.priority    || "medium");
  const [dueDate,     setDueDate]     = useState(initial.due_date    || "");
  const [projectId,   setProjectId]   = useState(
    initial.project_id ? String(initial.project_id) : (projects[0] ? String(projects[0].nocodb_id ?? projects[0].id) : "")
  );
  const [phase,  setPhase]  = useState(initial.phase || "");
  const [label,  setLabel]  = useState(initial.label || "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-set phase from project's current_phase when project changes
  useEffect(() => {
    if (!initial.phase && projectId) {
      const proj = projects.find(p => String(p.nocodb_id ?? p.id) === projectId);
      if (proj?.current_phase) setPhase(proj.current_phase);
    }
  }, [projectId]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { titleRef.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title:       title.trim(),
        description: description.trim(),
        priority,
        due_date:    dueDate || null,
        project_id:  projectId ? Number(projectId) : null,
        phase:       phase || null,
        label:       label || null,
      };
      if (isEdit) {
        const url = isAdmin
          ? `/api/admin/tasks/${taskId}`
          : `/api/user/tasks/${taskId}`;
        await apiFetch(url, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const url  = isAdmin ? "/api/admin/tasks" : "/api/user/tasks";
        const data = isAdmin
          ? { ...body, status: "pending" }
          : { ...body, status: "pending", assigned_to: userUuid };
        await apiFetch(url, { method: "POST", body: JSON.stringify(data) });
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="task-form-wrap">
      <div className="task-form-header">
        <span className="task-form-heading">{isEdit ? "Editar tarea" : "Nueva tarea"}</span>
        <button className="task-form-close" onClick={onClose} type="button" aria-label="Cerrar">✕</button>
      </div>

      <form className="task-form" onSubmit={submit} noValidate>
        <input
          ref={titleRef}
          className="task-form-input"
          placeholder="Título de la tarea *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={saving}
          autoComplete="off"
        />

        <textarea
          className="task-form-input task-form-textarea"
          placeholder="Descripción, criterios de aceptación o links relevantes…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={saving}
          rows={3}
        />

        <div className="task-form-row">
          {projects.length > 0 && (
            <select className="task-form-select" value={projectId}
              onChange={e => setProjectId(e.target.value)} disabled={saving}>
              <option value="">Sin proyecto</option>
              {projects.map(p => (
                <option key={p.nocodb_id ?? p.id} value={p.nocodb_id ?? p.id}>{p.title}</option>
              ))}
            </select>
          )}
          <select className="task-form-select" value={phase}
            onChange={e => setPhase(e.target.value)} disabled={saving}>
            <option value="">Sin fase</option>
            {PHASE_ORDER.map(ph => (
              <option key={ph} value={ph}>{PHASE_LABEL[ph]}</option>
            ))}
          </select>
        </div>

        <div className="task-form-row">
          <select className="task-form-select" value={priority}
            onChange={e => setPriority(e.target.value)} disabled={saving}>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
          <input className="task-form-input" type="date"
            value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={saving} />
          <select className="task-form-select" value={label}
            onChange={e => setLabel(e.target.value)} disabled={saving}>
            <option value="">Sin etiqueta</option>
            {LABEL_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        {error && <p className="task-form-error">{error}</p>}

        <div className="task-form-footer">
          <span className="task-form-hint">Esc para cancelar</span>
          <div className="task-form-actions">
            <button type="button" className="task-form-cancel" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="task-form-save" disabled={saving}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ── AiGenerator ────────────────────────────────────────────── */

const AI_COUNT_OPTIONS = [3, 5, 6, 8, 10];

function AiGenerator({ projects, onCreated, onClose, show }) {
  const [projectId, setProjectId] = useState(projects[0] ? String(projects[0].nocodb_id ?? projects[0].id) : "");
  const [phase,     setPhase]     = useState("discovery");
  const [count,     setCount]     = useState(6);
  const [loading,   setLoading]   = useState(false);
  const [preview,   setPreview]   = useState(null);    // array de suggestions
  const [selected,  setSelected]  = useState(new Set());
  const [creating,  setCreating]  = useState(false);

  // Auto-set phase from project's current_phase
  useEffect(() => {
    if (projectId) {
      const proj = projects.find(p => String(p.nocodb_id ?? p.id) === projectId);
      if (proj?.current_phase) setPhase(proj.current_phase);
    }
  }, [projectId]);

  async function generate(e) {
    e.preventDefault();
    if (!projectId) return;
    setLoading(true);
    setPreview(null);
    try {
      const res = await apiFetch(`/api/admin/projects/${projectId}/tasks/ai`, {
        method: "POST",
        body:   JSON.stringify({ phase, count }),
      });
      setPreview(res.tasks ?? []);
      setSelected(new Set((res.tasks ?? []).map((_, i) => i)));
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(i) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function createSelected() {
    const tasks = preview.filter((_, i) => selected.has(i));
    if (!tasks.length) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/admin/tasks/bulk", {
        method: "POST",
        body:   JSON.stringify({ tasks, project_id: Number(projectId), phase }),
      });
      show(`${res.count} tareas creadas`, "success");
      onCreated();
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ai-gen-modal">
        <div className="ai-gen-header">
          <div>
            <span className="ai-gen-title">✦ Generar tareas con IA</span>
            {preview && <span className="ai-gen-sub">{preview.length} sugerencias · seleccioná las que querés crear</span>}
          </div>
          <button className="task-form-close" onClick={onClose} type="button">✕</button>
        </div>

        {!preview ? (
          <form className="ai-gen-form" onSubmit={generate}>
            <div className="task-form-row">
              <select className="task-form-select" value={projectId}
                onChange={e => setProjectId(e.target.value)} disabled={loading} required>
                <option value="">Seleccioná un proyecto *</option>
                {projects.map(p => (
                  <option key={p.nocodb_id ?? p.id} value={p.nocodb_id ?? p.id}>{p.title}</option>
                ))}
              </select>
              <select className="task-form-select" value={phase}
                onChange={e => setPhase(e.target.value)} disabled={loading}>
                {PHASE_ORDER.map(ph => (
                  <option key={ph} value={ph}>{PHASE_LABEL[ph]}</option>
                ))}
              </select>
              <select className="task-form-select" value={count}
                onChange={e => setCount(Number(e.target.value))} disabled={loading}
                style={{ maxWidth: "7rem" }}>
                {AI_COUNT_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} tareas</option>
                ))}
              </select>
            </div>
            <div className="task-form-footer" style={{ marginTop: 8 }}>
              <span className="task-form-hint">Claude Haiku analiza el proyecto y genera tareas accionables.</span>
              <button type="submit" className="task-form-save" disabled={loading || !projectId}>
                {loading ? (
                  <span className="ai-gen-loading">
                    <span className="pw-ai-dot" /><span className="pw-ai-dot" /><span className="pw-ai-dot" />
                    Generando…
                  </span>
                ) : "Generar"}
              </button>
            </div>
          </form>
        ) : (
          <div className="ai-gen-preview">
            <div className="ai-gen-preview-list">
              {preview.map((t, i) => (
                <label key={i} className={`ai-gen-item${selected.has(i) ? " selected" : ""}`}>
                  <input type="checkbox" checked={selected.has(i)}
                    onChange={() => toggleSelect(i)} />
                  <div className="ai-gen-item-body">
                    <div className="ai-gen-item-top">
                      <span className="ai-gen-item-title">{t.title}</span>
                      <span className="tc-prio high" style={{ textTransform: "none", fontSize: "0.65rem" }}>
                        {t.priority === "high" ? "Alta" : t.priority === "low" ? "Baja" : "Media"}
                      </span>
                      {t.label && <span className="tc-label">{t.label}</span>}
                    </div>
                    {t.description && <p className="ai-gen-item-desc">{t.description}</p>}
                  </div>
                </label>
              ))}
            </div>
            <div className="ai-gen-preview-footer">
              <button className="task-form-cancel" onClick={() => setPreview(null)} disabled={creating}>
                ← Regenerar
              </button>
              <button className="task-form-save" disabled={creating || selected.size === 0}
                onClick={createSelected}>
                {creating ? "Creando…" : `Crear ${selected.size} tarea${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── KanbanColumn ───────────────────────────────────────────── */

function KanbanColumn({ col, tasks, projectMap, onMoveTask, onStatusChange, onEdit, onDelete, onQuickAdd }) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) onMoveTask(taskId, col.status);
  }

  return (
    <div
      className={`kanban-col${dragOver ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="kanban-col-head">
        <span className="kanban-col-label">{col.label}</span>
        <span className="kanban-col-count">{tasks.length}</span>
      </div>

      <div className="kanban-col-body">
        {tasks.map(task => (
          <TaskCard
            key={task.nocodb_id ?? task.id}
            task={task}
            projectName={projectMap[String(task.project_id)]?.title ?? null}
            compact={true}
            draggable={true}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {onQuickAdd && (
        <button className="kanban-add-btn" onClick={onQuickAdd} type="button">
          + Agregar
        </button>
      )}
    </div>
  );
}

/* ── TasksView ──────────────────────────────────────────────── */

export default function TasksView() {
  const { user, show }          = useOutletContext();
  const [tasks,    setTasks]    = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [view,          setView]          = useState(() => localStorage.getItem("ocho_tasks_view") || "list");
  const [filterProject, setFilterProject] = useState("");
  const [filterPhase,   setFilterPhase]   = useState("");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [adding,        setAdding]        = useState(false);
  const [editingTask,   setEditingTask]   = useState(null);
  const [deletingId,    setDeletingId]    = useState(null);
  const [aiOpen,        setAiOpen]        = useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  const projectMap = Object.fromEntries(
    projects.map(p => [String(p.nocodb_id ?? p.id), p])
  );

  useEffect(() => {
    const projectsEndpoint = isAdmin ? "/api/admin/projects" : "/api/user/projects";
    Promise.all([
      apiFetch("/api/user/tasks"),
      apiFetch(projectsEndpoint),
    ])
      .then(([tRes, pRes]) => {
        setTasks(tRes.tasks ?? []);
        setProjects(pRes.projects ?? []);
      })
      .catch(err => show(err.message || "Error cargando las tareas", "error"))
      .finally(() => setLoading(false));
  }, []);

  function switchView(v) {
    setView(v);
    localStorage.setItem("ocho_tasks_view", v);
  }

  async function fetchTasks() {
    const res = await apiFetch("/api/user/tasks");
    setTasks(res.tasks ?? []);
  }

  async function handleSuccess() {
    setAdding(false);
    setEditingTask(null);
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
    show("Tarea guardada", "success");
  }

  async function moveTask(taskId, toStatus) {
    const id   = String(taskId);
    const orig = tasks.find(t => String(t.nocodb_id ?? t.id) === id);
    if (!orig || orig.status === toStatus) return;

    setTasks(prev => prev.map(t =>
      String(t.nocodb_id ?? t.id) === id ? { ...t, status: toStatus } : t
    ));

    try {
      await apiFetch(`/api/user/tasks/${id}/status`, {
        method: "PATCH",
        body:   JSON.stringify({ status: toStatus }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t =>
        String(t.nocodb_id ?? t.id) === id ? { ...t, status: orig.status } : t
      ));
      show(err.message || "No se pudo actualizar la tarea", "error");
    }
  }

  function cycleStatus(task) {
    const next = NEXT_STATUS[task.status] ?? "pending";
    moveTask(task.nocodb_id ?? task.id, next);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    try {
      await apiFetch(`/api/admin/tasks/${deletingId}`, { method: "DELETE" });
      setTasks(prev => prev.filter(t => (t.nocodb_id ?? t.id) !== deletingId));
      show("Tarea eliminada", "success");
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Filtered tasks ────────────────────────────────────────
  let visible = tasks;
  if (filterProject)       visible = visible.filter(t => String(t.project_id) === filterProject);
  if (filterPhase)         visible = visible.filter(t => t.phase === filterPhase);
  if (filterStatus !== "all") visible = visible.filter(t => t.status === filterStatus);

  // ── Counters ──────────────────────────────────────────────
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const overdueCount    = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.status !== "done"
  ).length;

  const showForm = adding || Boolean(editingTask);

  const userUuid = user?.uuid ?? user?.sub ?? null;

  const commonCardProps = {
    onStatusChange: cycleStatus,
    // Todos pueden editar sus propias tareas; admin puede editar cualquiera
    onEdit: task => {
      if (isAdmin || task.assigned_to === userUuid) setEditingTask(task);
    },
    onDelete: isAdmin ? taskId => setDeletingId(taskId) : null,
  };

  // ── Loading skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div className="tasks-view">
        <div className="skeleton-block" style={{ height: "1.5rem", width: "8rem", marginBottom: "0.5rem" }} />
        <div className="skeleton-block" style={{ height: "0.8rem", width: "14rem", marginBottom: "1.5rem" }} />
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {[0,1,2].map(i => <div key={i} className="skeleton-block" style={{ height: "2rem", width: "7rem", borderRadius: 8 }} />)}
        </div>
        {[0,1,2,3].map(i => (
          <div key={i} className="skeleton-block" style={{ height: "5.5rem", borderRadius: 10, marginBottom: "0.5rem" }} />
        ))}
      </div>
    );
  }

  return (
    <div className={`tasks-view${view === "kanban" ? " kanban-mode" : ""}`}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="view-header">
        <div className="task-bar">
          <div className="task-bar-left">
            <h1 className="view-title">Tareas</h1>
            <p className="view-sub">
              {refreshing ? "Actualizando…" : (
                <>
                  {tasks.length} {tasks.length === 1 ? "tarea" : "tareas"}
                  {inProgressCount > 0 && ` · ${inProgressCount} en curso`}
                  {overdueCount > 0 && (
                    <span className="task-bar-overdue"> · {overdueCount} vencida{overdueCount !== 1 ? "s" : ""}</span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="task-bar-right">
            <div className="task-view-toggle">
              <button
                className={`task-view-btn${view === "list" ? " active" : ""}`}
                onClick={() => switchView("list")}
                title="Vista lista"
              >
                ≡ Lista
              </button>
              <button
                className={`task-view-btn${view === "kanban" ? " active" : ""}`}
                onClick={() => switchView("kanban")}
                title="Vista Kanban"
              >
                ⠿ Kanban
              </button>
            </div>

            {!showForm && (
              <button className="projects-add-btn" onClick={() => setAdding(true)}>
                + Nueva
              </button>
            )}
            {isAdmin && !showForm && (
              <button className="ai-gen-trigger-btn" onClick={() => setAiOpen(true)}
                title="Generar tareas con IA">
                ✦ IA
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Form modal (create / edit) ──────────────────────── */}
      {showForm && (
        <TaskForm
          projects={projects}
          initial={editingTask || {}}
          isAdmin={isAdmin}
          userUuid={userUuid}
          onSuccess={handleSuccess}
          onClose={() => { setAdding(false); setEditingTask(null); }}
        />
      )}

      {aiOpen && (
        <AiGenerator
          projects={projects}
          show={show}
          onCreated={async () => {
            setAiOpen(false);
            setRefreshing(true);
            await fetchTasks();
            setRefreshing(false);
          }}
          onClose={() => setAiOpen(false)}
        />
      )}

      {/* ── Confirm delete ──────────────────────────────────── */}
      {deletingId && (
        <div className="task-confirm-bar">
          <span className="task-confirm-text">¿Eliminar esta tarea? Esta acción no se puede deshacer.</span>
          <div className="task-confirm-actions">
            <button className="task-confirm-yes" onClick={confirmDelete}>Eliminar</button>
            <button className="task-confirm-no"  onClick={() => setDeletingId(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div className="task-filter-bar">
        <div className="task-filter-selects">
          {projects.length > 0 && (
            <select
              className="task-filter-select"
              value={filterProject}
              onChange={e => { setFilterProject(e.target.value); setFilterPhase(""); }}
            >
              <option value="">Todos los proyectos</option>
              {projects.map(p => (
                <option key={p.nocodb_id ?? p.id} value={p.nocodb_id ?? p.id}>{p.title}</option>
              ))}
            </select>
          )}

          <select
            className="task-filter-select"
            value={filterPhase}
            onChange={e => setFilterPhase(e.target.value)}
          >
            <option value="">Todas las fases</option>
            {PHASE_ORDER.map(ph => (
              <option key={ph} value={ph}>{PHASE_LABEL[ph]}</option>
            ))}
          </select>
        </div>

        <div className="task-filters">
          {["all", "pending", "in_progress", "done"].map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`task-filter-btn${filterStatus === f ? " active" : ""}`}
            >
              {STATUS_FILTER_LABEL[f]}
              {f !== "all" && (
                <span className="task-filter-count">
                  {tasks.filter(t => t.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── LIST VIEW ──────────────────────────────────────── */}
      {view === "list" && (
        visible.length === 0 ? (
          <div className="tasks-empty">
            <p className="view-empty">
              {filterProject || filterPhase || filterStatus !== "all"
                ? "Sin tareas con esos filtros."
                : "Todavía no tenés tareas asignadas."}
            </p>
            {(filterProject || filterPhase || filterStatus !== "all") && (
              <button
                className="tasks-empty-clear"
                onClick={() => { setFilterProject(""); setFilterPhase(""); setFilterStatus("all"); }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="task-list-v2">
            {visible.map(task => (
              <TaskCard
                key={task.nocodb_id ?? task.id}
                task={task}
                projectName={projectMap[String(task.project_id)]?.title ?? null}
                compact={false}
                {...commonCardProps}
              />
            ))}
          </div>
        )
      )}

      {/* ── KANBAN VIEW ────────────────────────────────────── */}
      {view === "kanban" && (
        <div className="kanban-board">
          {KANBAN_COLS.map(col => (
            <KanbanColumn
              key={col.status}
              col={col}
              tasks={visible.filter(t => t.status === col.status)}
              projectMap={projectMap}
              onMoveTask={(taskId, toStatus) => moveTask(taskId, toStatus)}
              onQuickAdd={isAdmin && !showForm ? () => setAdding(true) : null}
              {...commonCardProps}
            />
          ))}
        </div>
      )}

    </div>
  );
}
