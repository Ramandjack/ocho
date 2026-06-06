import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

router.get("/admin/activity", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;

    const logs   = await db.getAll("activity_log");
    const sorted = logs.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));
    const page   = sorted.slice(offset, offset + limit);

    return res.json({ success: true, logs: page, total: sorted.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
