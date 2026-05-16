import jwt from "jsonwebtoken";
import { db } from "../nocodb.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";

function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

export function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;
    if (!token) return res.status(401).json({ success: false, message: "No autenticado" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
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
