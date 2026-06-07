/**
 * nocodb.service.js — Servicio centralizado NocoDB
 * Todas las operaciones de DB pasan por acá.
 * Usar en server.js: import { db } from './nocodb.service.js'
 */

import dotenv from "dotenv";
dotenv.config();

const TOKEN       = process.env.NOCODB_TOKEN;
const NOCODB_BASE = process.env.NOCODB_BASE;
// Permite apuntar a una instancia self-hosted; por defecto usa NocoDB Cloud.
const NOCODB_HOST = (process.env.NOCODB_HOST || "https://app.nocodb.com/api/v3/data").replace(/\/$/, "");

const TABLE_IDS = {
  users:            process.env.NOCODB_USERS_TABLE,
  leads:            process.env.NOCODB_LEADS_TABLE,
  projects:         process.env.NOCODB_PROJECTS_TABLE,
  user_projects:    process.env.NOCODB_USER_PROJECTS_TABLE,
  tasks:            process.env.NOCODB_TASKS_TABLE,
  notifications:    process.env.NOCODB_NOTIFICATIONS_TABLE,
  modules:          process.env.NOCODB_MODULES_TABLE,
  user_modules:     process.env.NOCODB_USER_MODULES_TABLE,
  activity_log:     process.env.NOCODB_ACTIVITY_LOG_TABLE,
  resources:        process.env.NOCODB_RESOURCES_TABLE,
  content:          process.env.NOCODB_CONTENT_TABLE,
  project_messages: process.env.NOCODB_PROJECT_MESSAGES_TABLE,
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
  const id = TABLE_IDS[table];
  if (!id) throw new Error(`Tabla desconocida o sin configurar: ${table}`);
  if (!NOCODB_BASE) throw new Error("NOCODB_BASE no configurado");
  return `${NOCODB_HOST}/${NOCODB_BASE}/${id}/records`;
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
  // NocoDB v3 devuelve el PK como "Id" (mayúscula) en el endpoint /records/:id
  const rid = record.Id ?? record.id ?? record.nocodb_id;
  if (rid != null) return { ...record, id: rid, nocodb_id: rid };
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

const CACHE_TTL_MS = 5 * 60_000; // 5 min default

const TABLE_TTL = {
  content:      10 * 60_000,
  modules:      10 * 60_000,
  user_modules: 10 * 60_000,
  users:        10 * 60_000,
  projects:      5 * 60_000,
  tasks:         5 * 60_000,
  leads:         5 * 60_000,
  activity_log:  5 * 60_000,
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
  await ncFetch(base, {
    method: "DELETE",
    body: JSON.stringify([{ id }]),
  });
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

// Precalienta en lotes de 2 para no saturar el rate limit de NocoDB
async function warmCache() {
  const tables = [
    "users", "projects", "tasks", "content", "modules",
    "user_modules", "leads", "activity_log",
    "user_projects", "notifications", "resources",
  ].filter(t => TABLE_IDS[t]);

  for (let i = 0; i < tables.length; i += 2) {
    await Promise.allSettled(tables.slice(i, i + 2).map(t => getAll(t).catch(() => {})));
    if (i + 2 < tables.length) await sleep(400);
  }
}

async function ping() {
  if (!TOKEN)       return { ok: false, error: "NOCODB_TOKEN no configurado" };
  if (!NOCODB_BASE) return { ok: false, error: "NOCODB_BASE no configurado" };

  // Prueba con la tabla users — 1 registro, sin cache
  const tableId = TABLE_IDS.users;
  if (!tableId) return { ok: false, error: "NOCODB_USERS_TABLE no configurado" };

  const url = `${NOCODB_HOST}/${NOCODB_BASE}/${tableId}/records?limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", "xc-token": TOKEN },
    });
    const ct   = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = typeof body === "object"
        ? body.msg || body.message || JSON.stringify(body)
        : String(body);
      return { ok: false, status: res.status, error: msg };
    }
    const count = Array.isArray(body?.list) ? body.list.length
                : Array.isArray(body?.records) ? body.records.length
                : Array.isArray(body) ? body.length
                : -1;
    return { ok: true, status: res.status, records_fetched: count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
  ping,
  TABLE_IDS,
};
