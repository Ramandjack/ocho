import { computeProjectProgress } from "../../lib/projectProgress.js";

const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

export default function ProjectContextBar({ project, projectTasks }) {
  if (!project) return null;

  const progress = computeProjectProgress(project, projectTasks);
  const phaseLabel = PHASE_LABEL[project.current_phase] || "Sin fase asignada";

  return (
    <div className="context-bar">
      <b>{project.title}</b>
      <span className="sep">›</span>
      <span>Fase: <b>{phaseLabel}</b></span>
      <span className="sep">›</span>
      <span>Progreso: <b className="context-bar-pct">{progress}%</b></span>
    </div>
  );
}
