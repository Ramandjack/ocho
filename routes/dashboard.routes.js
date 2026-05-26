import express from "express";
import { db } from "../nocodb.service.js";
import { authMiddleware } from "../middleware/auth.js";

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

export default router;
