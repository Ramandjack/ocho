import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const DIMENSIONS = ["problema", "mercado", "factibilidad", "escalabilidad", "monetizacion"];

function calcTotal(row) {
  return DIMENSIONS.reduce((sum, k) => sum + (Number(row?.[k]) || 0), 0);
}

function clamp(v) {
  return Math.min(20, Math.max(0, Number(v) || 0));
}

async function assertProjectAccess(userUuid, projectId) {
  const all = await db.getAll("user_projects");
  return all.some(
    r => r.user_uuid === userUuid && Number(r.project_id) === Number(projectId)
  );
}

/* ===========================
   USER — VER SCORE
=========================== */

// GET /api/user/projects/:id/score
router.get("/user/projects/:id/score", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const all = await db.getAll("project_score");
    const row = all.find(r => Number(r.project_id) === Number(id));

    const score = row ? {
      problema:      Number(row.problema      || 0),
      mercado:       Number(row.mercado       || 0),
      factibilidad:  Number(row.factibilidad  || 0),
      escalabilidad: Number(row.escalabilidad || 0),
      monetizacion:  Number(row.monetizacion  || 0),
      total:         calcTotal(row),
      updated_:      row.updated_ || null,
    } : null;

    return res.json({ success: true, score });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   ADMIN — EDITAR SCORE
=========================== */

// GET /api/admin/projects/:id/score — admin ve el score
router.get("/admin/projects/:id/score", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await db.getAll("project_score");
    const row = all.find(r => Number(r.project_id) === Number(id));

    const score = row ? {
      nocodb_id:     row.id || row.nocodb_id,
      problema:      Number(row.problema      || 0),
      mercado:       Number(row.mercado       || 0),
      factibilidad:  Number(row.factibilidad  || 0),
      escalabilidad: Number(row.escalabilidad || 0),
      monetizacion:  Number(row.monetizacion  || 0),
      total:         calcTotal(row),
      updated_:      row.updated_ || null,
    } : null;

    return res.json({ success: true, score });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/projects/:id/score — admin actualiza dimensiones
router.patch("/admin/projects/:id/score", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const fields = { updated_: new Date().toISOString() };
    for (const dim of DIMENSIONS) {
      if (body[dim] !== undefined) fields[dim] = clamp(body[dim]);
    }

    if (Object.keys(fields).length === 1) {
      return res.status(400).json({ success: false, message: "Sin dimensiones para actualizar" });
    }

    const all = await db.getAll("project_score");
    const existing = all.find(r => Number(r.project_id) === Number(id));

    let row;
    if (existing) {
      row = await db.update("project_score", existing.id || existing.nocodb_id, fields);
    } else {
      row = await db.insert("project_score", { project_id: Number(id), ...fields });
    }

    // Calcular total mergeando existente + cambios
    const merged = { ...existing, ...fields };
    const total = calcTotal(merged);

    // Persistir total en projects.score_total
    await db.update("projects", id, { score_total: total });

    await db.logActivity(
      req.user.sub, "update", "project_score", id,
      `Score actualizado: ${total}/100`
    );

    return res.json({ success: true, score: row, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
