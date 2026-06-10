import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const VALID_PHASES = ["discovery", "brief", "design", "development", "testing", "launch"];

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
        completed_at:  row?.completed_at || null,
        // admin_notes y ai_output no se exponen al cliente
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
