import express from "express";
import { db } from "../nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ── Admin ── */

router.post("/admin/notifications/send", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuids, type, title, message, link } = req.body || {};
    if (!user_uuids?.length || !title || !message) {
      return res.status(400).json({ success: false, message: "user_uuids, title y message son obligatorios" });
    }
    await db.sendNotificationToMany(user_uuids, type || "system", title, message, link || "");
    await db.logActivity(req.user.sub, "notify", "notification", "bulk", `Notificación a ${user_uuids.length} usuarios: "${title}"`);
    return res.json({ success: true, message: `Notificación enviada a ${user_uuids.length} usuarios` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ── User ── */

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
    const { id }       = req.params;
    const notification = await db.getById("notifications", id);
    if (!notification || notification.user_uuid !== req.user.sub) {
      return res.status(403).json({ success: false, message: "No tenés acceso a esta notificación" });
    }
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

export default router;
