import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

async function assertProjectAccess(userUuid, projectId) {
  const all = await db.getAll("user_projects");
  return all.some(
    r => r.user_uuid === userUuid && Number(r.project_id) === Number(projectId)
  );
}

/* ===========================
   USER — VER ENTREGABLES
=========================== */

// GET /api/user/projects/:id/deliverables
router.get("/user/projects/:id/deliverables", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const all = await db.getAll("project_deliverables");
    const deliverables = all
      .filter(d => Number(d.project_id) === Number(id))
      .map(d => ({
        id:           d.id || d.nocodb_id,
        phase:        d.phase,
        type:         d.type,
        title:        d.title,
        version:      d.version,
        generated_by: d.generated_by,
        created_at:   d.CreatedAt || d.created_at,
        // content no se incluye en el listado — sólo en el detalle
      }))
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    return res.json({ success: true, deliverables });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/projects/:id/deliverables/:did — detalle con contenido completo
router.get("/user/projects/:id/deliverables/:did", authMiddleware, async (req, res) => {
  try {
    const { id, did } = req.params;
    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Sin acceso" });

    const deliverable = await db.getById("project_deliverables", did);
    if (!deliverable || Number(deliverable.project_id) !== Number(id)) {
      return res.status(404).json({ success: false, message: "Entregable no encontrado" });
    }

    return res.json({ success: true, deliverable });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   ADMIN — GESTIÓN ENTREGABLES
=========================== */

// GET /api/admin/projects/:id/deliverables — admin lista entregables
router.get("/admin/projects/:id/deliverables", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await db.getAll("project_deliverables");
    const deliverables = all
      .filter(d => Number(d.project_id) === Number(id))
      .sort((a, b) => new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0));

    return res.json({ success: true, deliverables });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/projects/:id/deliverables — admin crea entregable
router.post("/admin/projects/:id/deliverables", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { phase, type, title, content, generated_by } = req.body || {};

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: "title y content son obligatorios" });
    }

    // Calcular versión: contar entregables del mismo type en este proyecto
    const all = await db.getAll("project_deliverables");
    const sameType = all.filter(
      d => Number(d.project_id) === Number(id) && d.type === type
    );
    const version = sameType.length + 1;

    const deliverable = await db.insert("project_deliverables", {
      project_id:   Number(id),
      phase:        phase        || "discovery",
      type:         type         || "document",
      title:        String(title).trim(),
      content:      String(content),
      version,
      generated_by: generated_by || "admin",
    });

    await db.logActivity(
      req.user.sub, "create", "deliverable", id,
      `Entregable creado: "${title}"`
    );

    // Notificar a clientes asignados
    const assignments = await db.getAll("user_projects");
    const clientUuids = assignments
      .filter(a => Number(a.project_id) === Number(id) && a.user_uuid !== req.user.sub)
      .map(a => a.user_uuid);

    if (clientUuids.length) {
      await db.sendNotificationToMany(
        clientUuids,
        "project",
        "Nuevo entregable disponible",
        `"${title}" ya está disponible en tu proyecto`,
        `/app/panel/projects/${id}`
      );
    }

    return res.status(201).json({ success: true, deliverable });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/projects/:id/deliverables/:did — admin edita entregable
router.patch("/admin/projects/:id/deliverables/:did", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, did } = req.params;
    const { title, content, phase, type } = req.body || {};

    const fields = {};
    if (title   !== undefined) fields.title   = String(title).trim();
    if (content !== undefined) fields.content = String(content);
    if (phase   !== undefined) fields.phase   = phase;
    if (type    !== undefined) fields.type    = type;

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    if (fields.content !== undefined) {
      const current = await db.getById("project_deliverables", did);
      fields.version = (Number(current?.version) || 1) + 1;
    }

    const updated = await db.update("project_deliverables", did, fields);

    await db.logActivity(
      req.user.sub, "update", "deliverable", id,
      `Entregable #${did} actualizado`
    );

    return res.json({ success: true, deliverable: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
