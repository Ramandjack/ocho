import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ── Constants ──────────────────────────────────────────────── */

const VALID_STATUSES = ["pending", "in_progress", "done"];
const VALID_PHASES   = ["discovery", "brief", "design", "development", "testing", "launch"];
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
  keyGenerator:  req => req.user?.sub || req.ip,
  message:       { success: false, message: "Demasiadas generaciones IA. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders:   false,
});

async function callClaude(system, userContent) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return null; // caller handles the null case
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Claude ${res.status}`);
  return data.content?.[0]?.text ?? "";
}

function parseJsonFromClaude(text) {
  let raw = (text || "").trim();
  // Strip markdown fences if present
  raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(raw);
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

function enrichTasks(tasks, projects) {
  const projectMap = Object.fromEntries(
    projects.map(p => [String(p.id ?? p.nocodb_id), p])
  );
  return tasks.map(t => ({
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
    const { title, description, status, priority, project_id, assigned_to, due_date, phase, label, order } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: "Título obligatorio" });

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
    const { title, description, status, priority, assigned_to, due_date, phase, label, order } = req.body || {};

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

    return res.json({ success: true, task: updated });
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
      promptFn({ title: project.title, type: project.type || "digital", count: clampedCount }, questionnaireText)
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
    const tasks = allTasks.filter(t => t.assigned_to === uuid);
    return res.json({ success: true, tasks: enrichTasks(tasks, projects) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/tasks — el cliente crea sus propias tareas
router.post("/user/tasks", authMiddleware, async (req, res) => {
  try {
    const { title, description, priority, due_date, project_id, phase, label } = req.body || {};

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

    const { title, description, priority, due_date, phase, label, order } = req.body || {};
    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (priority    !== undefined && VALID_PRIOS.includes(priority))   fields.priority = priority;
    if (due_date    !== undefined) fields.due_date    = due_date || null;
    if (phase       !== undefined) fields.phase       = VALID_PHASES.includes(phase) ? phase : null;
    if (label       !== undefined) fields.label       = VALID_LABELS.includes(label) ? label : null;
    if (order       !== undefined) fields.order       = Number(order) || 0;

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    const updated = await db.update("tasks", id, fields);
    return res.json({ success: true, task: updated });
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

export default router;
