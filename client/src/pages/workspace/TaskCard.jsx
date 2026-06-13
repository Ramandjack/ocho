import { useState } from "react";

const STATUS_LABEL = {
  pending:     "pendiente",
  in_progress: "en curso",
  done:        "completado",
};

const STATUS_ICON = {
  pending:     "○",
  in_progress: "◑",
  done:        "●",
};

const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" };

const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d    = new Date(dateStr);
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - now) / 86400000);
  const formatted = new Date(dateStr).toLocaleDateString("es-AR", {
    day: "numeric", month: "short",
  });
  return { formatted, overdue: diff < 0, today: diff === 0 };
}

export default function TaskCard({
  task,
  projectName,
  compact   = false,
  onStatusChange,
  onEdit,
  onDelete,
  draggable = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const due         = formatDue(task.due_date);
  const phaseLabel  = PHASE_LABEL[task.phase] || null;
  const metaParts   = [projectName, phaseLabel].filter(Boolean);
  const isDone      = task.status === "done";
  const isHighPrio  = task.priority === "high";
  const showMenu    = onEdit || onDelete;

  return (
    <div
      className={`tc-card${compact ? " compact" : ""}${isDone ? " tc-done" : ""}`}
      draggable={draggable}
      onDragStart={e => {
        if (draggable) {
          e.dataTransfer.setData("taskId", String(task.nocodb_id ?? task.id));
          e.dataTransfer.effectAllowed = "move";
        }
      }}
    >
      {/* ── Row 1: status · meta · priority · due ─────────── */}
      <div className="tc-top">
        <button
          className={`tc-status-pill ${task.status ?? "pending"}`}
          onClick={() => onStatusChange?.(task)}
          title="Click para cambiar estado"
        >
          <span aria-hidden="true">{STATUS_ICON[task.status] ?? "○"}</span>
          {" "}{STATUS_LABEL[task.status] ?? task.status}
        </button>

        {metaParts.length > 0 && (
          <span className="tc-meta">{metaParts.join(" › ")}</span>
        )}

        <div className="tc-top-right">
          {isHighPrio && (
            <span className="tc-prio high">Alta</span>
          )}
          {due && (
            <span className={`tc-due${due.overdue ? " overdue" : due.today ? " today" : ""}`}>
              {due.today ? "hoy" : due.formatted}
            </span>
          )}
        </div>
      </div>

      {/* ── Title ─────────────────────────────────────────── */}
      <p className="tc-title">{task.title}</p>

      {/* ── Description (list mode only) ─────────────────── */}
      {!compact && task.description && (
        <p className="tc-desc">{task.description}</p>
      )}

      {/* ── Footer: label · menu ──────────────────────────── */}
      {(task.label || showMenu) && (
        <div className="tc-footer">
          <div className="tc-footer-left">
            {task.label && <span className="tc-label">{task.label}</span>}
          </div>

          {showMenu && (
            <div className="tc-menu-wrap">
              <button
                className="tc-menu-btn"
                type="button"
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                aria-label="Opciones"
              >
                ···
              </button>
              {menuOpen && (
                <div className="tc-menu-dropdown" role="menu">
                  {onEdit && (
                    <button
                      className="tc-menu-item"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); onEdit(task); }}
                    >
                      Editar
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="tc-menu-item danger"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); onDelete(task.nocodb_id ?? task.id); }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
