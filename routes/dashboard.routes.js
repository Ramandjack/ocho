import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;

    const [assignments, tasks, notifications] = await Promise.all([
      db.getWhere("user_projects",  `(user_uuid,eq,${uuid})`),
      db.getWhere("tasks",          `(assigned_to,eq,${uuid})`),
      db.getWhere("notifications",  `(user_uuid,eq,${uuid})`),
    ]);

    // Fetch only published content via a targeted filter instead of getAll
    const allContent = await db.getWhere("content", "(status,eq,published)");
    const recentContent = allContent
      .sort((a, b) => new Date(b.published_at || b.updated_at || b.CreatedAt || 0) - new Date(a.published_at || a.updated_at || a.CreatedAt || 0))
      .slice(0, 3);

    return res.json({
      success: true,
      dashboard: {
        projects_count:       assignments.length,
        tasks_total:          tasks.length,
        tasks_pending:        tasks.filter(t => t.status === "pending").length,
        tasks_in_progress:    tasks.filter(t => t.status === "in_progress").length,
        tasks_done:           tasks.filter(t => t.status === "done").length,
        notifications_unread: notifications.filter(n => !n.read).length,
        recent_notifications: notifications.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0)).slice(0, 5),
        recent_tasks:         tasks.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0)).slice(0, 5),
        recent_content:       recentContent,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   ADMIN BOOTSTRAP
   Un solo request carga todos los datos del admin panel.
   El servidor resuelve los 7 queries en paralelo usando el cache.
=========================== */

router.get("/admin/bootstrap", authMiddleware, requireAdmin, async (req, res) => {
  const tableNames = ["users", "leads", "projects", "tasks", "modules", "content", "activity_log"];

  const [usersR, leadsR, projectsR, tasksR, modulesR, contentR, activityR] =
    await Promise.allSettled([
      db.getAll("users"),
      db.getAll("leads"),
      db.getAll("projects"),
      db.getAll("tasks"),
      db.getAll("modules"),
      db.getAll("content"),
      db.getAll("activity_log"),
    ]);

  const results = [usersR, leadsR, projectsR, tasksR, modulesR, contentR, activityR];
  const errors  = {};
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      errors[tableNames[i]] = r.reason?.message || "Error desconocido";
      console.error(`[bootstrap] Error en tabla "${tableNames[i]}": ${r.reason?.message}`);
    }
  });

  if (Object.keys(errors).length) {
    console.error("[bootstrap] Resumen de errores NocoDB:", errors);
  }

  const pick = r => (r.status === "fulfilled" ? r.value : []);

  return res.json({
    success:  true,
    users:    pick(usersR),
    leads:    pick(leadsR),
    projects: pick(projectsR),
    tasks:    pick(tasksR),
    modules:  pick(modulesR),
    content:  pick(contentR),
    activity: pick(activityR),
    _errors:  Object.keys(errors).length ? errors : undefined,
  });
});

export default router;
