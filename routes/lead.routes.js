import express from "express";
import { db } from "../nocodb.service.js";
import { leadLimiter } from "../middleware/rateLimits.js";
import { normalizeEmail, inferLeadSegment } from "../utils/helpers.js";

const router = express.Router();

const N8N_LEAD_WEBHOOK = process.env.N8N_LEAD_WEBHOOK || "";
const N8N_API_KEY      = process.env.N8N_API_KEY      || "";

router.post("/lead", leadLimiter, async (req, res) => {
  try {
    const payload  = req.body || {};
    const required = ["name","email","project_type","budget","message"];

    for (const field of required) {
      if (!payload[field]) {
        return res.status(400).json({ success: false, message: `Falta el campo obligatorio: ${field}` });
      }
    }

    const leadPayload = {
      name:         String(payload.name).trim(),
      email:        normalizeEmail(payload.email),
      company:      String(payload.company      || "").trim(),
      project_type: String(payload.project_type).trim(),
      budget:       String(payload.budget).trim(),
      message:      String(payload.message).trim(),
      source:       String(payload.source       || "website_contact").trim(),
      page:         String(payload.page         || "").trim(),
      user_agent:   String(payload.user_agent   || "").trim(),
      created_at:   String(payload.created_at   || new Date().toISOString()).trim(),
      stage:        "new",
      segment:      inferLeadSegment(String(payload.project_type).trim()),
    };

    let n8nResult = null, nocodbResult = null;

    if (N8N_LEAD_WEBHOOK) {
      const response = await fetch(N8N_LEAD_WEBHOOK, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(N8N_API_KEY ? { "x-api-key": N8N_API_KEY } : {}) },
        body:    JSON.stringify(leadPayload),
      });
      const ct  = response.headers.get("content-type") || "";
      n8nResult = ct.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) throw new Error(typeof n8nResult === "object" ? n8nResult.message || JSON.stringify(n8nResult) : String(n8nResult));
    }

    if (process.env.NOCODB_LEADS_URL) {
      nocodbResult = await db.insert("leads", leadPayload);
    }

    return res.status(201).json({ success: true, message: "Lead enviado correctamente", lead: nocodbResult || leadPayload, relay: n8nResult });
  } catch (error) {
    console.error("Error en /api/lead:", error);
    return res.status(500).json({ success: false, message: error.message || "Error interno enviando el lead" });
  }
});

export default router;
