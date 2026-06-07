import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Usa ipKeyGenerator para normalizar IPv4/IPv6 y evitar ERR_ERL_KEY_GEN_IPV6.
// Depende de app.set('trust proxy', 1) en server.js para X-Forwarded-For en Render.
const byIp = (req) => ipKeyGenerator(req);

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: byIp,
  message: { success: false, message: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: byIp,
  message: { success: false, message: "Demasiados registros desde esta IP. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: byIp,
  message: { success: false, message: "Demasiados envíos. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Catch-all aplicado a toda la API. Protege rutas que no tienen limiter propio.
// Los limiters específicos (loginLimiter, etc.) se aplican encima con límites más estrictos.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: byIp,
  skip: (req) => req.path === "/health",
  message: { success: false, message: "Demasiadas solicitudes. Esperá un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});
