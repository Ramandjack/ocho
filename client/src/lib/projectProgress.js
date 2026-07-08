const VALID_PHASES = ["discovery", "brief", "design", "development", "testing", "launch"];

// Mismo cálculo que computeProjectProgress en services/taskEngine.service.js —
// se recalcula en el cliente porque acá se puede estar mirando CUALQUIER proyecto
// (el filtrado por el usuario), no sólo el "más activo" que ya trae calculado el dashboard.
export function computeProjectProgress(project, projectTasks) {
  const idx = VALID_PHASES.indexOf(project?.current_phase);
  const phaseIdx = idx === -1 ? 0 : idx;
  const inPhase = (projectTasks || []).filter(t => t.phase === project?.current_phase);
  const done = inPhase.filter(t => t.status === "done");
  const phaseFraction = inPhase.length ? done.length / inPhase.length : 0;
  return Math.min(100, Math.max(0, Math.round(((phaseIdx + phaseFraction) / VALID_PHASES.length) * 100)));
}
