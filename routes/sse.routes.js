import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

const POLL_MS      = 15_000;
const KEEPALIVE_MS = 25_000;

router.get("/user/notifications/stream", authMiddleware, async (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  const uuid = req.user.sub;

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const push = async () => {
    try {
      const all   = await db.getAll("notifications");
      const mine  = all.filter(n => n.user_uuid === uuid);
      const sorted = mine.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));
      send("notifications", {
        unread: sorted.filter(n => !n.read).length,
        notifications: sorted.slice(0, 10),
      });
    } catch {
      // DB unavailable — silently skip, keepalive comment keeps connection alive
    }
  };

  // Send initial payload immediately
  await push();

  const pollId     = setInterval(push, POLL_MS);
  // Keepalive comment prevents proxies from closing idle connections
  const keepaliveId = setInterval(() => res.write(": keepalive\n\n"), KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(pollId);
    clearInterval(keepaliveId);
  });
});

export default router;
