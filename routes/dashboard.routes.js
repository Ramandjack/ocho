import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import { computeDependencyInfo, computeProjectProgress, rankNextAction } from "../services/taskEngine.service.js";

const router = express.Router();

router.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;

    // getAll usa el cache caliente (warmCache al arranque) — nunca golpea NocoDB
    // en la segunda llamada. Filtrar en memoria es ~0 ms y evita timeouts 504.
    const [upR, tR, nR, cR, pR] = await Promise.allSettled([
      db.getAll("user_projects"),
      db.getAll("tasks"),
      db.getAll("notifications"),
      db.getAll("content"),
      db.getAll("projects"),
    ]);

    const pick = r => (r.status === "fulfilled" ? r.value : []);
    const errs = {};
    [["user_projects", upR], ["tasks", tR], ["notifications", nR], ["content", cR], ["projects", pR]]
      .forEach(([name, r]) => {
        if (r.status === "rejected") {
          errs[name] = r.reason?.message || "Error desconocido";
          console.error(`[dashboard] Error en tabla "${name}": ${r.reason?.message}`);
        }
      });

    const assignments   = pick(upR).filter(r => r.user_uuid === uuid);
    // Enriquecer con el set completo de tareas (grafo de dependencias correcto)
    // y recién después filtrar por usuario.
    const tasksEnriched = computeDependencyInfo(pick(tR));
    const tasks         = tasksEnriched.filter(t => t.assigned_to === uuid);
    const notifications = pick(nR).filter(n => n.user_uuid === uuid);
    const recentContent = pick(cR)
      .filter(c => c.status === "published")
      .sort((a, b) => new Date(b.published_at || b.updated_at || b.CreatedAt || 0) - new Date(a.published_at || a.updated_at || a.CreatedAt || 0))
      .slice(0, 3);

    // ── Resumen inteligente (Sprint C) ──────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeTasks = tasks.filter(t => t.status !== "done");
    const urgentCount  = activeTasks.filter(t => t.priority === "high").length;
    const blockedCount = activeTasks.filter(t => t.is_blocked).length;
    const dueTodayCount = activeTasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
    const overdueCount = activeTasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    }).length;

    const projects   = pick(pR);
    const projectMap = Object.fromEntries(projects.map(p => [String(p.id ?? p.nocodb_id), p]));

    const activeCountByProject = {};
    for (const t of activeTasks) {
      if (!t.project_id) continue;
      const key = String(t.project_id);
      activeCountByProject[key] = (activeCountByProject[key] || 0) + 1;
    }
    const mostActiveId = Object.entries(activeCountByProject).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    let mostActiveProject = null;
    if (mostActiveId && projectMap[mostActiveId]) {
      const proj = projectMap[mostActiveId];
      const projTasks = tasks.filter(t => String(t.project_id) === mostActiveId);
      const { phase_progress_pct, overall_progress_pct } = computeProjectProgress(proj, projTasks);
      mostActiveProject = {
        id: mostActiveId,
        title: proj.title,
        current_phase: proj.current_phase || null,
        phase_progress_pct,
        overall_progress_pct,
      };
    }

    const nextAction = rankNextAction(tasks);

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
        // Resumen inteligente — Sprint C
        urgent_count:         urgentCount,
        due_today_count:      dueTodayCount,
        overdue_count:        overdueCount,
        blocked_count:        blockedCount,
        most_active_project:  mostActiveProject,
        next_action:          nextAction,
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
    db.getAll("user_projects"),
    db.getAll("tasks"),
    db.getAll("notifications"),
  ]);
  return res.json({
    success: true,
    user: { uuid, email: req.user.email, role: req.user.role },
    counts: {
      user_projects:  upR.status === "fulfilled" ? upR.value.filter(r => r.user_uuid === uuid).length  : `ERROR: ${upR.reason?.message}`,
      tasks_assigned: tR.status  === "fulfilled" ? tR.value.filter(t => t.assigned_to === uuid).length : `ERROR: ${tR.reason?.message}`,
      notifications:  nR.status  === "fulfilled" ? nR.value.filter(n => n.user_uuid === uuid).length   : `ERROR: ${nR.reason?.message}`,
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
