import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

import rateLimit from "express-rate-limit";
import { db } from "./nocodb.service.js";
import { authMiddleware, requireAdmin } from "./middleware/auth.js";
import projectsRouter from "./projects.routes.js";
import otherRouter    from "./other.routes.js";
import aiRouter       from "./ai.routes.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const clientDist = path.join(__dirname, "client", "dist");
const spaIndex   = path.join(clientDist, "index.html");
const spaReady   = fs.existsSync(spaIndex);

const PORT          = Number(process.env.PORT || 3000);
const JWT_SECRET    = process.env.JWT_SECRET  || "ocho-dev-secret-change-this";
const NODE_ENV      = process.env.NODE_ENV    || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const NOCODB_TOKEN    = process.env.NOCODB_TOKEN    || "";
const NOCODB_USERS_URL = process.env.NOCODB_USERS_URL || "";
const NOCODB_LEADS_URL = process.env.NOCODB_LEADS_URL || "";
const N8N_LEAD_WEBHOOK = process.env.N8N_LEAD_WEBHOOK || "";
const N8N_API_KEY      = process.env.N8N_API_KEY      || "";

/* =========================
   CORS
========================= */

const DEFAULT_CORS_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://www.ocho.com.ar",
  "https://ocho.com.ar",
  "https://api.ocho.com.ar"
];

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/en",     express.static(path.join(__dirname, "en")));
app.use("/nl",     express.static(path.join(__dirname, "nl")));

if (spaReady) {
  app.use("/app/assets", express.static(path.join(clientDist, "assets")));
}

/* =========================
   HELPERS
========================= */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.passwordHash;
  return safe;
}

function createToken(user) {
  return jwt.sign(
    {
      sub:   user.uuid,
      email: user.email,
      role:  normalizeRole(user.role) || "member",
      first_name: user.first_name || "",
      last_name:  user.last_name  || "",
      full_name:  user.full_name  || "",
      city:       user.city       || "",
      country:    user.country    || "",
      phone:      user.phone      || "",
      company:    user.company    || "",
      role_title: user.role_title || "",
      interest:   user.interest   || "",
      profile:    user.profile    || "",
      newsletter_consent: Boolean(user.newsletter_consent),
      data_consent:       Boolean(user.data_consent),
      status:  user.status  || "active",
      source:  user.source  || "register_form",
      segment: user.segment || "newsletter_only"
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure:   IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    maxAge:   1000 * 60 * 60 * 24 * 7,
    path: "/"
  };
}

function setAuthCookie(res, token)  { res.cookie("ocho_token", token, getCookieOptions()); }
function clearAuthCookie(res)       { res.clearCookie("ocho_token", { ...getCookieOptions(), maxAge: undefined }); }

/* =========================
   USER / LEAD HELPERS (con cache)
========================= */

function requireUsersConfig() {
  if (!NOCODB_TOKEN || !NOCODB_USERS_URL) {
    throw new Error("Faltan NOCODB_TOKEN o NOCODB_USERS_URL en .env");
  }
}

async function getAllUsers() {
  requireUsersConfig();
  return db.getAll("users");
}

async function getUserByUuid(uuid) {
  const users = await getAllUsers();
  return users.find(u => u.uuid === uuid) || null;
}

async function createUserRecord(payload) {
  requireUsersConfig();
  return db.insert("users", payload);
}

async function updateUserFieldInNoco(uuid, fields) {
  requireUsersConfig();
  const users    = await getAllUsers();
  const target   = users.find(u => u.uuid === uuid);
  if (!target)   throw new Error("Usuario no encontrado");
  const recordId = target.nocodb_id || target.id;
  if (!recordId) throw new Error("No se encontró el record id del usuario");
  return db.update("users", recordId, fields);
}

async function getAllLeads() {
  if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) return [];
  return db.getAll("leads");
}

async function createLeadRecord(payload) {
  if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) return null;
  return db.insert("leads", payload);
}

function inferUserSegment(interest) {
  switch (interest) {
    case "ai_systems":  return "ai_interest";
    case "editorial":   return "editorial_interest";
    case "ecommerce":   return "ecommerce_interest";
    case "branding":
    case "marketing":   return "marketing_leads";
    default:            return "newsletter_only";
  }
}

function inferLeadSegment(projectType) {
  switch (projectType) {
    case "ia":        return "ai_interest";
    case "ecommerce": return "ecommerce_interest";
    case "web":       return "marketing_leads";
    default:          return "high_intent";
  }
}

/* =========================
   RATE LIMITING
========================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Demasiados registros desde esta IP. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Demasiados envíos. Esperá 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* =========================
   STATIC ROUTES
========================= */

app.get("/",            (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html",  (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/login.html",    (_req, res) => spaReady ? res.redirect(302, "/app/login")    : res.sendFile(path.join(__dirname, "login.html")));
app.get("/register.html", (_req, res) => spaReady ? res.redirect(302, "/app/register") : res.sendFile(path.join(__dirname, "register.html")));
app.get("/logout.html",   (_req, res) => spaReady ? res.redirect(302, "/app/logout")   : res.sendFile(path.join(__dirname, "logout.html")));
app.get("/panel.html",    (_req, res) => spaReady ? res.redirect(302, "/app/panel")    : res.sendFile(path.join(__dirname, "panel.html")));
app.get("/admin.html",    (_req, res) => spaReady ? res.redirect(302, "/app/admin")    : res.sendFile(path.join(__dirname, "admin.html")));

/* =========================
   HEALTH
========================= */

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", environment: NODE_ENV });
});

/* =========================
   AUTH
========================= */

app.post("/api/register", registerLimiter, async (req, res) => {
  try {
    const payload  = req.body || {};
    const required = ["first_name","last_name","email","city","phone","password","interest","newsletter_consent","data_consent"];

    for (const field of required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
        return res.status(400).json({ success: false, message: `Falta el campo obligatorio: ${field}` });
      }
    }

    if (String(payload.password).length < 6) {
      return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 6 caracteres" });
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
      uuid:      crypto.randomUUID(),
      first_name: firstName,
      last_name:  lastName,
      full_name:  `${firstName} ${lastName}`.trim(),
      email,
      city:       String(payload.city).trim(),
      country:    String(payload.country || "").trim(),
      phone:      String(payload.phone).trim(),
      company:    String(payload.company || "").trim(),
      role_title: String(payload.role || "").trim(),
      interest:   String(payload.interest).trim(),
      profile:    String(payload.profile || "").trim(),
      newsletter_consent: Boolean(payload.newsletter_consent),
      data_consent:       Boolean(payload.data_consent),
      password_hash,
      role:          "member",
      status:        "active",
      source:        "register_form",
      segment:       inferUserSegment(String(payload.interest).trim()),
      last_login_at: null
    };

    const createdUser = await createUserRecord(newUser);
    const token       = createToken(createdUser);
    setAuthCookie(res, token);

    return res.status(201).json({ success: true, message: "Cuenta creada correctamente", user: sanitizeUser(createdUser) });
  } catch (error) {
    console.error("Error en /api/register:", error);
    return res.status(500).json({ success: false, message: error.message || "Error interno al registrar usuario" });
  }
});

app.post("/api/login", loginLimiter, async (req, res) => {
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

    if ((user.status || "active") === "banned") {
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

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const dbUser = await getUserByUuid(req.user.sub);
    if (!dbUser) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    return res.json({
      success: true,
      user: {
        uuid:       dbUser.uuid,
        email:      dbUser.email,
        role:       normalizeRole(dbUser.role) || "member",
        first_name: dbUser.first_name || "",
        last_name:  dbUser.last_name  || "",
        full_name:  dbUser.full_name  || "",
        city:       dbUser.city       || "",
        country:    dbUser.country    || "",
        phone:      dbUser.phone      || "",
        company:    dbUser.company    || "",
        role_title: dbUser.role_title || "",
        interest:   dbUser.interest   || "",
        profile:    dbUser.profile    || "",
        newsletter_consent: Boolean(dbUser.newsletter_consent),
        data_consent:       Boolean(dbUser.data_consent),
        status:     dbUser.status  || "active",
        source:     dbUser.source  || "register_form",
        segment:    dbUser.segment || "newsletter_only"
      }
    });
  } catch (error) {
    console.error("Error en /api/me:", error);
    return res.status(500).json({ success: false, message: "Error interno obteniendo sesión" });
  }
});

app.post("/api/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true, message: "Sesión cerrada" });
});

/* =========================
   LEADS
========================= */

app.post("/api/lead", leadLimiter, async (req, res) => {
  try {
    const payload  = req.body || {};
    const required = ["name","email","project_type","budget","message"];

    for (const field of required) {
      if (!payload[field]) {
        return res.status(400).json({ success: false, message: `Falta el campo obligatorio: ${field}` });
      }
    }

    const leadPayload = {
      name:         String(payload.name).trim(),
      email:        normalizeEmail(payload.email),
      company:      String(payload.company      || "").trim(),
      project_type: String(payload.project_type).trim(),
      budget:       String(payload.budget).trim(),
      message:      String(payload.message).trim(),
      source:       String(payload.source       || "website_contact").trim(),
      page:         String(payload.page         || "").trim(),
      user_agent:   String(payload.user_agent   || "").trim(),
      created_at:   String(payload.created_at   || new Date().toISOString()).trim(),
      stage:        "new",
      segment:      inferLeadSegment(String(payload.project_type).trim())
    };

    let n8nResult = null, nocodbResult = null;

    if (N8N_LEAD_WEBHOOK) {
      const response = await fetch(N8N_LEAD_WEBHOOK, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(N8N_API_KEY ? { "x-api-key": N8N_API_KEY } : {}) },
        body:    JSON.stringify(leadPayload)
      });
      const ct  = response.headers.get("content-type") || "";
      n8nResult = ct.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) throw new Error(typeof n8nResult === "object" ? n8nResult.message || JSON.stringify(n8nResult) : String(n8nResult));
    }

    if (NOCODB_LEADS_URL) {
      nocodbResult = await createLeadRecord(leadPayload);
    }

    return res.status(201).json({ success: true, message: "Lead enviado correctamente", lead: nocodbResult || leadPayload, relay: n8nResult });
  } catch (error) {
    console.error("Error en /api/lead:", error);
    return res.status(500).json({ success: false, message: error.message || "Error interno enviando el lead" });
  }
});

/* =========================
   ADMIN — USUARIOS
========================= */

app.get("/api/admin/users", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const users = await getAllUsers();
    return res.json({ success: true, users: users.map(sanitizeUser) });
  } catch (error) {
    console.error("Error en /api/admin/users:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/users/:uuid/role", authMiddleware, requireAdmin, async (req, res) => {
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

app.patch("/api/admin/users/:uuid/status", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid }   = req.params;
    const { status } = req.body || {};
    const allowed    = ["active","pending","banned"];
    if (!allowed.includes(String(status || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Status inválido" });
    }
    if (req.user.sub === uuid && status === "banned") {
      return res.status(403).json({ success: false, message: "No podés banearte a vos mismo" });
    }
    const updated = await updateUserFieldInNoco(uuid, { status: String(status).toLowerCase() });
    await db.logActivity(req.user.sub, "update_status", "user", uuid, `Status → ${status}`);
    return res.json({ success: true, message: `Usuario ${status}`, user: sanitizeUser(updated) });
  } catch (error) {
    console.error("Error en PATCH status:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/admin/users/:uuid", authMiddleware, requireAdmin, async (req, res) => {
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

app.post("/api/admin/users/:uuid/reset-password", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid }        = req.params;
    const { new_password } = req.body || {};
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 8 caracteres" });
    }
    const hashed = await bcrypt.hash(String(new_password), 10);
    await updateUserFieldInNoco(uuid, { password_hash: hashed });
    await db.logActivity(req.user.sub, "reset_password", "user", uuid, "Contraseña reseteada por admin");
    return res.json({ success: true, message: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error en reset-password:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ADMIN — LEADS
========================= */

app.get("/api/admin/leads", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const leads = await getAllLeads();
    return res.json({ success: true, leads });
  } catch (error) {
    console.error("Error en /api/admin/leads:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/leads/:id/stage", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id }    = req.params;
    const { stage } = req.body || {};
    const allowed   = ["new","contacted","qualified","closed"];
    if (!allowed.includes(String(stage || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Stage inválido" });
    }
    if (!NOCODB_LEADS_URL) return res.status(503).json({ success: false, message: "NocoDB leads no configurado" });
    const updated = await db.update("leads", id, { stage: String(stage).toLowerCase() });
    return res.json({ success: true, message: "Stage actualizado", lead: updated });
  } catch (error) {
    console.error("Error en PATCH lead stage:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ROUTERS
========================= */

app.use("/api", projectsRouter);
app.use("/api", otherRouter);
app.use("/api", aiRouter);

/* =========================
   REACT SPA
========================= */

if (spaReady) {
  app.get(/^\/app(\/.*)?$/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(spaIndex);
  });
}

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
  console.log(`Entorno: ${NODE_ENV}`);
  if (spaReady) console.log(`SPA React: http://127.0.0.1:${PORT}/app/login`);
});
