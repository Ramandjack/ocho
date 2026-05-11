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

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDist = path.join(__dirname, "client", "dist");
const spaIndex = path.join(clientDist, "index.html");
const spaReady = fs.existsSync(spaIndex);

const PORT       = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";
const NODE_ENV   = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

/* =========================
   NOCODB CONFIG
========================= */

const NOCODB_TOKEN          = process.env.NOCODB_TOKEN          || "";
const NOCODB_USERS_URL      = process.env.NOCODB_USERS_URL      || "";
const NOCODB_LEADS_URL      = process.env.NOCODB_LEADS_URL      || "";
const NOCODB_PROJECTS_URL   = process.env.NOCODB_PROJECTS_URL   || "";
const NOCODB_USER_PROJECTS_URL = process.env.NOCODB_USER_PROJECTS_URL || "";
const NOCODB_TASKS_URL      = process.env.NOCODB_TASKS_URL      || "";
const NOCODB_NOTIFICATIONS_URL = process.env.NOCODB_NOTIFICATIONS_URL || "";
const NOCODB_MODULES_URL    = process.env.NOCODB_MODULES_URL    || "";
const NOCODB_USER_MODULES_URL  = process.env.NOCODB_USER_MODULES_URL  || "";
const NOCODB_ACTIVITY_LOG_URL  = process.env.NOCODB_ACTIVITY_LOG_URL  || "";

const N8N_LEAD_WEBHOOK = process.env.N8N_LEAD_WEBHOOK || "";
const N8N_API_KEY      = process.env.N8N_API_KEY      || "";

/* =========================
   CORS
========================= */

const DEFAULT_CORS_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
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
   HELPERS GENERALES
========================= */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

function sanitizeUser(user) {
  const safeUser = { ...user };
  delete safeUser.password_hash;
  delete safeUser.passwordHash;
  return safeUser;
}

function createToken(user) {
  return jwt.sign(
    {
      sub:  user.uuid,
      email: user.email,
      role:  normalizeRole(user.role) || "member",
      first_name: user.first_name || "",
      last_name:  user.last_name  || "",
      full_name:  user.full_name  || "",
      city:    user.city    || "",
      country: user.country || "",
      phone:   user.phone   || "",
      company: user.company || "",
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

function setAuthCookie(res, token) {
  res.cookie("ocho_token", token, getCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie("ocho_token", {
    httpOnly: true,
    secure:   IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/"
  });
}

/* =========================
   NOCODB BASE FETCH
========================= */

async function ncdbFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "xc-token": NOCODB_TOKEN,
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      typeof data === "object" && data !== null
        ? data.msg || data.message || JSON.stringify(data)
        : String(data)
    );
  }

  return data;
}

function extractRecords(result) {
  if (Array.isArray(result))          return result;
  if (Array.isArray(result?.records)) return result.records;
  if (Array.isArray(result?.list))    return result.list;
  if (Array.isArray(result?.data))    return result.data;
  return [];
}

function flattenRecord(record) {
  if (!record || typeof record !== "object") return {};
  if (record.fields && typeof record.fields === "object") {
    return {
      ...(record.id ? { nocodb_record_id: record.id } : {}),
      ...record.fields
    };
  }
  return record;
}

/* =========================
   NOCODB SERVICE (db)
========================= */

const TABLES = {
  users:         NOCODB_USERS_URL,
  leads:         NOCODB_LEADS_URL,
  projects:      NOCODB_PROJECTS_URL,
  user_projects: NOCODB_USER_PROJECTS_URL,
  tasks:         NOCODB_TASKS_URL,
  notifications: NOCODB_NOTIFICATIONS_URL,
  modules:       NOCODB_MODULES_URL,
  user_modules:  NOCODB_USER_MODULES_URL,
  activity_log:  NOCODB_ACTIVITY_LOG_URL,
};

function tableUrl(table) {
  const url = TABLES[table];
  if (!url) throw new Error(`Tabla desconocida: ${table}`);
  return url.replace(/\/$/, "");
}

function flattenDb(record) {
  if (!record || typeof record !== "object") return {};
  if (record.fields && typeof record.fields === "object") {
    return { id: record.id, nocodb_id: record.id, ...record.fields };
  }
  return record;
}

function extractList(result) {
  if (Array.isArray(result))          return result.map(flattenDb);
  if (Array.isArray(result?.records)) return result.records.map(flattenDb);
  if (Array.isArray(result?.list))    return result.list.map(flattenDb);
  return [];
}

const db = {
  async getAll(table, params = {}) {
    const base  = tableUrl(table);
    const query = new URLSearchParams({ limit: 1000, ...params }).toString();
    const result = await ncdbFetch(`${base}?${query}`);
    return extractList(result);
  },

  async getWhere(table, where) {
    const base  = tableUrl(table);
    const query = new URLSearchParams({ where, limit: 1000 }).toString();
    const result = await ncdbFetch(`${base}?${query}`);
    return extractList(result);
  },

  async getById(table, id) {
    const base   = tableUrl(table);
    const result = await ncdbFetch(`${base}/${id}`);
    return flattenDb(result);
  },

  async insert(table, fields) {
    const base   = tableUrl(table);
    const result = await ncdbFetch(base, {
      method: "POST",
      body: JSON.stringify([{ fields }]),
    });
    return extractList(result)[0] || fields;
  },

  async update(table, id, fields) {
    const base   = tableUrl(table);
    const result = await ncdbFetch(`${base}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    return flattenDb(result);
  },

  async remove(table, id) {
    const base = tableUrl(table);
    await ncdbFetch(`${base}/${id}`, { method: "DELETE" });
    return { deleted: true, id };
  },

  async findOne(table, field, value) {
    const where   = `(${field},eq,${value})`;
    const records = await db.getWhere(table, where);
    return records[0] || null;
  },

  async logActivity(adminUuid, action, entity, entityId, detail = "") {
    try {
      await db.insert("activity_log", {
        admin_uuid: adminUuid,
        action,
        entity,
        entity_id: String(entityId),
        detail,
      });
    } catch (err) {
      console.warn("activity_log error:", err.message);
    }
  },

  async sendNotification(userUuid, type, title, message, link = "") {
    try {
      await db.insert("notifications", {
        user_uuid: userUuid,
        type,
        title,
        message,
        read: false,
        link,
      });
    } catch (err) {
      console.warn("notification error:", err.message);
    }
  },

  async sendNotificationToMany(userUuids, type, title, message, link = "") {
    await Promise.allSettled(
      userUuids.map(uuid => db.sendNotification(uuid, type, title, message, link))
    );
  },
};

/* =========================
   MIDDLEWARE AUTH
========================= */

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;
    if (!token) return res.status(401).json({ success: false, message: "No autenticado" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Sesión inválida o expirada" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "No autenticado" });

    const dbUser = await getUserByUuid(req.user.sub);
    if (!dbUser)   return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    if (normalizeRole(dbUser.role) !== "admin") {
      return res.status(403).json({ success: false, message: "No autorizado" });
    }

    req.user = {
      ...req.user,
      ...dbUser,
      role: normalizeRole(dbUser.role) || "member"
    };
    next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({ success: false, message: "Error validando permisos" });
  }
}

/* =========================
   USERS HELPERS
========================= */

function requireUsersConfig() {
  if (!NOCODB_TOKEN || !NOCODB_USERS_URL) {
    throw new Error("Faltan NOCODB_TOKEN o NOCODB_USERS_URL en .env");
  }
}

async function getAllUsers() {
  requireUsersConfig();
  const sep = NOCODB_USERS_URL.includes("?") ? "&" : "?";
  const result = await ncdbFetch(`${NOCODB_USERS_URL}${sep}limit=1000`, { method: "GET" });
  return extractRecords(result).map(flattenRecord);
}

async function getUserByUuid(uuid) {
  const users = await getAllUsers();
  return users.find(u => u.uuid === uuid) || null;
}

async function createUserRecord(payload) {
  requireUsersConfig();
  const result = await ncdbFetch(NOCODB_USERS_URL, {
    method: "POST",
    body: JSON.stringify([{ fields: payload }])
  });
  return extractRecords(result).map(flattenRecord)[0] || payload;
}

async function getAllLeads() {
  if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) return [];
  const sep = NOCODB_LEADS_URL.includes("?") ? "&" : "?";
  const result = await ncdbFetch(`${NOCODB_LEADS_URL}${sep}limit=1000`, { method: "GET" });
  return extractRecords(result).map(flattenRecord);
}

async function createLeadRecord(payload) {
  if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) return null;
  const result = await ncdbFetch(NOCODB_LEADS_URL, {
    method: "POST",
    body: JSON.stringify([{ fields: payload }])
  });
  return extractRecords(result).map(flattenRecord)[0] || payload;
}

async function updateUserFieldInNoco(uuid, fields) {
  requireUsersConfig();
  const users    = await getAllUsers();
  const target   = users.find(u => u.uuid === uuid);
  if (!target)   throw new Error("Usuario no encontrado");
  const recordId = target.nocodb_record_id || target.Id || target.id;
  if (!recordId) throw new Error("No se encontró el record id del usuario");
  const baseUrl  = NOCODB_USERS_URL.replace(/\/$/, "");
  const result   = await ncdbFetch(`${baseUrl}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });
  return flattenRecord(result);
}

function inferUserSegment(interest) {
  switch (interest) {
    case "ai_systems": return "ai_interest";
    case "editorial":  return "editorial_interest";
    case "ecommerce":  return "ecommerce_interest";
    case "branding":
    case "marketing":  return "marketing_leads";
    default:           return "newsletter_only";
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
   STATIC ROUTES
========================= */

app.get("/",            (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html",  (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/login.html", (req, res) => {
  if (spaReady) return res.redirect(302, "/app/login");
  res.sendFile(path.join(__dirname, "login.html"));
});
app.get("/register.html", (req, res) => {
  if (spaReady) return res.redirect(302, "/app/register");
  res.sendFile(path.join(__dirname, "register.html"));
});
app.get("/logout.html", (req, res) => {
  if (spaReady) return res.redirect(302, "/app/logout");
  res.sendFile(path.join(__dirname, "logout.html"));
});
app.get("/panel.html", (req, res) => {
  if (spaReady) return res.redirect(302, "/app/panel");
  res.sendFile(path.join(__dirname, "panel.html"));
});
app.get("/admin.html", (req, res) => {
  if (spaReady) return res.redirect(302, "/app/admin");
  res.sendFile(path.join(__dirname, "admin.html"));
});

/* =========================
   HEALTH
========================= */

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", environment: NODE_ENV });
});

/* =========================
   AUTH API
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const payload = req.body || {};
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
      city:     String(payload.city).trim(),
      country:  String(payload.country || "").trim(),
      phone:    String(payload.phone).trim(),
      company:  String(payload.company || "").trim(),
      role_title: String(payload.role || "").trim(),
      interest:   String(payload.interest).trim(),
      profile:    String(payload.profile || "").trim(),
      newsletter_consent: Boolean(payload.newsletter_consent),
      data_consent:       Boolean(payload.data_consent),
      password_hash,
      role:     "member",
      status:   "active",
      source:   "register_form",
      segment:  inferUserSegment(String(payload.interest).trim()),
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

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email y contraseña son obligatorios" });
    }

    const users = await getAllUsers();
    const user  = users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
    if (!user) return res.status(401).json({ success: false, message: "Credenciales inválidas" });

    const hash = user.password_hash || user.passwordHash;
    if (!hash) return res.status(401).json({ success: false, message: "El usuario no tiene contraseña válida" });

    const valid = await bcrypt.compare(String(password), hash);
    if (!valid) return res.status(401).json({ success: false, message: "Credenciales inválidas" });

    // Bloquear usuarios baneados
    if ((user.status || "active") === "banned") {
      return res.status(403).json({ success: false, message: "Tu cuenta ha sido suspendida. Contactá al administrador." });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

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
   LEADS API
========================= */

app.post("/api/lead", async (req, res) => {
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
        method: "POST",
        headers: { "Content-Type": "application/json", ...(N8N_API_KEY ? { "x-api-key": N8N_API_KEY } : {}) },
        body: JSON.stringify(leadPayload)
      });
      const ct = response.headers.get("content-type") || "";
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

app.get("/api/admin/leads", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const leads = await getAllLeads();
    return res.json({ success: true, leads });
  } catch (error) {
    console.error("Error en /api/admin/leads:", error);
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
    const recordId = target.nocodb_record_id || target.Id || target.id;
    if (!recordId) return res.status(422).json({ success: false, message: "No se encontró el record id" });
    const baseUrl  = NOCODB_USERS_URL.replace(/\/$/, "");
    await ncdbFetch(`${baseUrl}/${recordId}`, { method: "DELETE" });
    await db.logActivity(req.user.sub, "delete", "user", uuid, `Usuario eliminado`);
    return res.json({ success: true, message: "Usuario eliminado", uuid });
  } catch (error) {
    console.error("Error en DELETE user:", error);
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
    const base   = NOCODB_LEADS_URL.replace(/\/$/, "");
    const result = await ncdbFetch(`${base}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { stage: String(stage).toLowerCase() } })
    });
    return res.json({ success: true, message: "Stage actualizado", lead: flattenRecord(result) });
  } catch (error) {
    console.error("Error en PATCH lead stage:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admin/activity", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const logs   = await db.getAll("activity_log");
    const sorted = logs.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));
    return res.json({ success: true, logs: sorted.slice(0, 100) });
  } catch (error) {
    console.error("Error en /api/admin/activity:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ADMIN — PROYECTOS
========================= */

app.get("/api/admin/projects", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const projects = await db.getAll("projects");
    return res.json({ success: true, projects });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admin/projects", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, description, status, type, due_date } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: "El título es obligatorio" });

    const project = await db.insert("projects", {
      title:       String(title).trim(),
      description: String(description || "").trim(),
      status:      status   || "draft",
      type:        type     || "web",
      created_by:  req.user.sub,
      due_date:    due_date || null,
    });

    await db.logActivity(req.user.sub, "create", "project", project.id, `Proyecto: "${title}"`);
    return res.status(201).json({ success: true, project });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/projects/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, type, due_date } = req.body || {};
    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status      !== undefined) fields.status      = status;
    if (type        !== undefined) fields.type        = type;
    if (due_date    !== undefined) fields.due_date    = due_date;
    if (!Object.keys(fields).length) return res.status(400).json({ success: false, message: "Sin campos para actualizar" });

    const updated = await db.update("projects", id, fields);

    // Notificar a usuarios asignados si cambia el status
    if (fields.status) {
      const assignments = await db.getWhere("user_projects", `(project_id,eq,${id})`);
      const uuids = assignments.map(a => a.user_uuid).filter(Boolean);
      if (uuids.length) {
        await db.sendNotificationToMany(uuids, "project", "Proyecto actualizado", `Estado del proyecto: ${fields.status}`, "/app/panel#projects");
      }
    }

    await db.logActivity(req.user.sub, "update", "project", id, JSON.stringify(fields));
    return res.json({ success: true, project: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/admin/projects/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const assignments = await db.getWhere("user_projects", `(project_id,eq,${id})`);
    await Promise.allSettled(assignments.map(a => db.remove("user_projects", a.nocodb_id || a.id)));
    await db.remove("projects", id);
    await db.logActivity(req.user.sub, "delete", "project", id, "Proyecto eliminado");
    return res.json({ success: true, message: "Proyecto eliminado", id });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admin/projects/:id/assign", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_uuids, permission = "viewer" } = req.body || {};
    if (!Array.isArray(user_uuids) || !user_uuids.length) {
      return res.status(400).json({ success: false, message: "user_uuids debe ser un array" });
    }

    const results = [];
    for (const user_uuid of user_uuids) {
      const existing = await db.getWhere("user_projects", `(user_uuid,eq,${user_uuid})~and(project_id,eq,${id})`);
      if (existing.length) {
        results.push(await db.update("user_projects", existing[0].nocodb_id || existing[0].id, { permission }));
      } else {
        results.push(await db.insert("user_projects", { user_uuid, project_id: Number(id), permission }));
        await db.sendNotification(user_uuid, "project", "Nuevo proyecto asignado", `Se te asignó un proyecto con permiso: ${permission}`, "/app/panel#projects");
      }
    }

    await db.logActivity(req.user.sub, "assign", "project", id, `Usuarios: ${user_uuids.join(", ")}`);
    return res.json({ success: true, assignments: results });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/admin/projects/:id/assign/:userUuid", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, userUuid } = req.params;
    const existing = await db.getWhere("user_projects", `(user_uuid,eq,${userUuid})~and(project_id,eq,${id})`);
    if (!existing.length) return res.status(404).json({ success: false, message: "Asignación no encontrada" });
    await db.remove("user_projects", existing[0].nocodb_id || existing[0].id);
    await db.logActivity(req.user.sub, "unassign", "project", id, `Usuario removido: ${userUuid}`);
    return res.json({ success: true, message: "Usuario removido del proyecto" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ADMIN — TAREAS
========================= */

app.get("/api/admin/tasks", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const tasks = await db.getAll("tasks");
    return res.json({ success: true, tasks });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admin/tasks", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, description, status, priority, project_id, assigned_to, due_date } = req.body || {};
    if (!title) return res.status(400).json({ success: false, message: "Título obligatorio" });

    const task = await db.insert("tasks", {
      title:       String(title).trim(),
      description: String(description || "").trim(),
      status:      status   || "pending",
      priority:    priority || "medium",
      project_id:  project_id ? Number(project_id) : null,
      assigned_to: assigned_to || null,
      due_date:    due_date    || null,
    });

    if (assigned_to) {
      await db.sendNotification(assigned_to, "task", "Nueva tarea asignada", `Tarea: "${title}"`, "/app/panel#tasks");
    }

    await db.logActivity(req.user.sub, "create", "task", task.id, `Tarea: "${title}"`);
    return res.status(201).json({ success: true, task });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigned_to, due_date } = req.body || {};
    const fields = {};
    if (title       !== undefined) fields.title       = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status      !== undefined) fields.status      = status;
    if (priority    !== undefined) fields.priority    = priority;
    if (assigned_to !== undefined) fields.assigned_to = assigned_to;
    if (due_date    !== undefined) fields.due_date    = due_date;

    const updated = await db.update("tasks", id, fields);

    if (fields.assigned_to) {
      await db.sendNotification(fields.assigned_to, "task", "Tarea actualizada", `Actualización en tu tarea`, "/app/panel#tasks");
    }

    await db.logActivity(req.user.sub, "update", "task", id, JSON.stringify(fields));
    return res.json({ success: true, task: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/admin/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.remove("tasks", id);
    await db.logActivity(req.user.sub, "delete", "task", id, "Tarea eliminada");
    return res.json({ success: true, message: "Tarea eliminada" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ADMIN — NOTIFICACIONES
========================= */

app.post("/api/admin/notifications/send", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuids, type, title, message, link } = req.body || {};
    if (!user_uuids?.length || !title || !message) {
      return res.status(400).json({ success: false, message: "user_uuids, title y message son obligatorios" });
    }
    await db.sendNotificationToMany(user_uuids, type || "system", title, message, link || "");
    await db.logActivity(req.user.sub, "notify", "notification", "bulk", `"${title}" → ${user_uuids.length} usuarios`);
    return res.json({ success: true, message: `Notificación enviada a ${user_uuids.length} usuarios` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   ADMIN — MÓDULOS
========================= */

app.get("/api/admin/modules", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const modules = await db.getAll("modules");
    return res.json({ success: true, modules });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admin/modules", authMiddleware, requireAdmin, async (req, res) => {
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
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/modules/:id/toggle", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const current   = await db.getById("modules", id);
    const newActive = !current.active;
    const updated   = await db.update("modules", id, { active: newActive });
    await db.logActivity(req.user.sub, "toggle", "module", id, `active → ${newActive}`);
    return res.json({ success: true, module: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admin/modules/assign", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { user_uuid, module_key, enabled = true } = req.body || {};
    if (!user_uuid || !module_key) {
      return res.status(400).json({ success: false, message: "user_uuid y module_key obligatorios" });
    }
    const existing = await db.getWhere("user_modules", `(user_uuid,eq,${user_uuid})~and(module_key,eq,${module_key})`);
    const result   = existing.length
      ? await db.update("user_modules", existing[0].nocodb_id || existing[0].id, { enabled })
      : await db.insert("user_modules", { user_uuid, module_key, enabled });
    await db.logActivity(req.user.sub, "assign_module", "module", module_key, `${user_uuid} → enabled: ${enabled}`);
    return res.json({ success: true, user_module: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   USER — DASHBOARD
========================= */

app.get("/api/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const uuid = req.user.sub;
    const [assignments, tasks, notifications] = await Promise.all([
      db.getWhere("user_projects",  `(user_uuid,eq,${uuid})`),
      db.getWhere("tasks",          `(assigned_to,eq,${uuid})`),
      db.getWhere("notifications",  `(user_uuid,eq,${uuid})`),
    ]);
    return res.json({
      success: true,
      dashboard: {
        projects_count:        assignments.length,
        tasks_total:           tasks.length,
        tasks_pending:         tasks.filter(t => t.status === "pending").length,
        tasks_in_progress:     tasks.filter(t => t.status === "in_progress").length,
        tasks_done:            tasks.filter(t => t.status === "done").length,
        notifications_unread:  notifications.filter(n => !n.read).length,
        recent_notifications:  notifications.sort((a,b) => new Date(b.CreatedAt||0) - new Date(a.CreatedAt||0)).slice(0,5),
        recent_tasks:          tasks.sort((a,b) => new Date(b.CreatedAt||0) - new Date(a.CreatedAt||0)).slice(0,5),
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/user/projects", authMiddleware, async (req, res) => {
  try {
    const uuid        = req.user.sub;
    const assignments = await db.getWhere("user_projects", `(user_uuid,eq,${uuid})`);
    if (!assignments.length) return res.json({ success: true, projects: [] });

    const projectIds  = assignments.map(a => Number(a.project_id));
    const allProjects = await db.getAll("projects");
    const projects    = allProjects
      .filter(p => projectIds.includes(Number(p.id || p.nocodb_id)))
      .map(p => {
        const a = assignments.find(a => Number(a.project_id) === Number(p.id || p.nocodb_id));
        return { ...p, permission: a?.permission || "viewer" };
      });

    return res.json({ success: true, projects });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/user/tasks", authMiddleware, async (req, res) => {
  try {
    const tasks = await db.getWhere("tasks", `(assigned_to,eq,${req.user.sub})`);
    return res.json({ success: true, tasks });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/user/tasks/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body || {};
    const allowed    = ["pending","in_progress","done"];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: "Status inválido" });

    const task = await db.getById("tasks", id);
    if (task.assigned_to !== req.user.sub) {
      return res.status(403).json({ success: false, message: "No tenés acceso a esta tarea" });
    }

    const updated = await db.update("tasks", id, { status });
    return res.json({ success: true, task: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/user/notifications", authMiddleware, async (req, res) => {
  try {
    const notifications = await db.getWhere("notifications", `(user_uuid,eq,${req.user.sub})`);
    const sorted = notifications.sort((a,b) => new Date(b.CreatedAt||0) - new Date(a.CreatedAt||0));
    return res.json({ success: true, notifications: sorted, unread: sorted.filter(n => !n.read).length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/user/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    await db.update("notifications", req.params.id, { read: true });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/user/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    const unread = await db.getWhere("notifications", `(user_uuid,eq,${req.user.sub})~and(read,eq,false)`);
    await Promise.allSettled(unread.map(n => db.update("notifications", n.nocodb_id || n.id, { read: true })));
    return res.json({ success: true, marked: unread.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/user/modules", authMiddleware, async (req, res) => {
  try {
    const uuid          = req.user.sub;
    const allModules    = await db.getAll("modules");
    const activeGlobal  = allModules.filter(m => m.active);
    const userOverrides = await db.getWhere("user_modules", `(user_uuid,eq,${uuid})`);
    const overrideMap   = {};
    userOverrides.forEach(o => { overrideMap[o.module_key] = o.enabled; });
    const modules = activeGlobal
      .map(m => ({ ...m, enabled: overrideMap[m.key] !== undefined ? overrideMap[m.key] : true }))
      .filter(m => m.enabled);
    return res.json({ success: true, modules });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   REACT SPA (rutas cliente)
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
