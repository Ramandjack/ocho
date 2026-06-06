import rateLimit from "express-rate-limit";

// Usa la IP real del cliente. Depende de app.set('trust proxy', 1) en server.js
// para que req.ip refleje X-Forwarded-For detrás del proxy de Render.
const byIp = (req) => req.ip;

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
