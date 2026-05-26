import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";

import { db } from "./nocodb.service.js";

// Routes
import authRouter        from "./routes/auth.routes.js";
import leadRouter        from "./routes/lead.routes.js";
import adminUsersRouter  from "./routes/admin/users.routes.js";
import adminLeadsRouter  from "./routes/admin/leads.routes.js";
import projectsRouter    from "./projects.routes.js";
import tasksRouter       from "./routes/tasks.routes.js";
import notificationsRouter from "./routes/notifications.routes.js";
import modulesRouter     from "./routes/modules.routes.js";
import activityRouter    from "./routes/activity.routes.js";
import resourcesRouter   from "./routes/resources.routes.js";
import dashboardRouter   from "./routes/dashboard.routes.js";
import aiRouter          from "./ai.routes.js";
import contentRouter     from "./content.routes.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const clientDist = path.join(__dirname, "client", "dist");
const spaIndex   = path.join(clientDist, "index.html");
const spaReady   = fs.existsSync(spaIndex);

const PORT          = Number(process.env.PORT || 3000);
const NODE_ENV      = process.env.NODE_ENV    || "development";
const IS_PRODUCTION = NODE_ENV === "production";

if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido. El servidor no puede arrancar en producción sin él.");
  process.exit(1);
}

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
  "https://api.ocho.com.ar",
];

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

/* =========================
   MIDDLEWARES GLOBALES
========================= */

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: IS_PRODUCTION,
}));
app.use(compression());

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

/* =========================
   ARCHIVOS ESTÁTICOS
========================= */

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/en",     express.static(path.join(__dirname, "en")));
app.use("/nl",     express.static(path.join(__dirname, "nl")));

if (spaReady) {
  app.use("/app/assets", express.static(path.join(clientDist, "assets")));
}

/* =========================
   RUTAS ESTÁTICAS LEGACY
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
   RUTAS API
========================= */

app.use("/api", authRouter);
app.use("/api", leadRouter);
app.use("/api", adminUsersRouter);
app.use("/api", adminLeadsRouter);
app.use("/api", projectsRouter);
app.use("/api", tasksRouter);
app.use("/api", notificationsRouter);
app.use("/api", modulesRouter);
app.use("/api", activityRouter);
app.use("/api", resourcesRouter);
app.use("/api", dashboardRouter);
app.use("/api", aiRouter);
app.use("/api", contentRouter);

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
  db.warmCache().then(() => console.log("Cache precalentado.")).catch(() => {});
});
