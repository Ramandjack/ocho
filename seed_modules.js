/**
 * seed_modules.js — Poblar tabla modules
 * Correr UNA SOLA VEZ: node seed_modules.js
 */

import dotenv from "dotenv";
dotenv.config();

const TOKEN      = process.env.NOCODB_TOKEN;
const NOCODB_BASE = process.env.NOCODB_BASE;
const TABLE_ID   = process.env.NOCODB_MODULES_TABLE;
const NOCODB_HOST = (process.env.NOCODB_HOST || "https://app.nocodb.com/api/v3/data").replace(/\/$/, "");
const URL        = NOCODB_BASE && TABLE_ID ? `${NOCODB_HOST}/${NOCODB_BASE}/${TABLE_ID}/records` : null;

if (!TOKEN || !URL) {
  console.error("Faltan NOCODB_TOKEN, NOCODB_BASE o NOCODB_MODULES_TABLE en .env");
  process.exit(1);
}

const modules = [
  { key: "projects",      label: "Proyectos",     description: "Proyectos asignados al usuario",    icon: "folder",    active: true  },
  { key: "tasks",         label: "Tareas",         description: "Tareas y entregas pendientes",      icon: "check",     active: true  },
  { key: "files",         label: "Archivos",       description: "Documentos y recursos del proyecto",icon: "file",      active: true  },
  { key: "notifications", label: "Notificaciones", description: "Alertas y mensajes del sistema",    icon: "bell",      active: true  },
  { key: "messages",      label: "Mensajes",       description: "Comunicación directa con el equipo",icon: "mail",      active: false },
  { key: "analytics",     label: "Analítica",      description: "Métricas y reportes de actividad",  icon: "chart-bar", active: false },
];

async function seed() {
  console.log("Iniciando seed de módulos...\n");

  for (const mod of modules) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xc-token": TOKEN,
        },
        body: JSON.stringify([{ fields: mod }]),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(`✗ Error en "${mod.key}":`, data.msg || data.message);
      } else {
        console.log(`✓ Módulo creado: ${mod.key} (${mod.label})`);
      }
    } catch (err) {
      console.error(`✗ Error en "${mod.key}":`, err.message);
    }
  }

  console.log("\nSeed completado.");
}

seed();
