import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import {
  VALID_PHASES,
  sanitizeDependsOnForCreate,
  sanitizeDependsOn,
  sanitizeLinks,
  sanitizeEstimatedHours,
  computeDependencyInfo,
  rankNextAction,
} from "../services/taskEngine.service.js";
import { callClaude, parseJsonFromClaude } from "../services/claude.service.js";

const router = express.Router();

/* ── Constants ──────────────────────────────────────────────── */

// "waiting_client": el equipo terminó su parte y espera respuesta/feedback del cliente.
const VALID_STATUSES = ["pending", "in_progress", "waiting_client", "done"];
const VALID_LABELS   = ["ux", "research", "dev", "qa", "design-system", "docs", "ops"];
const VALID_PRIOS    = ["low", "medium", "high"];

const PHASE_LABEL = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

/* ── AI helpers ─────────────────────────────────────────────── */

const taskAiLimiter = rateLimit({
  windowMs:      15 * 60_000,
  max:           10,
  keyGenerator:  req => req.user?.sub || ipKeyGenerator(req.ip),
  message:       { success: false, message: "Demasiadas generaciones IA. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders:   false,
});

const coachLimiter = rateLimit({
  windowMs:      15 * 60_000,
  max:           10,
  keyGenerator:  req => req.user?.sub || ipKeyGenerator(req.ip),
  message:       { success: false, message: "Demasiadas consultas al coach. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// El Coach prioriza tareas que YA EXISTEN — no genera tareas nuevas (eso lo hace AI_SYSTEM/AI_PROMPT más abajo).
const COACH_SYSTEM = `Sos un Product Manager senior actuando como coach de ejecución diario para un equipo de producto digital en OCHO Studio.
Tu trabajo es priorizar tareas que YA EXISTEN, nunca inventar tareas nuevas ni ids que no te pasaron.
Respondés ÚNICAMENTE con un array JSON válido. Sin texto extra, sin markdown, sin explicaciones fuera del JSON.
Cada elemento tiene exactamente estos campos:
- task_id: number (uno de los ids recibidos, tal cual, sin inventar)
- reason: string, máx 140 caracteres, por qué esta tarea importa HOY (vencimiento, qué bloqueo resuelve)
- impact: string, máx 100 caracteres, qué desbloquea o cuánto acerca al lanzamiento del proyecto`;

function buildCoachPrompt(tasks, projects) {
  const projectMap = Object.fromEntries(projects.map(p => [String(p.id ?? p.nocodb_id), p]));
  const lines = tasks.map(t => {
    const id   = t.id ?? t.nocodb_id;
    const proj = projectMap[String(t.project_id)];
    return `- id:${id} | "${t.title}" | proyecto:${proj?.title || "sin proyecto"} (fase actual del proyecto: ${proj?.current_phase || "sin fase"}) | fase de la tarea:${t.phase || "—"} | prioridad:${t.priority} | vence:${t.due_date || "sin fecha"} | desbloquea:${t.unlocks?.length || 0} tarea(s) más`;
  }).join("\n");
  return `Estas son las tareas activas (no completadas, no bloqueadas) de la persona hoy:\n\n${lines}\n\nElegí como máximo 5, ordenadas por importancia real (no sólo por fecha de vencimiento), pensando en qué acerca más al lanzamiento del proyecto.`;
}

const AI_SYSTEM = `Sos un Project Manager senior generando tareas concretas y ejecutables para un equipo de producto digital en OCHO Studio.
Respondés ÚNICAMENTE con un array JSON válido de tareas. Sin texto extra, sin markdown, sin explicaciones.
Cada tarea tiene exactamente estos campos:
- title: string, máx 80 caracteres, accionable (verbo en infinitivo al inicio)
- description: string, máx 180 caracteres, criterios de aceptación o contexto mínimo
- priority: "high" | "medium" | "low"
- label: "ux" | "research" | "dev" | "qa" | "design-system" | "docs" | "ops"`;

const AI_PROMPT = {
  discovery:   (p, q) => `Generá ${p.count} tareas de Discovery para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: investigación de usuarios, benchmarks, validación de problema, mapas de empatía.`,
  brief:       (p, q) => `Generá ${p.count} tareas de Brief/Definición para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: user stories, criterios de aceptación, alcance MVP, backlog inicial.`,
  design:      (p, q) => `Generá ${p.count} tareas de Diseño UX/UI para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: wireframes, sistema de componentes, flujos de usuario, validación de UX.`,
  development: (p, q) => `Generá ${p.count} tareas de Desarrollo para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: setup técnico, features del MVP, integraciones, revisiones de código, deploy.`,
  testing:     (p, q) => `Generá ${p.count} tareas de Testing/QA para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: casos de prueba, testing funcional, performance, seguridad, regresión.`,
  launch:      (p, q) => `Generá ${p.count} tareas de Lanzamiento para el proyecto "${p.title}" (tipo: ${p.type}).${q ? `\nRespuestas del cliente:\n${q}` : ""}\nFoco: comunicación, onboarding de usuarios, métricas de éxito, monitoreo post-launch.`,
};

/* ── Helpers ────────────────────────────────────────────────── */

// IMPORTANTE: `tasks` debe ser siempre el set COMPLETO (no filtrado por usuario) para
// que computeDependencyInfo calcule bien el grafo de dependencias/desbloqueos, aunque
// el prerequisito pertenezca a otra persona. Filtrar por usuario recién después de esto.
function enrichTasks(tasks, projects) {
  const projectMap = Object.fromEntries(
    projects.map(p => [String(p.id ?? p.nocodb_id), p])
  );
  const withDeps = computeDependencyInfo(tasks);
  return withDeps.map(t => ({
    ...t,
    project_title:         projectMap[String(t.project_id)]?.title         || null,
    project_current_phase: projectMap[String(t.project_id)]?.current_phase || null,
  }));
}

async function assertProjectAccess(userUuid, projectId) {
  if (!projectId) return true;
  const links = await db.getAll("user_projects");
  return links.some(
    r => r.user_uuid === userUuid && Number(r.project_id) === Number(projectId)
  );
}

/* ═══════════════════════════════════════
   ADMIN ROUTES
═══════════════════════════════════════ */

// GET /api/admin/tasks
router.get("/admin/tasks", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const [tasks, projects] = await Promise.all([
      db.getAll("tasks"),
      db.getAll("projects"),
    ]);
    return res.json({ success: true, tasks: enrichTasks(tasks, projects) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/tasks — crear tarea individual
router.post("/admin/tasks", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, description, status, priority, project_id, assigned_to, due_date, phase, label, order, estimated_hours, depends_on, links } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: "Título obligatorio" });

    const existingTasks = await db.getAll("tasks");
    const tasksById = new Map(existingTasks.map(t => [Number(t.id ?? t.nocodb_id), t]));

    const task = await db.insert("tasks", {
      title:       String(title).trim(),
      description: String(description || "").trim(),
      status:      status   || "pending",
      priority:    VALID_PRIOS.includes(priority)  ? priority  : "medium",
      project_id:  project_id ? Number(project_id) : null,
      assigned_to: assigned_to || null,
      due_date:    due_date    || null,
      phase:       VALID_PHASES.includes(phase) ? phase : null,
      label:       VALID_LABELS.includes(label) ? label : null,
      order:       Number(order) || 0,
      estimated_hours: sanitizeEstimatedHours(estimated_hours),
      depends_on:      JSON.stringify(sanitizeDependsOnForCreate(depends_on, tasksById)),
      links:           JSON.stringify(sanitizeLinks(links)),
    });

    if (assigned_to) {
      await db.sendNotification(
        assigned_to, "task",
        "Nueva tarea asignada",
        `Se te asignó: "${title}"`,
        "/app/panel/tasks"
      );
    }
    await db.logActivity(req.user.sub, "create", "task", task.id, `Tarea: "${title}"`);

    return res.status(201).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/tasks/bulk — crear múltiples tareas (desde IA preview)
router.post("/admin/tasks/bulk", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { tasks: items, project_id, assigned_to, phase } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: "Se requiere un array de tareas" });
    }
    if (items.length > 20) {
      return res.status(400).json({ success: false, message: "Máximo 20 tareas por lote" });
    }

    const created = [];
    for (const item of items) {
      if (!item.title?.trim()) continue;
      const task = await db.insert("tasks", {
        title:       String(item.title).trim(),
        description: String(item.description || "").trim(),
        status:      "pending",
        priority:    VALID_PRIOS.includes(item.priority)  ? item.priority  : "medium",
        label:       VALID_LABELS.includes(item.label)    ? item.label     : null,
        project_id:  project_id ? Number(project_id) : null,
        assigned_to: assigned_to || null,
        phase:       VALID_PHASES.includes(phase) ? phase : (VALID_PHASES.includes(item.phase) ? item.phase : null),
        due_date:    null,
        order:       0,
      });
      created.push(task);
    }

    if (assigned_to && created.length) {
      await db.sendNotification(
        assigned_to, "task",
        `${created.length} nuevas tareas asignadas`,
        `Se generaron tareas para la fase ${phase ? PHASE_LABEL[phase] : "del proyecto"}`,
        "/app/panel/tasks"
      );
    }
    await db.logActivity(
      req.user.sub, "bulk_create", "task", project_id || "—",
      `${created.length} tareas creadas para fase: ${phase || "—"}`
    );

    return res.status(201).json({ success: true, created, count: created.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/tasks/:id
router.patch("/admin/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigned_to, due_date, phase, label, order, estimated_hours, depends_on, links } = req.body || {};

    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status      !== undefined && VALID_STATUSES.includes(status)) fields.status = status;
    if (priority    !== undefined && VALID_PRIOS.includes(priority))  fields.priority = priority;
    if (assigned_to !== undefined) fields.assigned_to = assigned_to;
    if (due_date    !== undefined) fields.due_date    = due_date || null;
    if (phase       !== undefined) fields.phase       = VALID_PHASES.includes(phase) ? phase : null;
    if (label       !== undefined) fields.label       = VALID_LABELS.includes(label) ? label : null;
    if (order       !== undefined) fields.order       = Number(order) || 0;
    if (estimated_hours !== undefined) fields.estimated_hours = sanitizeEstimatedHours(estimated_hours);
    if (links       !== undefined) fields.links       = JSON.stringify(sanitizeLinks(links));

    let dependencyWarnings = [];
    if (depends_on !== undefined) {
      const existingTasks = await db.getAll("tasks");
      const tasksById = new Map(existingTasks.map(t => [Number(t.id ?? t.nocodb_id), t]));
      const { clean, warnings } = sanitizeDependsOn(id, depends_on, tasksById);
      fields.depends_on = JSON.stringify(clean);
      dependencyWarnings = warnings;
    }

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    const updated = await db.update("tasks", id, fields);

    if (fields.assigned_to) {
      await db.sendNotification(
        fields.assigned_to, "task",
        "Tarea actualizada",
        `La tarea cambió: ${fields.status ? `estado → ${fields.status}` : "actualización general"}`,
        "/app/panel/tasks"
      );
    }
    await db.logActivity(req.user.sub, "update", "task", id, `Campos: ${JSON.stringify(fields)}`);

    return res.json({ success: true, task: updated, dependency_warnings: dependencyWarnings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/tasks/:id
router.delete("/admin/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.remove("tasks", id);
    await db.logActivity(req.user.sub, "delete", "task", id, "Tarea eliminada");
    return res.json({ success: true, message: "Tarea eliminada" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/projects/:id/tasks/ai — generar tareas con IA para una fase
router.post("/admin/projects/:id/tasks/ai", authMiddleware, requireAdmin, taskAiLimiter, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { phase, count = 6 } = req.body || {};

    if (!VALID_PHASES.includes(phase)) {
      return res.status(400).json({ success: false, message: "Fase inválida" });
    }

    const clampedCount = Math.min(10, Math.max(3, Number(count) || 6));

    // Obtener proyecto y cuestionario de la fase
    const [projects, allPhases] = await Promise.all([
      db.getAll("projects"),
      db.getAll("project_phases"),
    ]);

    const project = projects.find(p => String(p.id ?? p.nocodb_id) === String(projectId));
    if (!project) return res.status(404).json({ success: false, message: "Proyecto no encontrado" });

    const phaseRow = allPhases.find(
      r => Number(r.project_id) === Number(projectId) && r.phase === phase
    );

    // Formatear cuestionario para el prompt
    let questionnaireText = null;
    if (phaseRow?.questionnaire) {
      try {
        const q = JSON.parse(phaseRow.questionnaire);
        const entries = Object.entries(q).filter(([, v]) => String(v || "").trim().length > 5);
        if (entries.length) {
          questionnaireText = entries
            .map(([k, v]) => `- ${k}: ${String(v).slice(0, 300)}`)
            .join("\n");
        }
      } catch { /* ignorar si no es JSON válido */ }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        success: false,
        message: "La integración IA no está configurada. Configurá ANTHROPIC_API_KEY en Render.",
      });
    }

    const promptFn = AI_PROMPT[phase];
    if (!promptFn) return res.status(400).json({ success: false, message: "Fase sin prompt configurado" });

    const rawText = await callClaude(
      AI_SYSTEM,
      promptFn({ title: project.title, type: project.type || "digital", count: clampedCount }, questionnaireText),
      { maxTokens: 900 }
    );

    let suggestions;
    try {
      suggestions = parseJsonFromClaude(rawText);
    } catch {
      return res.status(502).json({
        success: false,
        message: "La IA devolvió una respuesta que no pudo parsearse. Intentá de nuevo.",
      });
    }

    if (!Array.isArray(suggestions)) {
      return res.status(502).json({ success: false, message: "Formato de respuesta IA inesperado" });
    }

    // Sanitizar y limitar
    const tasks = suggestions.slice(0, 10).map(t => ({
      title:       String(t.title || "").trim().slice(0, 80),
      description: String(t.description || "").trim().slice(0, 200),
      priority:    VALID_PRIOS.includes(t.priority)  ? t.priority  : "medium",
      label:       VALID_LABELS.includes(t.label)    ? t.label     : null,
    })).filter(t => t.title);

    await db.logActivity(
      req.user.sub, "ai_generate_tasks", "project", projectId,
      `IA generó ${tasks.length} tareas para fase: ${phase}`
    );

    return res.json({ success: true, tasks, phase, project_id: projectId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════
   USER ROUTES
═══════════════════════════════════════ */

// GET /api/user/tasks — tareas asignadas al usuario, enriquecidas con proyecto
router.get("/user/tasks", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;
    const [allTasks, projects] = await Promise.all([
      db.getAll("tasks"),
      db.getAll("projects"),
    ]);
    // Enriquecer con el set completo (grafo de dependencias correcto) y recién
    // después filtrar por usuario.
    const enriched = enrichTasks(allTasks, projects);
    const tasks = enriched.filter(t => t.assigned_to === uuid);
    return res.json({ success: true, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/tasks/next-action — la única tarea que el usuario debería hacer ahora
router.get("/user/tasks/next-action", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;
    const [allTasks, projects] = await Promise.all([
      db.getAll("tasks"),
      db.getAll("projects"),
    ]);
    const enriched = enrichTasks(allTasks, projects);
    const mine = enriched.filter(t => t.assigned_to === uuid);
    const task = rankNextAction(mine);
    return res.json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/tasks/coach — Product Coach: prioriza tareas EXISTENTES con IA
// (a diferencia del generador de arriba, que crea tareas nuevas). Disponible para
// cualquier rol — cada quien recibe el plan de SUS propias tareas.
router.post("/user/tasks/coach", authMiddleware, coachLimiter, async (req, res) => {
  try {
    const uuid = req.user.sub;
    const [allTasks, projects] = await Promise.all([
      db.getAll("tasks"),
      db.getAll("projects"),
    ]);
    const enriched = enrichTasks(allTasks, projects);
    const candidates = enriched.filter(t => t.assigned_to === uuid && t.status !== "done" && t.status !== "waiting_client" && !t.is_blocked);

    if (!candidates.length) {
      return res.json({
        success: true,
        recommendations: [],
        message: "No hay tareas activas para priorizar — todo al día.",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        success: false,
        message: "La integración IA no está configurada. Configurá ANTHROPIC_API_KEY en Render.",
      });
    }

    const rawText = await callClaude(
      COACH_SYSTEM,
      buildCoachPrompt(candidates, projects),
      { maxTokens: 600 }
    );

    let ranked;
    try {
      ranked = parseJsonFromClaude(rawText);
    } catch {
      return res.status(502).json({
        success: false,
        message: "La IA devolvió una respuesta que no pudo parsearse. Intentá de nuevo.",
      });
    }
    if (!Array.isArray(ranked)) {
      return res.status(502).json({ success: false, message: "Formato de respuesta IA inesperado" });
    }

    // Sólo se aceptan ids que realmente pasamos — evita que la IA "invente" una tarea.
    const byId = new Map(candidates.map(t => [Number(t.id ?? t.nocodb_id), t]));
    const recommendations = ranked
      .map(r => {
        const task = byId.get(Number(r.task_id));
        if (!task) return null;
        return {
          task,
          reason: String(r.reason || "").trim().slice(0, 140),
          impact: String(r.impact || "").trim().slice(0, 100),
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    await db.logActivity(uuid, "ai_coach", "task", "—", `Coach priorizó ${recommendations.length} tareas`);

    return res.json({ success: true, recommendations });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/tasks — el cliente crea sus propias tareas
router.post("/user/tasks", authMiddleware, async (req, res) => {
  try {
    const { title, description, priority, due_date, project_id, phase, label, estimated_hours, depends_on, links } = req.body || {};

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Título obligatorio" });
    }

    // Verificar acceso al proyecto si se especifica uno
    if (project_id) {
      const hasAccess = await assertProjectAccess(req.user.sub, project_id);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: "Sin acceso a ese proyecto" });
      }
    }

    const existingTasks = await db.getAll("tasks");
    const tasksById = new Map(existingTasks.map(t => [Number(t.id ?? t.nocodb_id), t]));

    const task = await db.insert("tasks", {
      title:       String(title).trim(),
      description: String(description || "").trim(),
      status:      "pending",
      priority:    VALID_PRIOS.includes(priority)   ? priority  : "medium",
      project_id:  project_id ? Number(project_id) : null,
      assigned_to: req.user.sub,
      due_date:    due_date || null,
      phase:       VALID_PHASES.includes(phase) ? phase : null,
      label:       VALID_LABELS.includes(label) ? label : null,
      order:       0,
      estimated_hours: sanitizeEstimatedHours(estimated_hours),
      depends_on:      JSON.stringify(sanitizeDependsOnForCreate(depends_on, tasksById)),
      links:           JSON.stringify(sanitizeLinks(links)),
    });

    await db.logActivity(req.user.sub, "create", "task", task.id, `Tarea propia: "${title}"`);

    return res.status(201).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/tasks/:id — cliente edita sus propias tareas (excepto estado y asignación)
router.patch("/user/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const all  = await db.getAll("tasks");
    const task = all.find(t => String(t.id ?? t.nocodb_id) === String(id));

    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (task.assigned_to !== req.user.sub) {
      return res.status(403).json({ success: false, message: "No tenés acceso a esta tarea" });
    }

    const { title, description, priority, due_date, phase, label, order, estimated_hours, depends_on, links } = req.body || {};
    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (priority    !== undefined && VALID_PRIOS.includes(priority))   fields.priority = priority;
    if (due_date    !== undefined) fields.due_date    = due_date || null;
    if (phase       !== undefined) fields.phase       = VALID_PHASES.includes(phase) ? phase : null;
    if (label       !== undefined) fields.label       = VALID_LABELS.includes(label) ? label : null;
    if (order       !== undefined) fields.order       = Number(order) || 0;
    if (estimated_hours !== undefined) fields.estimated_hours = sanitizeEstimatedHours(estimated_hours);
    if (links       !== undefined) fields.links       = JSON.stringify(sanitizeLinks(links));

    let dependencyWarnings = [];
    if (depends_on !== undefined) {
      const tasksById = new Map(all.map(t => [Number(t.id ?? t.nocodb_id), t]));
      const { clean, warnings } = sanitizeDependsOn(id, depends_on, tasksById);
      fields.depends_on = JSON.stringify(clean);
      dependencyWarnings = warnings;
    }

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    const updated = await db.update("tasks", id, fields);
    return res.json({ success: true, task: updated, dependency_warnings: dependencyWarnings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/tasks/:id/status — ciclar estado (sin cambios en lógica)
router.patch("/user/tasks/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body || {};

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido" });
    }

    const all  = await db.getAll("tasks");
    const task = all.find(t => String(t.id ?? t.nocodb_id) === String(id));

    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (task.assigned_to !== req.user.sub) {
      return res.status(403).json({ success: false, message: "No tenés acceso a esta tarea" });
    }

    const updated = await db.update("tasks", id, { status });
    return res.json({ success: true, task: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════
   COMENTARIOS POR TAREA (Sprint E)
   Reusa project_messages (con task_id opcional) en vez de una tabla nueva.
   Una sola ruta para admin y cliente — el control de acceso ya distingue roles.
═══════════════════════════════════════ */

async function findTask(id) {
  const all = await db.getAll("tasks");
  return all.find(t => String(t.id ?? t.nocodb_id) === String(id));
}

async function assertTaskAccess(req, task) {
  if (req.user.role === "admin") return true;
  if (task.assigned_to === req.user.sub) return true;
  if (task.project_id) return assertProjectAccess(req.user.sub, task.project_id);
  return false;
}

// GET /api/user/tasks/:id/comments
router.get("/user/tasks/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const msgs = await db.getWhere("project_messages", `(task_id,eq,${id})`);
    const sorted = msgs.sort((a, b) => new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0));
    return res.json({ success: true, messages: sorted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/tasks/:id/comments
router.post("/user/tasks/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ success: false, message: "El comentario no puede estar vacío" });

    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const userRow = await db.findOne("users", "uuid", req.user.sub);
    const message = await db.insert("project_messages", {
      project_id:  task.project_id || null,
      task_id:     Number(id),
      user_uuid:   req.user.sub,
      author_name: userRow?.full_name || userRow?.first_name || "Usuario",
      author_role: userRow?.role || "client",
      content,
    });

    if (task.assigned_to && task.assigned_to !== req.user.sub) {
      await db.sendNotification(
        task.assigned_to, "task",
        "Nuevo comentario en tu tarea",
        `${userRow?.full_name || "Alguien"} comentó: "${content.slice(0, 80)}"`,
        "/app/panel/tasks"
      );
    }

    await db.logActivity(req.user.sub, "comment", "task", id, content.slice(0, 60));

    return res.status(201).json({ success: true, message });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
