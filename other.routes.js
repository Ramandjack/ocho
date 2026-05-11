/**
 * tasks.routes.js — Rutas de tareas
 * notifications.routes.js — Rutas de notificaciones
 * modules.routes.js — Rutas de módulos
 *
 * INTEGRACIÓN en server.js:
 *   import otherRoutes from './other.routes.js';
 *   app.use('/api', otherRoutes);
 */

import express from "express";
import jwt from "jsonwebtoken";
import { db } from "./nocodb.service.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;
    if (!token) return res.status(401).json({ success: false, message: "No autenticado" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Sesión inválida" });
  }
}

function requireAdmin(req, res, next) {
  if (String(req.user?.role || "").toLowerCase() !== "admin") {
    return res.status(403).json({ success: false, message: "No autorizado" });
  }
  next();
}

/* ===========================
   TASKS — ADMIN
=========================== */

router.get("/admin/tasks", authMiddleware, requireAdmin, async (req, res) => {
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
      title: String(title).trim(),
      description: String(description || "").trim(),
      status: status || "pending",
      priority: priority || "medium",
      project_id: project_id ? Number(project_id) : null,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
    });

    // Notificar al usuario asignado
    if (assigned_to) {
      await db.sendNotification(
        assigned_to,
        "task",
        "Nueva tarea asignada",
        `Se te asignó la tarea: "${title}"`,
        `/app/panel#tasks`
      );
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
    if (title !== undefined) fields.title = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status !== undefined) fields.status = status;
    if (priority !== undefined) fields.priority = priority;
    if (assigned_to !== undefined) fields.assigned_to = assigned_to;
    if (due_date !== undefined) fields.due_date = due_date;

    const updated = await db.update("tasks", id, fields);

    // Notificar si cambia el asignado
    if (fields.assigned_to) {
      await db.sendNotification(
        fields.assigned_to,
        "task",
        "Tarea actualizada",
        `La tarea cambió: ${fields.status ? `estado → ${fields.status}` : "actualización general"}`,
        `/app/panel#tasks`
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

/* ===========================
   TASKS — USER
=========================== */

router.get("/user/tasks", authMiddleware, async (req, res) => {
  try {
    const tasks = await db.getWhere("tasks", `(assigned_to,eq,${req.user.sub})`);
    return res.json({ success: true, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// El usuario puede actualizar el status de sus propias tareas
router.patch("/user/tasks/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const allowed = ["pending", "in_progress", "done"];
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

/* ===========================
   NOTIFICATIONS — ADMIN
=========================== */

// POST /api/admin/notifications/send — enviar notificación manual
router.post("/admin/notifications/send", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuids, type, title, message, link } = req.body || {};

    if (!user_uuids?.length || !title || !message) {
      return res.status(400).json({ success: false, message: "user_uuids, title y message son obligatorios" });
    }

    await db.sendNotificationToMany(user_uuids, type || "system", title, message, link || "");

    await db.logActivity(
      req.user.sub,
      "notify",
      "notification",
      "bulk",
      `Notificación enviada a ${user_uuids.length} usuarios: "${title}"`
    );

    return res.json({ success: true, message: `Notificación enviada a ${user_uuids.length} usuarios` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   NOTIFICATIONS — USER
=========================== */

router.get("/user/notifications", authMiddleware, async (req, res) => {
  try {
    const notifications = await db.getWhere("notifications", `(user_uuid,eq,${req.user.sub})`);
    const sorted = notifications.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));
    const unread = sorted.filter(n => !n.read).length;
    return res.json({ success: true, notifications: sorted, unread });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/user/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.update("notifications", id, { read: true });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/user/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    const notifications = await db.getWhere(
      "notifications",
      `(user_uuid,eq,${req.user.sub})~and(read,eq,false)`
    );
    await Promise.allSettled(
      notifications.map(n => db.update("notifications", n.nocodb_id || n.id, { read: true }))
    );
    return res.json({ success: true, marked: notifications.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   MODULES — ADMIN
=========================== */

router.get("/admin/modules", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const modules = await db.getAll("modules");
    return res.json({ success: true, modules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/modules", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { key, label, description, icon } = req.body || {};
    if (!key || !label) return res.status(400).json({ success: false, message: "key y label obligatorios" });

    const module = await db.insert("modules", {
      key: String(key).trim().toLowerCase(),
      label: String(label).trim(),
      description: String(description || "").trim(),
      icon: String(icon || "").trim(),
      active: true,
    });

    await db.logActivity(req.user.sub, "create", "module", module.id, `Módulo: "${key}"`);
    return res.status(201).json({ success: true, module });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle activo/inactivo globalmente
router.patch("/admin/modules/:id/toggle", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const current = await db.getById("modules", id);
    const newActive = !current.active;
    const updated = await db.update("modules", id, { active: newActive });
    await db.logActivity(req.user.sub, "toggle", "module", id, `active → ${newActive}`);
    return res.json({ success: true, module: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Asignar módulo a usuario específico
router.post("/admin/modules/assign", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuid, module_key, enabled = true } = req.body || {};
    if (!user_uuid || !module_key) {
      return res.status(400).json({ success: false, message: "user_uuid y module_key obligatorios" });
    }

    const existing = await db.getWhere(
      "user_modules",
      `(user_uuid,eq,${user_uuid})~and(module_key,eq,${module_key})`
    );

    let result;
    if (existing.length) {
      result = await db.update("user_modules", existing[0].nocodb_id || existing[0].id, { enabled });
    } else {
      result = await db.insert("user_modules", { user_uuid, module_key, enabled });
    }

    await db.logActivity(
      req.user.sub,
      "assign_module",
      "module",
      module_key,
      `Usuario ${user_uuid} → enabled: ${enabled}`
    );

    return res.json({ success: true, user_module: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   MODULES — USER
=========================== */

router.get("/user/modules", authMiddleware, async (req, res) => {
  try {
    const userUuid = req.user.sub;

    const allModules = await db.getAll("modules");
    const activeGlobal = allModules.filter(m => m.active);

    const userOverrides = await db.getWhere("user_modules", `(user_uuid,eq,${userUuid})`);
    const overrideMap = {};
    userOverrides.forEach(o => { overrideMap[o.module_key] = o.enabled; });

    const modules = activeGlobal.map(m => ({
      ...m,
      enabled: overrideMap[m.key] !== undefined ? overrideMap[m.key] : true,
    })).filter(m => m.enabled);

    return res.json({ success: true, modules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   ACTIVITY LOG — ADMIN
=========================== */

router.get("/admin/activity", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getAll("activity_log");
    const sorted = logs.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));
    return res.json({ success: true, logs: sorted.slice(0, 100) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   USER DASHBOARD — agregado
=========================== */

router.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const userUuid = req.user.sub;

    const [assignments, tasks, notifications, userModules] = await Promise.all([
      db.getWhere("user_projects", `(user_uuid,eq,${userUuid})`),
      db.getWhere("tasks", `(assigned_to,eq,${userUuid})`),
      db.getWhere("notifications", `(user_uuid,eq,${userUuid})`),
      db.getAll("modules"),
    ]);

    const unreadNotifications = notifications.filter(n => !n.read).length;
    const pendingTasks = tasks.filter(t => t.status === "pending").length;
    const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;

    return res.json({
      success: true,
      dashboard: {
        projects_count: assignments.length,
        tasks_total: tasks.length,
        tasks_pending: pendingTasks,
        tasks_in_progress: inProgressTasks,
        notifications_unread: unreadNotifications,
        recent_notifications: notifications
          .sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0))
          .slice(0, 5),
        recent_tasks: tasks
          .sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0))
          .slice(0, 5),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
