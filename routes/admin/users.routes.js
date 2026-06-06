import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../../middleware/auth.js";
import { sanitizeUser } from "../../utils/helpers.js";
import { getAllUsers, updateUserFieldInNoco } from "../../services/users.service.js";

const router = express.Router();

router.get("/admin/users", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const users = await getAllUsers();
    return res.json({ success: true, users: users.map(sanitizeUser) });
  } catch (error) {
    console.error("Error en /api/admin/users:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/users/:uuid/role", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { role  } = req.body || {};
    const allowed   = ["admin","member","client"];
    if (!allowed.includes(String(role || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Rol inválido" });
    }
    const updated = await updateUserFieldInNoco(uuid, { role: String(role).toLowerCase() });
    await db.logActivity(req.user.sub, "update_role", "user", uuid, `Rol → ${role}`);
    return res.json({ success: true, message: "Rol actualizado", user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Error en PATCH role:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/users/:uuid/approve", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const updated  = await updateUserFieldInNoco(uuid, {
      status:      "active",
      approved_at: new Date().toISOString(),
      approved_by: req.user.sub,
    });
    await db.logActivity(req.user.sub, "approve_user", "user", uuid, "Usuario aprobado");
    console.log(`[admin] approve user ${uuid} by ${req.user.sub}`);
    return res.json({ success: true, message: "Usuario aprobado", user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Error en approve:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/users/:uuid/reject", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const updated  = await updateUserFieldInNoco(uuid, {
      status:            "rejected",
      tokens_valid_from: new Date().toISOString(),
    });
    await db.logActivity(req.user.sub, "reject_user", "user", uuid, "Usuario rechazado");
    console.log(`[admin] reject user ${uuid} by ${req.user.sub}`);
    return res.json({ success: true, message: "Usuario rechazado", user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Error en reject:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/users/:uuid/status", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid }   = req.params;
    const { status } = req.body || {};
    const allowed    = ["active", "pending", "banned", "rejected"];
    if (!allowed.includes(String(status || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Status inválido" });
    }
    if (req.user.sub === uuid && status === "banned") {
      return res.status(403).json({ success: false, message: "No podés banearte a vos mismo" });
    }
    const INVALIDATING_STATUSES = new Set(["banned", "rejected"]);
    const fields = { status: String(status).toLowerCase() };
    if (INVALIDATING_STATUSES.has(fields.status)) {
      fields.tokens_valid_from = new Date().toISOString();
    }
    const updated = await updateUserFieldInNoco(uuid, fields);
    await db.logActivity(req.user.sub, "update_status", "user", uuid, `Status → ${status}`);
    return res.json({ success: true, message: `Usuario ${status}`, user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Error en PATCH status:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/admin/users/:uuid", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    if (req.user.sub === uuid) {
      return res.status(403).json({ success: false, message: "No podés eliminar tu propia cuenta" });
    }
    const users    = await getAllUsers();
    const target   = users.find(u => u.uuid === uuid);
    if (!target)   return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    const recordId = target.nocodb_id || target.id;
    if (!recordId) return res.status(422).json({ success: false, message: "No se encontró el record id" });
    await db.remove("users", recordId);
    await db.logActivity(req.user.sub, "delete", "user", uuid, "Usuario eliminado");
    return res.json({ success: true, message: "Usuario eliminado", uuid });
  } catch (error) {
    console.error("Error en DELETE user:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/users/:uuid/reset-password", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid }        = req.params;
    const { new_password } = req.body || {};
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 8 caracteres" });
    }
    const hashed = await bcrypt.hash(String(new_password), 10);
    await updateUserFieldInNoco(uuid, {
      password_hash:     hashed,
      tokens_valid_from: new Date().toISOString(),
    });
    await db.logActivity(req.user.sub, "reset_password", "user", uuid, "Contraseña reseteada por admin");
    return res.json({ success: true, message: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error en reset-password:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
