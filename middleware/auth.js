import jwt from "jsonwebtoken";
import { db } from "../services/nocodb.service.js";
import { normalizeRole } from "../utils/helpers.js";

const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido en producción.");
  process.exit(1);
}

// Verifica el JWT y carga los datos frescos del usuario desde NocoDB.
// req.user nunca contiene datos del payload JWT — siempre viene de la base de datos.
export async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;
    if (!token) {
      console.warn(`[auth] Sin token — ${req.method} ${req.path}`);
      return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    const dbUser = await db.findOne("users", "uuid", payload.sub);
    if (!dbUser) {
      console.warn(`[auth] UUID no encontrado en DB — ${req.method} ${req.path}`);
      return res.status(401).json({ success: false, message: "Sesión inválida" });
    }

    // Bloqueo inmediato por status — no depende de la expiración del JWT
    const status = dbUser.status || "active";
    const STATUS_MESSAGES = {
      banned:   "Tu cuenta ha sido suspendida. Contactá al administrador.",
      rejected: "Tu solicitud de acceso fue rechazada.",
      pending:  "Tu cuenta está pendiente de aprobación por un administrador.",
    };
    if (STATUS_MESSAGES[status]) {
      console.warn(`[auth] Acceso bloqueado — status:${status} — ${req.method} ${req.path}`);
      return res.status(403).json({ success: false, message: STATUS_MESSAGES[status] });
    }

    // Invalidación explícita por acción de admin (reset de contraseña, revocación manual).
    // Requiere columna `tokens_valid_from` (DateTime, nullable) en la tabla users de NocoDB.
    // Si la columna no existe o el valor es null, el check es un no-op.
    if (dbUser.tokens_valid_from) {
      const validFrom = new Date(dbUser.tokens_valid_from).getTime();
      if (payload.iat * 1000 < validFrom) {
        console.warn(`[auth] Token anterior a invalidación — uuid:${dbUser.uuid} — ${req.method} ${req.path}`);
        return res.status(401).json({ success: false, message: "Sesión expirada. Iniciá sesión nuevamente." });
      }
    }

    req.user = {
      ...dbUser,
      sub:  dbUser.uuid,
      role: normalizeRole(dbUser.role),
    };

    next();
  } catch (e) {
    console.warn(`[auth] Token inválido — ${req.method} ${req.path}: ${e.message}`);
    return res.status(401).json({ success: false, message: "Sesión inválida o expirada" });
  }
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function csrfCheck(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  // Rutas públicas (sin cookie de sesión) quedan exentas
  if (!req.cookies?.ocho_token) return next();

  const csrfCookie = req.cookies?.ocho_csrf;
  const csrfHeader = req.headers["x-csrf-token"];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    console.warn(`[csrf] Token inválido — ${req.method} ${req.path}`);
    return res.status(403).json({ success: false, message: "CSRF token inválido" });
  }
  next();
}

// authMiddleware ya cargó req.user desde DB — solo verificamos el rol.
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: "No autenticado" });
  if (req.user.role !== "admin") {
    console.warn(`[auth] Acceso admin denegado — role:${req.user.role} ${req.method} ${req.path}`);
    return res.status(403).json({ success: false, message: "No autorizado" });
  }
  next();
}
