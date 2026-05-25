import express from "express";
import crypto  from "crypto";
import { db }  from "./nocodb.service.js";
import { authMiddleware, requireAdmin } from "./middleware/auth.js";

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
      uuid:        crypto.randomUUID(),
      title:       String(title).trim(),
      type,
      status:      "draft",
      excerpt:     String(excerpt).trim(),
      body:        String(body).trim(),
      tags:        String(tags).trim(),
      cover_url:   String(cover_url).trim(),
      slug:        slugify(title),
      author_uuid: req.user.sub,
      author_name: String(author_name).trim() || "Admin",
      published_at: null,
      updated_at:  now,
    });

    await db.logActivity(req.user.sub, "create", "content", item.uuid || item.id, `${type}: "${title}"`);
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
    const items  = await db.getAll("content");
    const target = items.find(c => String(c.uuid) === id || String(c.nocodb_id || c.id) === id);
    if (!target) return res.status(404).json({ success: false, message: "Contenido no encontrado" });

    const allowed = ["title", "type", "excerpt", "body", "tags", "cover_url", "author_name", "slug"];
    const fields  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) fields[key] = req.body[key];
    }
    if (req.body.status !== undefined) {
      if (!CONTENT_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ success: false, message: "Estado inválido" });
      }
      fields.status = req.body.status;
    }
    fields.updated_at = new Date().toISOString();

    const recordId = target.nocodb_id || target.id;
    const updated  = await db.update("content", recordId, fields);
    await db.logActivity(req.user.sub, "update", "content", id, `Campos: ${Object.keys(fields).join(", ")}`);
    return res.json({ success: true, item: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   ADMIN — PUBLISH
========================= */

router.patch("/admin/content/:id/publish", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const items  = await db.getAll("content");
    const target = items.find(c => String(c.uuid) === id || String(c.nocodb_id || c.id) === id);
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
    const items  = await db.getAll("content");
    const target = items.find(c => String(c.uuid) === id || String(c.nocodb_id || c.id) === id);
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
