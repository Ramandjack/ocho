/**
 * taskEngine.service.js — Sprint C: bloqueos, dependencias, progreso y "siguiente acción".
 * Funciones puras: reciben datos ya cargados de NocoDB, no hacen fetch propio.
 * Compartido entre tasks.routes.js y dashboard.routes.js para no duplicar la lógica.
 */

const VALID_PHASES = ["discovery", "brief", "design", "development", "testing", "launch"];
const PRIORITY_WEIGHT = { high: 100, medium: 50, low: 10 };

function taskKey(t) {
  return Number(t.id ?? t.nocodb_id);
}

function parseDependsOn(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter(n => !Number.isNaN(n));
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(n => !Number.isNaN(n)) : [];
  } catch {
    return [];
  }
}

function parseLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** ¿Agregar candidateId como dependencia de taskId crearía un ciclo? */
function wouldCreateCycle(taskId, candidateId, tasksById) {
  const seen = new Set();
  const stack = [candidateId];
  while (stack.length) {
    const current = stack.pop();
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const t = tasksById.get(current);
    if (!t) continue;
    for (const dep of parseDependsOn(t.depends_on)) stack.push(dep);
  }
  return false;
}

/**
 * Sanitiza depends_on para una tarea NUEVA (todavía no tiene id, no puede haber ciclos).
 * Sólo valida existencia.
 */
function sanitizeDependsOnForCreate(rawIds, tasksById) {
  if (!Array.isArray(rawIds)) return [];
  return [...new Set(rawIds.map(Number).filter(n => !Number.isNaN(n)))]
    .filter(id => tasksById.has(id));
}

/**
 * Sanitiza depends_on para una tarea EXISTENTE: descarta ids inexistentes, self-reference
 * y candidatos que crearían un ciclo. Devuelve advertencias (no bloqueantes) si alguna
 * dependencia pertenece a una fase posterior a la de la tarea.
 */
function sanitizeDependsOn(taskId, rawIds, tasksById) {
  const id = Number(taskId);
  if (!Array.isArray(rawIds)) return { clean: [], warnings: [] };

  const candidates = [...new Set(rawIds.map(Number).filter(n => !Number.isNaN(n) && n !== id))];
  const clean = [];
  const warnings = [];
  const task = tasksById.get(id);
  const taskPhaseIdx = VALID_PHASES.indexOf(task?.phase);

  for (const candidateId of candidates) {
    const dep = tasksById.get(candidateId);
    if (!dep) continue; // no existe
    if (wouldCreateCycle(id, candidateId, tasksById)) continue; // crearía ciclo

    clean.push(candidateId);
    const depPhaseIdx = VALID_PHASES.indexOf(dep.phase);
    if (taskPhaseIdx !== -1 && depPhaseIdx !== -1 && depPhaseIdx > taskPhaseIdx) {
      warnings.push(`"${dep.title}" es de una fase posterior (${dep.phase}) — revisá el orden de las fases.`);
    }
  }
  return { clean, warnings };
}

function sanitizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(l => l && typeof l === "object")
    .map(l => ({
      label: String(l.label || "").trim().slice(0, 60),
      url: String(l.url || "").trim().slice(0, 500),
    }))
    .filter(l => l.label && /^https?:\/\//i.test(l.url))
    .slice(0, 10);
}

function sanitizeEstimatedHours(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 4) / 4; // redondea a cuartos de hora
}

/**
 * Enriquece cada tarea con is_blocked, blocked_reason y unlocks[].
 * IMPORTANTE: `tasks` debe ser el set COMPLETO (no filtrado por usuario/proyecto),
 * porque una dependencia puede pertenecer a otra persona o a otro proyecto.
 */
function computeDependencyInfo(tasks) {
  const tasksById = new Map(tasks.map(t => [taskKey(t), t]));

  const dependents = new Map(); // id de tarea -> [{id, title}] de quienes dependen de ella
  for (const t of tasks) {
    for (const depId of parseDependsOn(t.depends_on)) {
      if (!dependents.has(depId)) dependents.set(depId, []);
      dependents.get(depId).push({ id: taskKey(t), title: t.title });
    }
  }

  return tasks.map(t => {
    const id = taskKey(t);
    const depIds = parseDependsOn(t.depends_on);
    const resolvedDeps = depIds
      .map(depId => {
        const dep = tasksById.get(depId);
        return dep ? { id: depId, title: dep.title, status: dep.status } : null;
      })
      .filter(Boolean);
    const pendingDeps = resolvedDeps.filter(dep => dep.status !== "done");

    return {
      ...t,
      depends_on: depIds,
      dependencies: resolvedDeps, // depends_on resuelto a {id, title, status} — para mostrar en UI sin fetch extra
      links: parseLinks(t.links),
      is_blocked: pendingDeps.length > 0,
      blocked_reason: pendingDeps.length
        ? `Esperando: "${pendingDeps[0].title}"${pendingDeps.length > 1 ? ` (+${pendingDeps.length - 1} más)` : ""}`
        : null,
      unlocks: dependents.get(id) || [],
    };
  });
}

/**
 * Ranking determinístico de "siguiente acción": excluye completadas, bloqueadas
 * y las que esperan feedback del cliente (nada que el asignado pueda "empezar" ahí),
 * prioriza vencidas > vencen hoy > alta prioridad > cuánto desbloquean.
 */
function rankNextAction(tasks) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const candidates = tasks.filter(t => t.status !== "done" && t.status !== "waiting_client" && !t.is_blocked);
  if (!candidates.length) return null;

  function score(t) {
    let s = PRIORITY_WEIGHT[t.priority] || 0;
    if (t.due_date) {
      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due - now) / 86400000);
      if (diffDays < 0) s += 1000;
      else if (diffDays === 0) s += 500;
      else if (diffDays <= 2) s += 150;
    }
    s += (t.unlocks?.length || 0) * 20;
    return s;
  }

  return candidates
    .map(t => ({ t, s: score(t) }))
    .sort((a, b) => b.s - a.s || new Date(a.t.due_date || "9999-12-31") - new Date(b.t.due_date || "9999-12-31"))[0].t;
}

/**
 * Progreso de ejecución de un proyecto (distinto de project_score/score_total, que mide
 * viabilidad de negocio, no avance). Combina fases ya superadas + fracción completada
 * de la fase actual.
 */
function computeProjectProgress(project, projectTasks) {
  const totalPhases = VALID_PHASES.length;
  const phaseIdx = VALID_PHASES.indexOf(project.current_phase);
  const idx = phaseIdx === -1 ? 0 : phaseIdx;

  const inPhase = projectTasks.filter(t => t.phase === project.current_phase);
  const doneInPhase = inPhase.filter(t => t.status === "done");
  const phaseFraction = inPhase.length ? doneInPhase.length / inPhase.length : 0;

  const overall = Math.round(((idx + phaseFraction) / totalPhases) * 100);
  return {
    phase_progress_pct: Math.round(phaseFraction * 100),
    overall_progress_pct: Math.min(100, Math.max(0, overall)),
  };
}

export {
  VALID_PHASES,
  parseDependsOn,
  parseLinks,
  sanitizeDependsOnForCreate,
  sanitizeDependsOn,
  sanitizeLinks,
  sanitizeEstimatedHours,
  computeDependencyInfo,
  rankNextAction,
  computeProjectProgress,
};
