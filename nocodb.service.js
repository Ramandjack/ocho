/**
 * nocodb.service.js — Servicio centralizado NocoDB
 * Todas las operaciones de DB pasan por acá.
 * Usar en server.js: import { db } from './nocodb.service.js'
 */

import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.NOCODB_TOKEN;

const TABLES = {
  users:        process.env.NOCODB_USERS_URL,
  leads:        process.env.NOCODB_LEADS_URL,
  projects:     process.env.NOCODB_PROJECTS_URL,
  user_projects:process.env.NOCODB_USER_PROJECTS_URL,
  tasks:        process.env.NOCODB_TASKS_URL,
  notifications:process.env.NOCODB_NOTIFICATIONS_URL,
  modules:      process.env.NOCODB_MODULES_URL,
  user_modules: process.env.NOCODB_USER_MODULES_URL,
  activity_log: process.env.NOCODB_ACTIVITY_LOG_URL,
};

/* ===========================
   BASE FETCH
=========================== */

async function ncFetch(url, options = {}) {
  if (!TOKEN) throw new Error("NOCODB_TOKEN no configurado");

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "xc-token": TOKEN,
      ...(options.headers || {}),
    },
    ...options,
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === "object"
      ? data.msg || data.message || JSON.stringify(data)
      : String(data);
    throw new Error(msg);
  }

  return data;
}

/* ===========================
   HELPERS
=========================== */

function tableUrl(table) {
  const url = TABLES[table];
  if (!url) throw new Error(`Tabla desconocida: ${table}`);
  return url.replace(/\/$/, "");
}

function flatten(record) {
  if (!record || typeof record !== "object") return {};
  if (record.fields && typeof record.fields === "object") {
    return {
      id: record.id,
      nocodb_id: record.id,
      ...record.fields,
    };
  }
  return record;
}

function extractList(result) {
  if (Array.isArray(result)) return result.map(flatten);
  if (Array.isArray(result?.records)) return result.records.map(flatten);
  if (Array.isArray(result?.list)) return result.list.map(flatten);
  return [];
}

/* ===========================
   CRUD OPERATIONS
=========================== */

/**
 * Obtener todos los registros de una tabla
 * @param {string} table - nombre de la tabla
 * @param {object} params - query params opcionales (where, limit, sort)
 */
async function getAll(table, params = {}) {
  const base = tableUrl(table);
  const query = new URLSearchParams({ limit: 1000, ...params }).toString();
  const result = await ncFetch(`${base}?${query}`);
  return extractList(result);
}

/**
 * Obtener registros filtrados
 * @param {string} table
 * @param {string} where - filtro NocoDB ej: "(user_uuid,eq,abc123)"
 */
async function getWhere(table, where) {
  const base = tableUrl(table);
  const query = new URLSearchParams({ where, limit: 1000 }).toString();
  const result = await ncFetch(`${base}?${query}`);
  return extractList(result);
}

/**
 * Obtener un registro por ID numérico
 */
async function getById(table, id) {
  const base = tableUrl(table);
  const result = await ncFetch(`${base}/${id}`);
  return flatten(result);
}

/**
 * Crear un registro
 * @param {string} table
 * @param {object} fields - campos del registro
 */
async function insert(table, fields) {
  const base = tableUrl(table);
  const result = await ncFetch(base, {
    method: "POST",
    body: JSON.stringify([{ fields }]),
  });
  const records = extractList(result);
  return records[0] || fields;
}

/**
 * Actualizar un registro por ID numérico
 */
async function update(table, id, fields) {
  const base = tableUrl(table);
  const result = await ncFetch(`${base}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  return flatten(result);
}

/**
 * Eliminar un registro por ID numérico
 */
async function remove(table, id) {
  const base = tableUrl(table);
  await ncFetch(`${base}/${id}`, { method: "DELETE" });
  return { deleted: true, id };
}

/**
 * Buscar un registro por campo específico
 */
async function findOne(table, field, value) {
  const where = `(${field},eq,${value})`;
  const records = await getWhere(table, where);
  return records[0] || null;
}

/* ===========================
   ACTIVITY LOG HELPER
=========================== */

async function logActivity(adminUuid, action, entity, entityId, detail = "") {
  try {
    await insert("activity_log", {
      admin_uuid: adminUuid,
      action,
      entity,
      entity_id: String(entityId),
      detail,
    });
  } catch (err) {
    console.warn("Error escribiendo activity_log:", err.message);
  }
}

/* ===========================
   NOTIFICATION HELPER
=========================== */

async function sendNotification(userUuid, type, title, message, link = "") {
  try {
    await insert("notifications", {
      user_uuid: userUuid,
      type,
      title,
      message,
      read: false,
      link,
    });
  } catch (err) {
    console.warn("Error enviando notificación:", err.message);
  }
}

async function sendNotificationToMany(userUuids, type, title, message, link = "") {
  await Promise.allSettled(
    userUuids.map(uuid => sendNotification(uuid, type, title, message, link))
  );
}

/* ===========================
   EXPORTS
=========================== */

export const db = {
  getAll,
  getWhere,
  getById,
  insert,
  update,
  remove,
  findOne,
  logActivity,
  sendNotification,
  sendNotificationToMany,
  TABLES,
};
