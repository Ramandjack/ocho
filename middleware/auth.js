import jwt from "jsonwebtoken";
import { db } from "../nocodb.service.js";
import { normalizeRole } from "../utils/helpers.js";

const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido en producción.");
  process.exit(1);
}

export function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;
    if (!token) {
      console.warn(`[auth] Sin token — ${req.method} ${req.path} | cookies: ${JSON.stringify(Object.keys(req.cookies || {}))}`);
      return res.status(401).json({ success: false, message: "No autenticado" });
    }
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    console.warn(`[auth] Token inválido — ${req.method} ${req.path}: ${e.message}`);
    return res.status(401).json({ success: false, message: "Sesión inválida o expirada" });
  }
}

export async function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "No autenticado" });
    const dbUser = await db.findOne("users", "uuid", req.user.sub);
    if (!dbUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    if (normalizeRole(dbUser.role) !== "admin") {
      return res.status(403).json({ success: false, message: "No autorizado" });
    }
    req.user = { ...req.user, ...dbUser, role: normalizeRole(dbUser.role) };
    next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({ success: false, message: "Error validando permisos" });
  }
}
