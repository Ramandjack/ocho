import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Demasiados registros desde esta IP. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Demasiados envíos. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});
