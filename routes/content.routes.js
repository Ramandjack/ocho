import express from "express";
import { db }  from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const CONTENT_TYPES   = ["article", "collection", "toolkit", "newsletter"];
const CONTENT_STATUSES = ["draft", "published", "archived"];

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// Elimina etiquetas HTML de campos de texto plano.
// Previene XSS stored si el renderizado cambia en el futuro.
function stripHtml(str) {
  return String(str || "").replace(/<[^>]*>/g, "").trim();
}

// Solo permite URLs http/https. Bloquea javascript:, data:, vbscript: y similares.
function sanitizeCoverUrl(url) {
  const s = String(url || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

async function findContentItem(id) {
  const num = Number(id);
  const all = await db.getAll("content");
  console.log("CONTENT ID:", id, "| total items:", all.length);
  if (!isNaN(num) && num > 0) {
    const found = all.find(r => Number(r.nocodb_id || r.id) === num) ?? null;
    console.log("FILTRO USADO EN NOCODB: in-memory Id ===", num, "| found:", found?.nocodb_id ?? found?.id ?? null);
    return found;
  }
  return null;
}

/* =========================
   USER — CONTENT (solo publicados)
========================= */

router.get("/user/content", authMiddleware, async (_req, res) => {
  try {
    const items = await db.getAll("content");
    const published = items
      .filter(c => c.status === "published")
      .sort((a, b) =>
        new Date(b.published_at || b.updated_at || b.CreatedAt || 0) -
        new Date(a.published_at || a.updated_at || a.CreatedAt || 0)
      );
    return res.json({ success: true, content: published });
  } catch (err) {
    console.error("GET /user/content:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — CONTENT LIST
========================= */

router.get("/admin/content", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const items = await db.getAll("content");
    const sorted = items.sort((a, b) =>
      new Date(b.updated_at || b.CreatedAt || 0) - new Date(a.updated_at || a.CreatedAt || 0)
    );
    return res.json({ success: true, content: sorted });
  } catch (err) {
    console.error("GET /admin/content:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — CREATE
========================= */

router.post("/admin/content", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      title, type, excerpt = "", body = "",
      tags = "", cover_url = "", author_name = "",
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "El título es obligatorio" });
    }
    if (!CONTENT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `Tipo inválido. Válidos: ${CONTENT_TYPES.join(", ")}` });
    }

    const now  = new Date().toISOString();
    const item = await db.insert("content", {
      title:       stripHtml(title),
      type,
      status:      "draft",
      excerpt:     stripHtml(excerpt),
      body:        stripHtml(body),
      tags:        stripHtml(tags),
      cover_url:   sanitizeCoverUrl(cover_url),
      slug:        slugify(title),
      author_name: stripHtml(author_name) || "Admin",
      published_at: null,
      updated_at:  now,
    });

    await db.logActivity(req.user.sub, "create", "content", item.nocodb_id || item.id, `${type}: "${title}"`);
    return res.status(201).json({ success: true, item });
  } catch (err) {
    console.error("POST /admin/content:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — UPDATE
========================= */

router.patch("/admin/content/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("CONTENT ID:", id);
    const target = await findContentItem(id);
    console.log("NOCODB FILTER:", `(Id,eq,${Number(id)})`, "→ target:", target?.nocodb_id ?? target?.id ?? null);
    if (!target) return res.status(404).json({ success: false, message: "Contenido no encontrado" });

    const TEXT_FIELDS = new Set(["title", "excerpt", "body", "tags", "author_name", "slug"]);
    const allowed     = [...TEXT_FIELDS, "cover_url"];
    const fields      = {};
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      fields[key] = key === "cover_url"
        ? sanitizeCoverUrl(req.body[key])
        : stripHtml(req.body[key]);
    }
    if (req.body.type !== undefined) {
      const t = Array.isArray(req.body.type) ? req.body.type[0] : req.body.type;
      if (!CONTENT_TYPES.includes(t)) {
        return res.status(400).json({ success: false, message: `Tipo inválido. Válidos: ${CONTENT_TYPES.join(", ")}` });
      }
      fields.type = t;
    }
    if (req.body.status !== undefined) {
      const s = Array.isArray(req.body.status) ? req.body.status[0] : req.body.status;
      if (!CONTENT_STATUSES.includes(s)) {
        return res.status(400).json({ success: false, message: "Estado inválido" });
      }
      fields.status = s;
    }
    fields.updated_at = new Date().toISOString();

    const recordId = target.nocodb_id || target.id;
    const updated  = await db.update("content", recordId, fields);
    await db.logActivity(req.user.sub, "update", "content", id, `Campos: ${Object.keys(fields).join(", ")}`);
    return res.json({ success: true, item: updated });
  } catch (err) {
    console.error("PATCH /admin/content error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — PUBLISH
========================= */

router.patch("/admin/content/:id/publish", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("CONTENT ID:", id);
    const target = await findContentItem(id);
    console.log("NOCODB FILTER:", `(Id,eq,${Number(id)})`, "→ target:", target?.nocodb_id ?? target?.id ?? null);
    if (!target) return res.status(404).json({ success: false, message: "Contenido no encontrado" });

    const recordId = target.nocodb_id || target.id;
    const now      = new Date().toISOString();
    const updated  = await db.update("content", recordId, {
      status:       "published",
      published_at: target.published_at || now,
      updated_at:   now,
    });
    await db.logActivity(req.user.sub, "publish", "content", id, `"${target.title}" publicado`);
    return res.json({ success: true, item: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — DELETE
========================= */

router.delete("/admin/content/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("CONTENT ID:", id);
    const target = await findContentItem(id);
    console.log("NOCODB FILTER:", `(Id,eq,${Number(id)})`, "→ target:", target?.nocodb_id ?? target?.id ?? null);
    if (!target) return res.status(404).json({ success: false, message: "Contenido no encontrado" });

    const recordId = target.nocodb_id || target.id;
    await db.remove("content", recordId);
    await db.logActivity(req.user.sub, "delete", "content", id, `"${target.title}" eliminado`);
    return res.json({ success: true, message: "Contenido eliminado" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
