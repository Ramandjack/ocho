import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../nocodb.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimits.js";
import {
  normalizeEmail, normalizeRole, sanitizeUser,
  createToken, setAuthCookie, clearAuthCookie, inferUserSegment,
} from "../utils/helpers.js";
import {
  getAllUsers, createUserRecord, updateUserFieldInNoco,
} from "../services/users.service.js";

const router = express.Router();

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const payload  = req.body || {};
    const required = ["first_name","last_name","email","city","phone","password","interest","newsletter_consent","data_consent"];

    for (const field of required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
        return res.status(400).json({ success: false, message: `Falta el campo obligatorio: ${field}` });
      }
    }

    if (String(payload.password).length < 8) {
      return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const email = normalizeEmail(payload.email);
    const users = await getAllUsers();
    if (users.find(u => normalizeEmail(u.email) === email)) {
      return res.status(409).json({ success: false, message: "Ya existe una cuenta con ese email" });
    }

    const password_hash = await bcrypt.hash(String(payload.password), 10);
    const firstName     = String(payload.first_name).trim();
    const lastName      = String(payload.last_name).trim();

    const newUser = {
      uuid:               crypto.randomUUID(),
      first_name:         firstName,
      last_name:          lastName,
      full_name:          `${firstName} ${lastName}`.trim(),
      email,
      city:               String(payload.city).trim(),
      country:            String(payload.country || "").trim(),
      phone:              String(payload.phone).trim(),
      company:            String(payload.company || "").trim(),
      role_title:         String(payload.role || "").trim(),
      interest:           String(payload.interest).trim(),
      profile:            String(payload.profile || "").trim(),
      newsletter_consent: Boolean(payload.newsletter_consent),
      data_consent:       Boolean(payload.data_consent),
      password_hash,
      role:               "client",
      status:             "pending",
      source:             "register_form",
      segment:            inferUserSegment(String(payload.interest).trim()),
      last_login_at:      null,
    };

    await createUserRecord(newUser);

    // No se emite cookie: el acceso queda bloqueado hasta aprobación del admin
    return res.status(201).json({ success: true, pending: true, message: "Tu solicitud fue recibida. Un administrador revisará tu cuenta pronto." });
  } catch (error) {
    console.error("Error en /api/register:", error);
    return res.status(500).json({ success: false, message: error.message || "Error interno al registrar usuario" });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email y contraseña son obligatorios" });
    }

    const users = await getAllUsers();
    const user  = users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
    if (!user) return res.status(401).json({ success: false, message: "Credenciales inválidas" });

    const hash = user.password_hash || user.passwordHash;
    if (!hash)  return res.status(401).json({ success: false, message: "El usuario no tiene contraseña válida" });

    const valid = await bcrypt.compare(String(password), hash);
    if (!valid) return res.status(401).json({ success: false, message: "Credenciales inválidas" });

    const userStatus = user.status || "active";
    if (userStatus === "pending") {
      return res.status(403).json({ success: false, message: "Tu cuenta está pendiente de aprobación por un administrador." });
    }
    if (userStatus === "rejected") {
      return res.status(403).json({ success: false, message: "Tu solicitud de acceso fue rechazada. Contactá al administrador." });
    }
    if (userStatus === "banned") {
      return res.status(403).json({ success: false, message: "Tu cuenta ha sido suspendida. Contactá al administrador." });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    updateUserFieldInNoco(user.uuid, { last_login_at: new Date().toISOString() }).catch(() => {});

    return res.json({ success: true, message: "Login correcto", user: sanitizeUser(user) });
  } catch (error) {
    console.error("Error en /api/login:", error);
    return res.status(500).json({ success: false, message: error.message || "Error interno al iniciar sesión" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const users  = await getAllUsers();
    const dbUser = users.find(u => u.uuid === req.user.sub) || null;
    if (!dbUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    // Admins siempre pasan; no-admins deben tener status active
    if (normalizeRole(dbUser.role) !== "admin") {
      const st = dbUser.status || "active";
      if (st === "pending")  return res.status(403).json({ success: false, message: "Tu cuenta está pendiente de aprobación por un administrador." });
      if (st === "rejected") return res.status(403).json({ success: false, message: "Tu solicitud de acceso fue rechazada. Contactá al administrador." });
      if (st === "banned")   return res.status(403).json({ success: false, message: "Tu cuenta ha sido suspendida. Contactá al administrador." });
    }

    return res.json({
      success: true,
      user: {
        uuid:               dbUser.uuid,
        email:              dbUser.email,
        role:               normalizeRole(dbUser.role) || "member",
        first_name:         dbUser.first_name || "",
        last_name:          dbUser.last_name  || "",
        full_name:          dbUser.full_name  || "",
        city:               dbUser.city       || "",
        country:            dbUser.country    || "",
        phone:              dbUser.phone      || "",
        company:            dbUser.company    || "",
        role_title:         dbUser.role_title || "",
        interest:           dbUser.interest   || "",
        profile:            dbUser.profile    || "",
        newsletter_consent: Boolean(dbUser.newsletter_consent),
        data_consent:       Boolean(dbUser.data_consent),
        status:             dbUser.status  || "active",
        source:             dbUser.source  || "register_form",
        segment:            dbUser.segment || "newsletter_only",
      },
    });
  } catch (error) {
    console.error("Error en /api/me:", error);
    return res.status(500).json({ success: false, message: "Error interno obteniendo sesión" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true, message: "Sesión cerrada" });
});

export default router;
