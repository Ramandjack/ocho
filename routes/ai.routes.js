import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "../services/nocodb.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: req => req.user.sub,
  message: { success: false, message: "Demasiadas solicitudes a la IA. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const BRIEF_MODEL = "claude-haiku-4-5-20251001";
const CHAT_MODEL  = "claude-sonnet-4-6";

const NO_KEY_MSG =
  "La integración con Claude no está configurada todavía. " +
  "Agregá ANTHROPIC_API_KEY al .env para activarla.";

async function callClaude({ system, messages, model, max_tokens }) {
  if (!ANTHROPIC_KEY) return NO_KEY_MSG;

  const body = { model, max_tokens, messages };
  if (system) body.system = system;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Anthropic ${res.status}`);
  return data.content?.[0]?.text ?? "";
}

async function buildContext(userUuid) {
  const [assignments, tasks, notifications] = await Promise.all([
    db.getWhere("user_projects",  `(user_uuid,eq,${userUuid})`),
    db.getWhere("tasks",          `(assigned_to,eq,${userUuid})`),
    db.getWhere("notifications",  `(user_uuid,eq,${userUuid})`),
  ]);

  const allProjects = await db.getAll("projects");
  const projectIds  = new Set(assignments.map(a => Number(a.project_id)));
  const projects    = allProjects.filter(p => projectIds.has(Number(p.nocodb_id ?? p.id)));

  const pending    = tasks.filter(t => t.status === "pending");
  const inProgress = tasks.filter(t => t.status === "in_progress");
  const unread     = notifications.filter(n => !n.read).length;

  const lines = [
    `Proyectos (${projects.length}):`,
    ...projects.map(p => `  - ${p.title} [${p.status ?? "—"}]`),
    "",
    `Tareas en curso (${inProgress.length}):`,
    ...inProgress.slice(0, 8).map(t => `  - ${t.title}`),
    "",
    `Tareas pendientes (${pending.length}):`,
    ...pending.slice(0, 8).map(t => `  - ${t.title}`),
    "",
    `Notificaciones sin leer: ${unread}`,
  ];

  return lines.join("\n");
}

const SYSTEM_BASE =
  "Sos el asistente de OCHO, un workspace privado de trabajo digital. " +
  "Respondés siempre en español, de forma concisa y directa. " +
  "Usás markdown básico (negritas, listas con guiones) cuando mejora la claridad, " +
  "pero no abusás de headers ni formateo innecesario.";

/* ===========================
   BRIEF DEL DÍA
=========================== */

router.post("/ai/brief", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const ctx = await buildContext(req.user.sub);

    const text = await callClaude({
      model:      BRIEF_MODEL,
      max_tokens: 600,
      system:     SYSTEM_BASE,
      messages: [{
        role:    "user",
        content: `Generá un brief del estado actual de mi workspace. Máximo 5 puntos, directo y accionable. Sin introducción, arrancá con los puntos.\n\nContexto:\n${ctx}`,
      }],
    });

    return res.json({ success: true, brief: text });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   CHAT
=========================== */

router.post("/ai/chat", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ success: false, message: "messages es requerido" });
    }

    const validRoles = new Set(["user", "assistant"]);
    const clean = messages
      .filter(m => validRoles.has(m.role) && typeof m.content === "string")
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      .slice(-20);

    if (!clean.length || clean[clean.length - 1].role !== "user") {
      return res.status(400).json({ success: false, message: "El último mensaje debe ser del usuario" });
    }

    const ctx = await buildContext(req.user.sub);

    const system = `${SYSTEM_BASE}\n\nContexto actual del workspace:\n${ctx}`;

    const text = await callClaude({
      model:      CHAT_MODEL,
      max_tokens: 1024,
      system,
      messages:   clean,
    });

    return res.json({ success: true, message: text });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
