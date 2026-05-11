/**
 * INTEGRACIÓN EN server.js
 * Agregá estos imports al principio de server.js (después de los imports existentes)
 * y estas líneas antes de app.listen()
 */

// ─── IMPORTS (agregar al inicio de server.js) ───────────────────────────────

import projectsRouter from "./projects.routes.js";
import otherRouter    from "./other.routes.js";

// ─── NUEVAS ENV VARS (ya están en .env, solo asegurarse de leerlas) ─────────

const NOCODB_PROJECTS_URL     = process.env.NOCODB_PROJECTS_URL     || "";
const NOCODB_USER_PROJECTS_URL= process.env.NOCODB_USER_PROJECTS_URL|| "";
const NOCODB_TASKS_URL        = process.env.NOCODB_TASKS_URL        || "";
const NOCODB_NOTIFICATIONS_URL= process.env.NOCODB_NOTIFICATIONS_URL|| "";
const NOCODB_MODULES_URL      = process.env.NOCODB_MODULES_URL      || "";
const NOCODB_USER_MODULES_URL = process.env.NOCODB_USER_MODULES_URL || "";
const NOCODB_ACTIVITY_LOG_URL = process.env.NOCODB_ACTIVITY_LOG_URL || "";

// ─── RUTAS (agregar antes de app.listen()) ───────────────────────────────────

app.use("/api", projectsRouter);
app.use("/api", otherRouter);

// ─── VERIFICACIÓN (opcional, para chequear al arrancar) ──────────────────────

const REQUIRED_ENVS = [
  "NOCODB_TOKEN",
  "NOCODB_USERS_URL",
  "NOCODB_LEADS_URL",
  "NOCODB_PROJECTS_URL",
  "NOCODB_USER_PROJECTS_URL",
  "NOCODB_TASKS_URL",
  "NOCODB_NOTIFICATIONS_URL",
  "NOCODB_MODULES_URL",
  "NOCODB_USER_MODULES_URL",
  "NOCODB_ACTIVITY_LOG_URL",
];

REQUIRED_ENVS.forEach(key => {
  if (!process.env[key]) {
    console.warn(`⚠️  Variable de entorno faltante: ${key}`);
  }
});

/**
 * TAMBIÉN AGREGÁ estos módulos en NocoDB al arrancar el sistema por primera vez.
 * Podés correr este script una sola vez con: node seed_modules.js
 */

/*
// seed_modules.js — correr UNA VEZ
import { db } from './nocodb.service.js';
import dotenv from 'dotenv';
dotenv.config();

const modules = [
  { key: 'projects',      label: 'Proyectos',      description: 'Proyectos asignados',      icon: 'folder',    active: true },
  { key: 'tasks',         label: 'Tareas',          description: 'Tareas y entregas',         icon: 'check',     active: true },
  { key: 'files',         label: 'Archivos',        description: 'Documentos y recursos',     icon: 'file',      active: true },
  { key: 'notifications', label: 'Notificaciones',  description: 'Alertas del sistema',       icon: 'bell',      active: true },
  { key: 'messages',      label: 'Mensajes',        description: 'Comunicación directa',      icon: 'mail',      active: false },
  { key: 'analytics',     label: 'Analítica',       description: 'Métricas y reportes',       icon: 'chart-bar', active: false },
];

for (const mod of modules) {
  await db.insert('modules', mod);
  console.log('Módulo creado:', mod.key);
}
*/
