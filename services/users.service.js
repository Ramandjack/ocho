import { db } from "../nocodb.service.js";

function requireUsersConfig() {
  if (!process.env.NOCODB_TOKEN || !process.env.NOCODB_USERS_URL) {
    throw new Error("Faltan NOCODB_TOKEN o NOCODB_USERS_URL en .env");
  }
}

export async function getAllUsers() {
  requireUsersConfig();
  return db.getAll("users");
}

export async function getUserByUuid(uuid) {
  const users = await getAllUsers();
  return users.find(u => u.uuid === uuid) || null;
}

export async function createUserRecord(payload) {
  requireUsersConfig();
  return db.insert("users", payload);
}

export async function updateUserFieldInNoco(uuid, fields) {
  requireUsersConfig();
  const users    = await getAllUsers();
  const target   = users.find(u => u.uuid === uuid);
  if (!target)   throw new Error("Usuario no encontrado");
  const recordId = target.nocodb_id || target.id;
  if (!recordId) throw new Error("No se encontró el record id del usuario");
  return db.update("users", recordId, fields);
}
