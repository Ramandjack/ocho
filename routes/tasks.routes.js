import express from "express";
import { db } from "../nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ── Admin ── */

router.get("/admin/tasks", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const tasks = await db.getAll("tasks");
    return res.json({ success: true, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/tasks", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, description, status, priority, project_id, assigned_to, due_date } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: "Título obligatorio" });

    const task = await db.insert("tasks", {
      title:       String(title).trim(),
      description: String(description || "").trim(),
      status:      status   || "pending",
      priority:    priority || "medium",
      project_id:  project_id ? Number(project_id) : null,
      assigned_to: assigned_to || null,
      due_date:    due_date    || null,
    });

    if (assigned_to) {
      await db.sendNotification(assigned_to, "task", "Nueva tarea asignada", `Se te asignó la tarea: "${title}"`, "/app/panel#tasks");
    }
    await db.logActivity(req.user.sub, "create", "task", task.id, `Tarea: "${title}"`);

    return res.status(201).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/admin/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigned_to, due_date } = req.body || {};

    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status      !== undefined) fields.status      = status;
    if (priority    !== undefined) fields.priority    = priority;
    if (assigned_to !== undefined) fields.assigned_to = assigned_to;
    if (due_date    !== undefined) fields.due_date    = due_date;

    const updated = await db.update("tasks", id, fields);

    if (fields.assigned_to) {
      await db.sendNotification(
        fields.assigned_to,
        "task",
        "Tarea actualizada",
        `La tarea cambió: ${fields.status ? `estado → ${fields.status}` : "actualización general"}`,
        "/app/panel#tasks"
      );
    }
    await db.logActivity(req.user.sub, "update", "task", id, `Campos: ${JSON.stringify(fields)}`);

    return res.json({ success: true, task: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

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

/* ── User ── */

router.get("/user/tasks", authMiddleware, async (req, res) => {
  try {
    const tasks = await db.getWhere("tasks", `(assigned_to,eq,${req.user.sub})`);
    return res.json({ success: true, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/user/tasks/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body || {};
    const allowed    = ["pending","in_progress","done"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido" });
    }
    const task = await db.getById("tasks", id);
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
