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
  resources:    process.env.NOCODB_RESOURCES_URL,
  content:      process.env.NOCODB_CONTENT_URL,
};

/* ===========================
   BASE FETCH
=========================== */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ncFetch(url, options = {}, _retry = 0) {
  if (!TOKEN) throw new Error("NOCODB_TOKEN no configurado");

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "xc-token": TOKEN,
      ...(options.headers || {}),
    },
    ...options,
  });

  // Rate limit: esperar y reintentar hasta 3 veces
  if (res.status === 429 && _retry < 3) {
    const wait = (res.headers.get("retry-after") || 1) * 1000 * (_retry + 1);
    await sleep(wait);
    return ncFetch(url, options, _retry + 1);
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === "object"
      ? data.msg || data.message || JSON.stringify(data)
      : String(data);
    // Si NocoDB devuelve ThrottlerException pese a los retries, mensaje claro
    if (typeof msg === "string" && msg.includes("ThrottlerException")) {
      throw new Error("Demasiadas solicitudes al servidor. Esperá unos segundos e intentá de nuevo.");
    }
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
   CACHE
=========================== */

const CACHE_TTL_MS = 60_000;

// Tablas estables → TTL más largo
const TABLE_TTL = {
  content:      5 * 60_000,
  modules:      5 * 60_000,
  user_modules: 5 * 60_000,
  users:        2 * 60_000,
};

const _cache    = new Map();
const _inflight = new Map(); // deduplicación de requests en vuelo

function _ttl(table) { return TABLE_TTL[table] || CACHE_TTL_MS; }

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function _cacheSet(key, data, ttl) {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

function clearTableCache(table) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${table}::`)) _cache.delete(key);
  }
}

// Ejecuta fetcher una sola vez aunque lleguen N llamadas simultáneas al mismo key
function _dedupe(key, ttl, fetcher) {
  const cached = _cacheGet(key);
  if (cached) return Promise.resolve(cached);

  if (_inflight.has(key)) return _inflight.get(key);

  const promise = fetcher()
    .then(data => { _cacheSet(key, data, ttl); _inflight.delete(key); return data; })
    .catch(err  => { _inflight.delete(key); throw err; });

  _inflight.set(key, promise);
  return promise;
}

/* ===========================
   CRUD OPERATIONS
=========================== */

const PAGE_SIZE = 1000;

async function fetchAllPages(base, params = {}) {
  let offset = 0;
  const all = [];

  while (true) {
    const query = new URLSearchParams({ ...params, limit: PAGE_SIZE, offset }).toString();
    const result = await ncFetch(`${base}?${query}`);
    const records = extractList(result);
    all.push(...records);

    if (!result?.pageInfo || result.pageInfo.isLastPage || records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function getAll(table, params = {}) {
  const key = `${table}::all::${JSON.stringify(params)}`;
  return _dedupe(key, _ttl(table), () => fetchAllPages(tableUrl(table), params));
}

async function getWhere(table, where) {
  const key = `${table}::where::${where}`;
  return _dedupe(key, _ttl(table), () => fetchAllPages(tableUrl(table), { where }));
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
  clearTableCache(table);
  const records = extractList(result);
  return records[0] || fields;
}

async function update(table, id, fields) {
  const base = tableUrl(table);
  const result = await ncFetch(base, {
    method: "PATCH",
    body: JSON.stringify([{ id, fields }]),
  });
  clearTableCache(table);
  const records = extractList(result);
  return records[0] ?? flatten(result);
}

async function remove(table, id) {
  const base = tableUrl(table);
  await ncFetch(`${base}/${id}`, { method: "DELETE" });
  clearTableCache(table);
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

// Precalienta las tablas más usadas para que el primer request sea rápido
async function warmCache() {
  const tables = ["users", "content", "modules", "user_modules"];
  await Promise.allSettled(
    tables.filter(t => TABLES[t]).map(t => getAll(t).catch(() => {}))
  );
}

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
  clearTableCache,
  warmCache,
  TABLES,
};
