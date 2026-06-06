import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ── Admin ── */

router.get("/admin/modules", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const modules = await db.getAll("modules");
    return res.json({ success: true, modules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/modules", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { key, label, description, icon } = req.body || {};
    if (!key || !label) return res.status(400).json({ success: false, message: "key y label obligatorios" });

    const module = await db.insert("modules", {
      key:         String(key).trim().toLowerCase(),
      label:       String(label).trim(),
      description: String(description || "").trim(),
      icon:        String(icon || "").trim(),
      active:      true,
    });
    await db.logActivity(req.user.sub, "create", "module", module.id, `Módulo: "${key}"`);
    return res.status(201).json({ success: true, module });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/admin/modules/:id/toggle", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id }   = req.params;
    const current  = await db.getById("modules", id);
    const newActive = !current.active;
    const updated  = await db.update("modules", id, { active: newActive });
    await db.logActivity(req.user.sub, "toggle", "module", id, `active → ${newActive}`);
    return res.json({ success: true, module: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/modules/assign", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuid, module_key, enabled = true } = req.body || {};
    if (!user_uuid || !module_key) {
      return res.status(400).json({ success: false, message: "user_uuid y module_key obligatorios" });
    }

    const existing = await db.getWhere(
      "user_modules",
      `(user_uuid,eq,${user_uuid})~and(module_key,eq,${module_key})`
    );

    const result = existing.length
      ? await db.update("user_modules", existing[0].nocodb_id || existing[0].id, { enabled })
      : await db.insert("user_modules", { user_uuid, module_key, enabled });

    await db.logActivity(req.user.sub, "assign_module", "module", module_key, `Usuario ${user_uuid} → enabled: ${enabled}`);
    return res.json({ success: true, user_module: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ── User ── */

router.get("/user/modules", authMiddleware, async (req, res) => {
  try {
    const userUuid     = req.user.sub;
    const allModules   = await db.getAll("modules");
    const activeGlobal = allModules.filter(m => m.active);

    const userOverrides = await db.getWhere("user_modules", `(user_uuid,eq,${userUuid})`);
    const overrideMap   = {};
    userOverrides.forEach(o => { overrideMap[o.module_key] = o.enabled; });

    const modules = activeGlobal
      .map(m => ({ ...m, enabled: overrideMap[m.key] !== undefined ? overrideMap[m.key] : true }))
      .filter(m => m.enabled);

    return res.json({ success: true, modules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
