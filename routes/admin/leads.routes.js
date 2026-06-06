import express from "express";
import { db } from "../../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../../middleware/auth.js";

const router = express.Router();

router.get("/admin/leads", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    if (!process.env.NOCODB_LEADS_TABLE) return res.json({ success: true, leads: [] });
    const leads = await db.getAll("leads");
    return res.json({ success: true, leads });
  } catch (error) {
    console.error("Error en /api/admin/leads:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/leads/:id/stage", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id }    = req.params;
    const { stage } = req.body || {};
    const allowed   = ["new","contacted","qualified","closed"];
    if (!allowed.includes(String(stage || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Stage inválido" });
    }
    if (!process.env.NOCODB_LEADS_TABLE) {
      return res.status(503).json({ success: false, message: "NocoDB leads no configurado" });
    }
    const updated = await db.update("leads", id, { stage: String(stage).toLowerCase() });
    return res.json({ success: true, message: "Stage actualizado", lead: updated });
  } catch (error) {
    console.error("Error en PATCH lead stage:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
