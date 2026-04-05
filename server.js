import express from "express";
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

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "ocho-dev-secret-change-this";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const NOCODB_TOKEN = process.env.NOCODB_TOKEN || "";
const NOCODB_USERS_URL = process.env.NOCODB_USERS_URL || "";
const NOCODB_LEADS_URL = process.env.NOCODB_LEADS_URL || "";

const N8N_LEAD_WEBHOOK = process.env.N8N_LEAD_WEBHOOK || "";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

const DEFAULT_CORS_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://www.ocho.com.ar",
  "https://ocho.com.ar",
  "https://api.ocho.com.ar"
];

const CORS_ORIGINS = (
  process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_CORS_ORIGINS
);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/en", express.static(path.join(__dirname, "en")));
app.use("/nl", express.static(path.join(__dirname, "nl")));

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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
      sub: user.uuid,
      email: user.email,
      role: user.role || "member",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      full_name: user.full_name || "",
      city: user.city || "",
      country: user.country || "",
      phone: user.phone || "",
      company: user.company || "",
      role_title: user.role_title || "",
      interest: user.interest || "",
      profile: user.profile || "",
      newsletter_consent: Boolean(user.newsletter_consent),
      data_consent: Boolean(user.data_consent),
      status: user.status || "active",
      source: user.source || "register_form",
      segment: user.segment || "newsletter_only"
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/"
  };
}

function setAuthCookie(res, token) {
  res.cookie("ocho_token", token, getCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie("ocho_token", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/"
  });
}

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.ocho_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No autenticado"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: "Sesión inválida o expirada"
    });
  }
}

function requireUsersConfig() {
  if (!NOCODB_TOKEN || !NOCODB_USERS_URL) {
    throw new Error("Faltan NOCODB_TOKEN o NOCODB_USERS_URL en .env");
  }
}

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
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.records)) return result.records;
  if (Array.isArray(result?.list)) return result.list;
  if (Array.isArray(result?.data)) return result.data;
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

async function getAllUsers() {
  requireUsersConfig();

  const separator = NOCODB_USERS_URL.includes("?") ? "&" : "?";
  const url = `${NOCODB_USERS_URL}${separator}limit=1000`;

  const result = await ncdbFetch(url, { method: "GET" });
  return extractRecords(result).map(flattenRecord);
}

async function createUserRecord(payload) {
  requireUsersConfig();

  const result = await ncdbFetch(NOCODB_USERS_URL, {
    method: "POST",
    body: JSON.stringify([
      {
        fields: payload
      }
    ])
  });

  const created = extractRecords(result).map(flattenRecord)[0];
  return created || payload;
}

async function createLeadRecord(payload) {
  if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) {
    return null;
  }

  const result = await ncdbFetch(NOCODB_LEADS_URL, {
    method: "POST",
    body: JSON.stringify([
      {
        fields: payload
      }
    ])
  });

  const created = extractRecords(result).map(flattenRecord)[0];
  return created || payload;
}

function inferUserSegment(interest) {
  switch (interest) {
    case "ai_systems":
      return "ai_interest";
    case "editorial":
      return "editorial_interest";
    case "ecommerce":
      return "ecommerce_interest";
    case "branding":
    case "marketing":
      return "marketing_leads";
    default:
      return "newsletter_only";
  }
}

function inferLeadSegment(projectType) {
  switch (projectType) {
    case "ia":
      return "ai_interest";
    case "ecommerce":
      return "ecommerce_interest";
    case "web":
      return "marketing_leads";
    default:
      return "high_intent";
  }
}

/* =========================
   STATIC ROUTES
========================= */

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/logout.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "logout.html"));
});

app.get("/panel.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "panel.html"));
});

/* =========================
   HEALTH
========================= */

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    environment: NODE_ENV
  });
});

/* =========================
   AUTH API
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const payload = req.body || {};

    const requiredFields = [
      "first_name",
      "last_name",
      "email",
      "city",
      "phone",
      "password",
      "interest",
      "newsletter_consent",
      "data_consent"
    ];

    for (const field of requiredFields) {
      if (
        payload[field] === undefined ||
        payload[field] === null ||
        payload[field] === ""
      ) {
        return res.status(400).json({
          success: false,
          message: `Falta el campo obligatorio: ${field}`
        });
      }
    }

    if (String(payload.password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "La contraseña debe tener al menos 6 caracteres"
      });
    }

    const email = normalizeEmail(payload.email);
    const users = await getAllUsers();

    const existingUser = users.find(
      (u) => normalizeEmail(u.email) === email
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una cuenta con ese email"
      });
    }

    const password_hash = await bcrypt.hash(String(payload.password), 10);
    const firstName = String(payload.first_name).trim();
    const lastName = String(payload.last_name).trim();

    const newUser = {
      uuid: crypto.randomUUID(),
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      email,
      city: String(payload.city).trim(),
      country: String(payload.country || "").trim(),
      phone: String(payload.phone).trim(),
      company: String(payload.company || "").trim(),
      role_title: String(payload.role || "").trim(),
      interest: String(payload.interest).trim(),
      profile: String(payload.profile || "").trim(),
      newsletter_consent: Boolean(payload.newsletter_consent),
      data_consent: Boolean(payload.data_consent),
      password_hash,
      role: "member",
      status: "active",
      source: "register_form",
      segment: inferUserSegment(String(payload.interest).trim()),
      last_login_at: null
    };

    const createdUser = await createUserRecord(newUser);
    const token = createToken(createdUser);

    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Cuenta creada correctamente",
      user: sanitizeUser(createdUser)
    });
  } catch (error) {
    console.error("Error en /api/register:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno al registrar usuario"
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email y contraseña son obligatorios"
      });
    }

    const users = await getAllUsers();
    const user = users.find(
      (u) => normalizeEmail(u.email) === normalizeEmail(email)
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    const hash = user.password_hash || user.passwordHash;

    if (!hash) {
      return res.status(401).json({
        success: false,
        message: "El usuario no tiene contraseña válida"
      });
    }

    const isValidPassword = await bcrypt.compare(String(password), hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    const token = createToken(user);

    setAuthCookie(res, token);

    return res.json({
      success: true,
      message: "Login correcto",
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error("Error en /api/login:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno al iniciar sesión"
    });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        uuid: req.user.sub,
        email: req.user.email,
        role: req.user.role,
        first_name: req.user.first_name || "",
        last_name: req.user.last_name || "",
        full_name: req.user.full_name || "",
        city: req.user.city || "",
        country: req.user.country || "",
        phone: req.user.phone || "",
        company: req.user.company || "",
        role_title: req.user.role_title || "",
        interest: req.user.interest || "",
        profile: req.user.profile || "",
        newsletter_consent: Boolean(req.user.newsletter_consent),
        data_consent: Boolean(req.user.data_consent),
        status: req.user.status || "active",
        source: req.user.source || "register_form",
        segment: req.user.segment || "newsletter_only"
      }
    });
  } catch (error) {
    console.error("Error en /api/me:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno obteniendo sesión"
    });
  }
});

app.post("/api/logout", (_req, res) => {
  clearAuthCookie(res);

  return res.json({
    success: true,
    message: "Sesión cerrada"
  });
});

/* =========================
   LEADS API
========================= */

app.post("/api/lead", async (req, res) => {
  try {
    const payload = req.body || {};

    const requiredFields = ["name", "email", "project_type", "budget", "message"];

    for (const field of requiredFields) {
      if (!payload[field]) {
        return res.status(400).json({
          success: false,
          message: `Falta el campo obligatorio: ${field}`
        });
      }
    }

    const leadPayload = {
      name: String(payload.name).trim(),
      email: normalizeEmail(payload.email),
      company: String(payload.company || "").trim(),
      project_type: String(payload.project_type).trim(),
      budget: String(payload.budget).trim(),
      message: String(payload.message).trim(),
      source: String(payload.source || "website_contact").trim(),
      page: String(payload.page || "").trim(),
      user_agent: String(payload.user_agent || "").trim(),
      created_at: String(payload.created_at || new Date().toISOString()).trim(),
      stage: "new",
      segment: inferLeadSegment(String(payload.project_type).trim())
    };

    let n8nResult = null;
    let nocodbResult = null;

    if (N8N_LEAD_WEBHOOK) {
      const response = await fetch(N8N_LEAD_WEBHOOK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(N8N_API_KEY ? { "x-api-key": N8N_API_KEY } : {})
        },
        body: JSON.stringify(leadPayload)
      });

      const contentType = response.headers.get("content-type") || "";
      n8nResult = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          typeof n8nResult === "object" && n8nResult !== null
            ? n8nResult.message || JSON.stringify(n8nResult)
            : String(n8nResult)
        );
      }
    }

    if (NOCODB_LEADS_URL) {
      nocodbResult = await createLeadRecord(leadPayload);
    }

    return res.status(201).json({
      success: true,
      message: "Lead enviado correctamente",
      lead: nocodbResult || leadPayload,
      relay: n8nResult
    });
  } catch (error) {
    console.error("Error en /api/lead:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno enviando el lead"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
});