import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;

    const [assignmentsR, tasksR, notificationsR, contentR] = await Promise.allSettled([
      db.getWhere("user_projects",  `(user_uuid,eq,${uuid})`),
      db.getWhere("tasks",          `(assigned_to,eq,${uuid})`),
      db.getWhere("notifications",  `(user_uuid,eq,${uuid})`),
      db.getWhere("content",        "(status,eq,published)"),
    ]);

    const pick = r => (r.status === "fulfilled" ? r.value : []);
    const errs = {};
    [["user_projects", assignmentsR], ["tasks", tasksR], ["notifications", notificationsR], ["content", contentR]]
      .forEach(([name, r]) => {
        if (r.status === "rejected") {
          errs[name] = r.reason?.message || "Error desconocido";
          console.error(`[dashboard] Error en tabla "${name}": ${r.reason?.message}`);
        }
      });

    const assignments   = pick(assignmentsR);
    const tasks         = pick(tasksR);
    const notifications = pick(notificationsR);
    const recentContent = pick(contentR)
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
      _errors: Object.keys(errs).length ? errs : undefined,
    });
  } catch (err) {
    console.error("[dashboard] Error inesperado:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   USER PING / DIAGNÓSTICO
   Retorna info del usuario autenticado + conteos raw de tablas vinculadas.
   Útil para debuggear si el panel cliente no muestra datos.
=========================== */

router.get("/user/ping", authMiddleware, async (req, res) => {
  const uuid = req.user.sub;
  const [upR, tR, nR] = await Promise.allSettled([
    db.getWhere("user_projects", `(user_uuid,eq,${uuid})`),
    db.getWhere("tasks",         `(assigned_to,eq,${uuid})`),
    db.getWhere("notifications", `(user_uuid,eq,${uuid})`),
  ]);
  return res.json({
    success: true,
    user: { uuid, email: req.user.email, role: req.user.role },
    counts: {
      user_projects:  upR.status === "fulfilled" ? upR.value.length  : `ERROR: ${upR.reason?.message}`,
      tasks_assigned: tR.status  === "fulfilled" ? tR.value.length   : `ERROR: ${tR.reason?.message}`,
      notifications:  nR.status  === "fulfilled" ? nR.value.length   : `ERROR: ${nR.reason?.message}`,
    },
  });
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

  const users    = pick(usersR);
  const leads    = pick(leadsR);
  const projects = pick(projectsR);
  const tasks    = pick(tasksR);
  const modules  = pick(modulesR);
  const content  = pick(contentR);
  const activity = pick(activityR);

  const counts = { users: users.length, leads: leads.length, projects: projects.length, tasks: tasks.length, modules: modules.length, content: content.length, activity: activity.length };
  console.log("[bootstrap] Registros por tabla:", counts);

  return res.json({
    success:  true,
    users,
    leads,
    projects,
    tasks,
    modules,
    content,
    activity,
    _counts: counts,
    _errors: Object.keys(errors).length ? errors : undefined,
  });
});

export default router;
