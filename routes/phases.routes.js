import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import { callClaude } from "../services/claude.service.js";

const router = express.Router();

const VALID_PHASES = ["discovery", "brief", "design", "development", "testing", "launch"];

/* ===========================
   AI HELPERS
=========================== */

const phaseAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: req => req.user?.sub || ipKeyGenerator(req),
  message: { success: false, message: "Demasiados análisis. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

function formatQuestionnaire(q) {
  if (!q || typeof q !== "object") return "(sin respuestas)";
  const entries = Object.entries(q).filter(([, v]) => String(v || "").trim());
  if (!entries.length) return "(sin respuestas)";
  return entries.map(([k, v]) => `- ${k}: ${String(v).slice(0, 500)}`).join("\n");
}

const PHASE_SYSTEM = {
  discovery:   "Sos un Product Manager senior analizando el discovery de un producto digital para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico (negritas, listas con guiones) cuando mejora la claridad.",
  brief:       "Sos un Product Owner definiendo el alcance de un producto digital para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico cuando mejora la claridad.",
  design:      "Sos un UX Designer senior evaluando requerimientos de diseño para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico cuando mejora la claridad.",
  development: "Sos un Software Architect evaluando requerimientos técnicos para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico cuando mejora la claridad.",
  testing:     "Sos un QA Lead planificando el testing de un producto digital para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico cuando mejora la claridad.",
  launch:      "Sos un Growth Product Manager planificando el lanzamiento de un producto digital para OCHO Studio. Respondés en español, de forma concisa y directa. Usás markdown básico cuando mejora la claridad.",
};

const PHASE_PROMPT = {
  discovery:   q => `Analizá las respuestas de discovery del cliente:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: claridad del problema definido, perfil del usuario y su dolor principal, oportunidades y riesgos detectados, preguntas críticas que quedan sin responder, y recomendación concreta para avanzar al Brief. Máximo 350 palabras.`,
  brief:       q => `Evaluá el brief del cliente:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: claridad de objetivos, completitud de requisitos funcionales, qué falta definir antes de diseñar, riesgos de scope identificados, y priorización MVP sugerida (must have / nice to have). Máximo 350 palabras.`,
  design:      q => `Evaluá los requerimientos de diseño del cliente:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: análisis del tono y marca, complejidad de los flujos principales, riesgos UX identificados, decisiones que necesitan validación, y recomendación sobre por dónde arrancar. Máximo 350 palabras.`,
  development: q => `Evaluá los requerimientos técnicos del cliente:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: viabilidad técnica del producto, integraciones y dependencias externas, riesgos técnicos principales, decisiones de arquitectura clave, y estimación de complejidad (baja/media/alta) con justificación. Máximo 350 palabras.`,
  testing:     q => `Planificá el testing basándote en las respuestas del cliente:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: escenarios críticos de prueba, riesgos de calidad más importantes, estrategia de testing recomendada, criterios de aceptación sugeridos, y condiciones para aprobar el lanzamiento. Máximo 350 palabras.`,
  launch:      q => `Evaluá la preparación del lanzamiento:\n\n${formatQuestionnaire(q)}\n\nGenerá un análisis que incluya: evaluación de la preparación, canales de comunicación identificados, métricas de éxito a monitorear post-lanzamiento, riesgos del lanzamiento, y plan de acción para las primeras 2 semanas. Máximo 350 palabras.`,
};

const PHASE_LABELS = {
  discovery:   "Discovery",
  brief:       "Brief",
  design:      "Diseño",
  development: "Desarrollo",
  testing:     "Testing",
  launch:      "Lanzamiento",
};

async function assertProjectAccess(userUuid, projectId) {
  const all = await db.getAll("user_projects");
  return all.some(
    r => r.user_uuid === userUuid && Number(r.project_id) === Number(projectId)
  );
}

async function findPhaseRow(projectId, phase) {
  const all = await db.getAll("project_phases");
  return all.find(
    r => Number(r.project_id) === Number(projectId) && r.phase === phase
  ) || null;
}

function parseQuestionnaire(raw) {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

/* ===========================
   USER — VER FASES
=========================== */

// GET /api/user/projects/:id/phases — todas las fases del proyecto (cliente)
router.get("/user/projects/:id/phases", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const all = await db.getAll("project_phases");
    const dbPhases = all.filter(r => Number(r.project_id) === Number(id));

    const phases = VALID_PHASES.map(phase => {
      const row = dbPhases.find(r => r.phase === phase);
      return {
        phase,
        label:         PHASE_LABELS[phase],
        status:        row?.status       || "pending",
        questionnaire: parseQuestionnaire(row?.questionnaire),
        ai_output:     row?.ai_output    || null,
        completed_at:  row?.completed_at || null,
        // admin_notes no se expone al cliente
      };
    });

    return res.json({ success: true, phases });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/projects/:id/phases/:phase — cliente guarda cuestionario
router.patch("/user/projects/:id/phases/:phase", authMiddleware, async (req, res) => {
  try {
    const { id, phase } = req.params;
    if (!VALID_PHASES.includes(phase)) {
      return res.status(400).json({ success: false, message: "Fase inválida" });
    }

    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const { questionnaire } = req.body || {};
    const questionnaireJson = JSON.stringify(questionnaire || {});

    const existing = await findPhaseRow(id, phase);

    let row;
    if (existing) {
      row = await db.update("project_phases", existing.id || existing.nocodb_id, {
        questionnaire: questionnaireJson,
        status: existing.status === "pending" ? "in_progress" : existing.status,
      });
    } else {
      row = await db.insert("project_phases", {
        project_id:    Number(id),
        phase,
        status:        "in_progress",
        questionnaire: questionnaireJson,
      });
    }

    return res.json({ success: true, phase: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/projects/:id/phases/:phase/ai — cliente dispara análisis IA
router.post("/user/projects/:id/phases/:phase/ai", authMiddleware, phaseAiLimiter, async (req, res) => {
  try {
    const { id, phase } = req.params;
    if (!VALID_PHASES.includes(phase)) {
      return res.status(400).json({ success: false, message: "Fase inválida" });
    }

    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const phaseRow     = await findPhaseRow(id, phase);
    const questionnaire = parseQuestionnaire(phaseRow?.questionnaire);

    const hasContent = Object.values(questionnaire).some(v => String(v || "").trim().length > 10);
    if (!hasContent) {
      return res.status(400).json({ success: false, message: "Completá al menos una pregunta antes de analizar" });
    }

    const rawOutput = await callClaude(PHASE_SYSTEM[phase], PHASE_PROMPT[phase](questionnaire), { maxTokens: 700 });
    const output = rawOutput ?? "La integración con IA no está configurada todavía. El equipo OCHO completará este análisis manualmente.";

    // Persistir output en la fase para que el admin también lo vea
    if (phaseRow) {
      await db.update("project_phases", phaseRow.id || phaseRow.nocodb_id, { ai_output: output });
    } else {
      await db.insert("project_phases", {
        project_id: Number(id),
        phase,
        status:     "in_progress",
        ai_output:  output,
      });
    }

    await db.logActivity(req.user.sub, "ai_analysis", "project_phase", id, `IA analizó fase: ${phase}`);

    return res.json({ success: true, output });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   ADMIN — GESTIÓN DE FASES
=========================== */

// GET /api/admin/projects/:id/phases — admin ve todas las fases con datos completos
router.get("/admin/projects/:id/phases", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await db.getAll("project_phases");
    const dbPhases = all.filter(r => Number(r.project_id) === Number(id));

    const phases = VALID_PHASES.map(phase => {
      const row = dbPhases.find(r => r.phase === phase);
      return {
        phase,
        label:         PHASE_LABELS[phase],
        status:        row?.status       || "pending",
        questionnaire: parseQuestionnaire(row?.questionnaire),
        ai_output:     row?.ai_output    || null,
        admin_notes:   row?.admin_notes  || null,
        completed_at:  row?.completed_at || null,
        nocodb_id:     row?.id           || row?.nocodb_id || null,
      };
    });

    return res.json({ success: true, phases });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/projects/:id/phases/:phase — admin edita estado, notas y output de IA
router.patch("/admin/projects/:id/phases/:phase", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, phase } = req.params;
    if (!VALID_PHASES.includes(phase)) {
      return res.status(400).json({ success: false, message: "Fase inválida" });
    }

    const { status, admin_notes, ai_output } = req.body || {};
    const fields = {};

    if (status !== undefined) {
      if (!["pending", "in_progress", "completed"].includes(status)) {
        return res.status(400).json({ success: false, message: "Estado inválido" });
      }
      fields.status = status;
      if (status === "completed") fields.completed_at = new Date().toISOString();
    }
    if (admin_notes !== undefined) fields.admin_notes = String(admin_notes);
    if (ai_output   !== undefined) fields.ai_output   = String(ai_output);

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    const existing = await findPhaseRow(id, phase);
    let row;
    if (existing) {
      row = await db.update("project_phases", existing.id || existing.nocodb_id, fields);
    } else {
      row = await db.insert("project_phases", {
        project_id: Number(id),
        phase,
        status: "pending",
        ...fields,
      });
    }

    await db.logActivity(
      req.user.sub, "update", "project_phase", id,
      `Fase ${phase}: ${JSON.stringify(fields)}`
    );

    return res.json({ success: true, phase: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/projects/:id/phase — avanzar la fase actual del proyecto
router.patch("/admin/projects/:id/phase", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { phase } = req.body || {};

    if (!VALID_PHASES.includes(phase)) {
      return res.status(400).json({ success: false, message: "Fase inválida" });
    }

    const updated = await db.update("projects", id, { current_phase: phase });

    await db.logActivity(
      req.user.sub, "phase_advance", "project", id,
      `Fase avanzada a: ${phase}`
    );

    // Notificar a los clientes asignados al proyecto
    const assignments = await db.getAll("user_projects");
    const clientUuids = assignments
      .filter(a => Number(a.project_id) === Number(id) && a.user_uuid !== req.user.sub)
      .map(a => a.user_uuid);

    if (clientUuids.length) {
      await db.sendNotificationToMany(
        clientUuids,
        "project",
        "Tu producto avanzó de etapa",
        `Tu proyecto pasó a la etapa de ${PHASE_LABELS[phase] || phase}`,
        `/app/panel/projects/${id}`
      );
    }

    return res.json({ success: true, project: updated, phase });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
