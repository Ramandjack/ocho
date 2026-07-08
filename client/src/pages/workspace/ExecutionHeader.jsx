import { computeProjectProgress } from "../../lib/projectProgress.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default function ExecutionHeader({ user, dashboard, selectedProject, selectedProjectTasks }) {
  const firstName = user?.first_name || user?.full_name?.split(" ")[0] || "";
  const d = dashboard || {};

  const chips = [
    d.overdue_count   > 0 && { key: "overdue", tone: "crit", text: `${d.overdue_count} vencida${d.overdue_count !== 1 ? "s" : ""}` },
    d.urgent_count    > 0 && { key: "urgent",  tone: "crit", text: `${d.urgent_count} urgente${d.urgent_count !== 1 ? "s" : ""}` },
    d.tasks_in_progress > 0 && { key: "prog",  tone: "",     text: `${d.tasks_in_progress} en curso` },
    d.due_today_count > 0 && { key: "today",   tone: "warn", text: `${d.due_today_count} vence${d.due_today_count !== 1 ? "n" : ""} hoy` },
    d.blocked_count   > 0 && { key: "blocked", tone: "crit", text: `${d.blocked_count} bloqueada${d.blocked_count !== 1 ? "s" : ""}` },
  ].filter(Boolean);

  // Si el usuario filtró la vista a un proyecto puntual, ese manda por sobre el
  // "más activo" global — evita que la tarjeta quede "pegada" al proyecto que
  // el dashboard calculó al cargar, ignorando la selección del usuario.
  const proj = selectedProject
    ? {
        title: selectedProject.title,
        current_phase: selectedProject.current_phase || null,
        overall_progress_pct: computeProjectProgress(selectedProject, selectedProjectTasks),
      }
    : d.most_active_project;
  const projLabel = selectedProject ? "Proyecto seleccionado" : "Proyecto más activo";

  return (
    <section className="exec-header">
      <div className="exec-greet">
        <p className="exec-eyebrow">{greeting()}{firstName ? `, ${firstName}` : ""}.</p>
        <h2 className="exec-headline">
          {chips.length
            ? `Hoy tenés ${chips.length} cosa${chips.length !== 1 ? "s" : ""} que mueve${chips.length !== 1 ? "n" : ""} el proyecto.`
            : "Todo al día. Sin urgencias por ahora."}
        </h2>
        {chips.length > 0 && (
          <div className="exec-chips">
            {chips.map(c => (
              <span key={c.key} className={`exec-chip${c.tone ? ` ${c.tone}` : ""}`}>
                <span className="exec-chip-dot" />{c.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {proj && (
        <div className="exec-cards">
          <div className="exec-card">
            <p className="exec-card-label">{projLabel}</p>
            <p className="exec-card-value">{proj.title}</p>
            {proj.current_phase && <p className="exec-card-sub">Fase actual: {proj.current_phase}</p>}
          </div>
          <div className="exec-card">
            <p className="exec-card-label">Progreso de ejecución</p>
            <p className="exec-card-value exec-card-pct">{proj.overall_progress_pct}%</p>
            <div className="canvas-progress">
              <div className="canvas-progress-track">
                <div className="canvas-progress-fill" style={{ width: `${proj.overall_progress_pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
