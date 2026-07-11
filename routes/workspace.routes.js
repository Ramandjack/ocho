import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import { normalizeRole } from "../utils/helpers.js";

const router = express.Router();

/* ── Upload seguro (mismo criterio que resources.routes.js: blocklist de
   extensión + sniffing de magic bytes) — carpeta propia para no mezclar con
   los recursos de proyecto. ─────────────────────────────────────────── */

const __filename_ws  = fileURLToPath(import.meta.url);
const __dirname_ws   = path.dirname(__filename_ws);
const ASSETS_DIR      = path.join(__dirname_ws, "..", "uploads", "workspace");
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const BLOCKED_EXTS = new Set([".exe",".bat",".sh",".cmd",".msi",".ps1",".dll",
  ".vbs",".js",".jar",".php",".py",".rb",".pl",".asp",".aspx",".jsp"]);

const BLOCKED_SIGNATURES = [
  [0x4d, 0x5a],             // PE  — .exe, .dll (Windows)
  [0x7f, 0x45, 0x4c, 0x46], // ELF — binarios Linux/Unix
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit (macOS)
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit (macOS)
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat / Java .class
  [0x23, 0x21],             // #! shebang — shell scripts de cualquier extensión
];

function hasDangerousMagicBytes(filePath) {
  try {
    const buf = Buffer.alloc(4);
    const fd  = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return BLOCKED_SIGNATURES.some(sig => sig.every((byte, i) => buf[i] === byte));
  } catch {
    return true; // Si no se puede leer, rechazar por defecto
  }
}

const assetUpload = multer({
  storage: multer.diskStorage({
    destination: ASSETS_DIR,
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTS.has(ext)) return cb(new Error("Tipo de archivo no permitido"));
    cb(null, true);
  },
});

/* ── Constants ──────────────────────────────────────────────── */

// Transiciones que puede disparar el dueño de la sesión (cliente/dev asignado).
const USER_TRANSITIONS = {
  pause:         { from: ["active"],                    to: "paused" },
  resume:        { from: ["paused", "changes_requested"], to: "active" },
  submit_review: { from: ["active", "paused"],          to: "in_review" },
};

// Transiciones que solo puede disparar un admin, sobre la sesión en revisión de la tarea.
const ADMIN_TRANSITIONS = {
  approve:         { from: ["in_review"], to: "approved" },
  request_changes: { from: ["in_review"], to: "changes_requested" },
};

// Estados en los que el documento pasa a ser de solo lectura para su dueño —
// ya está en manos del admin o cerrado, editarlo silenciosamente invalidaría la revisión.
const DOCUMENT_LOCKED_STATUSES = ["in_review", "approved", "closed"];

const MAX_CONTENT_CHARS = 500_000; // ~500KB de JSON — las imágenes van por URL, nunca embebidas en base64

const VALID_DOC_KINDS = ["document", "code", "design"];

// Cada "kind" de documento tiene su propio formato de content_json — el editor
// correspondiente (Tiptap / Monaco / Excalidraw) decide la forma exacta.
const EXPECTED_CONTENT_TYPE = { document: "doc", code: "code", design: "excalidraw" };

function emptyDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function emptyContentForKind(kind) {
  if (kind === "code")   return { type: "code", language: "javascript", value: "" };
  if (kind === "design") return { type: "excalidraw", elements: [], appState: {} };
  return emptyDoc();
}

// Extracción de texto plano desde el JSON de Tiptap/ProseMirror — para búsqueda y prompts de IA futuros.
function extractText(node) {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    const sep = ["paragraph", "heading", "listItem", "tableRow"].includes(node.type) ? "\n" : " ";
    return node.content.map(extractText).join(sep);
  }
  return "";
}

/* ── Helpers (mismo patrón que tasks.routes.js — sin exportar de ahí
     para no acoplar routers entre sí) ─────────────────────────── */

async function findTask(id) {
  const all = await db.getAll("tasks");
  return all.find(t => String(t.id ?? t.nocodb_id) === String(id));
}

async function assertProjectAccess(userUuid, projectId) {
  if (!projectId) return true;
  const links = await db.getAll("user_projects");
  return links.some(
    r => r.user_uuid === userUuid && Number(r.project_id) === Number(projectId)
  );
}

async function assertTaskAccess(req, task) {
  if (req.user.role === "admin") return true;
  if (task.assigned_to === req.user.sub) return true;
  if (task.project_id) return assertProjectAccess(req.user.sub, task.project_id);
  return false;
}

function sid(session) { return session.id ?? session.nocodb_id; }

async function findSessionsForTask(taskId) {
  const all = await db.getAll("workspace_sessions");
  return all.filter(s => Number(s.task_id) === Number(taskId));
}

/* ═══════════════════════════════════════
   USER — CICLO DE VIDA DE LA SESIÓN
═══════════════════════════════════════ */

// POST /api/user/tasks/:id/workspace/start — abre (o reabre) la sesión del usuario para esta tarea
router.post("/user/tasks/:id/workspace/start", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const sessions = await findSessionsForTask(id);
    const mine = sessions.filter(s => s.user_uuid === req.user.sub);
    let session = mine.find(s => ["active", "paused", "changes_requested"].includes(s.status));

    const nowIso = new Date().toISOString();
    if (session) {
      if (session.status !== "active") {
        session = await db.update("workspace_sessions", sid(session), {
          status: "active",
          paused_at: null,
          last_activity_at: nowIso,
        });
      }
    } else {
      session = await db.insert("workspace_sessions", {
        task_id:          Number(id),
        project_id:       task.project_id ? Number(task.project_id) : null,
        user_uuid:        req.user.sub,
        status:           "active",
        started_at:       nowIso,
        last_activity_at: nowIso,
      });
    }

    // Mismo efecto que ya tenía el botón "Empezar": pasa la tarea a en curso.
    if (task.status === "pending") {
      await db.update("tasks", id, { status: "in_progress" });
    }

    await db.logActivity(req.user.sub, "workspace_start", "task", id, "Sesión de workspace iniciada");

    return res.status(201).json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/tasks/:id/workspace — sesión propia activa/pausada/en revisión de esta tarea (o null)
router.get("/user/tasks/:id/workspace", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const sessions = await findSessionsForTask(id);
    const session = sessions
      .filter(s => s.user_uuid === req.user.sub && s.status !== "closed")
      .sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))[0] || null;

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/tasks/:id/workspace/session — pausar / reanudar / enviar a revisión
router.patch("/user/tasks/:id/workspace/session", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const transition = USER_TRANSITIONS[action];
    if (!transition) return res.status(400).json({ success: false, message: "Acción inválida" });

    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const sessions = await findSessionsForTask(id);
    const session = sessions.find(s => s.user_uuid === req.user.sub && s.status !== "closed");
    if (!session) return res.status(404).json({ success: false, message: "No hay una sesión activa para esta tarea" });
    if (!transition.from.includes(session.status)) {
      return res.status(409).json({ success: false, message: `No se puede pasar de "${session.status}" a "${transition.to}"` });
    }

    const nowIso = new Date().toISOString();
    const fields = { status: transition.to, last_activity_at: nowIso };
    if (transition.to === "paused") fields.paused_at = nowIso;
    if (transition.to === "active") fields.paused_at = null;

    const updated = await db.update("workspace_sessions", sid(session), fields);

    if (action === "submit_review") {
      const users = await db.getAll("users");
      const adminUuids = users.filter(u => normalizeRole(u.role) === "admin").map(u => u.uuid);
      if (adminUuids.length) {
        await db.sendNotificationToMany(
          adminUuids, "task",
          "Tarea enviada a revisión",
          `"${task.title}" está lista para revisión`,
          "/app/panel/tasks"
        );
      }
    }

    await db.logActivity(req.user.sub, `workspace_${action}`, "task", id, `Sesión → ${transition.to}`);

    return res.json({ success: true, session: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════
   ADMIN — VISIBILIDAD Y APROBACIÓN
═══════════════════════════════════════ */

// GET /api/admin/workspace/sessions — última sesión (no cerrada) por tarea, para mostrar
// el estado del workspace en el listado de tareas del admin.
router.get("/admin/workspace/sessions", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const all = await db.getAll("workspace_sessions");
    const open = all.filter(s => s.status !== "closed");

    const latestByTask = new Map();
    for (const s of open) {
      const taskId = Number(s.task_id);
      const current = latestByTask.get(taskId);
      if (!current || new Date(s.last_activity_at || 0) > new Date(current.last_activity_at || 0)) {
        latestByTask.set(taskId, s);
      }
    }

    const sessions = [...latestByTask.values()].map(s => ({
      id:                sid(s),
      task_id:           Number(s.task_id),
      user_uuid:         s.user_uuid,
      status:            s.status,
      last_activity_at:  s.last_activity_at || null,
    }));

    return res.json({ success: true, sessions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/tasks/:id/workspace/session — aprobar o pedir cambios sobre la sesión en revisión
router.patch("/admin/tasks/:id/workspace/session", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body || {};
    const transition = ADMIN_TRANSITIONS[action];
    if (!transition) return res.status(400).json({ success: false, message: "Acción inválida" });

    if (action === "request_changes" && !String(comment || "").trim()) {
      return res.status(400).json({ success: false, message: "Se requiere un comentario para pedir cambios" });
    }

    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    const sessions = await findSessionsForTask(id);
    const session = sessions.find(s => transition.from.includes(s.status));
    if (!session) return res.status(404).json({ success: false, message: "No hay una sesión en revisión para esta tarea" });

    const nowIso = new Date().toISOString();
    const updated = await db.update("workspace_sessions", sid(session), {
      status: transition.to,
      last_activity_at: nowIso,
    });

    if (action === "approve" && task.status !== "done") {
      await db.update("tasks", id, { status: "done" });
    }

    // Comentario "de sistema" en el mismo hilo de la tarea — deja registro visible del
    // veredicto de la revisión, no solo la mutación silenciosa del estado de sesión.
    const reviewNote = action === "request_changes"
      ? `🔁 Cambios solicitados — ${comment.trim()}`
      : `✅ Aprobado${comment?.trim() ? ` — ${comment.trim()}` : ""}`;

    const adminRow = await db.findOne("users", "uuid", req.user.sub);
    await db.insert("project_messages", {
      project_id:  task.project_id || null,
      task_id:     Number(id),
      user_uuid:   req.user.sub,
      author_name: adminRow?.full_name || adminRow?.first_name || "OCHO",
      author_role: "admin",
      content:     reviewNote,
    });

    if (session.user_uuid) {
      await db.sendNotification(
        session.user_uuid, "task",
        action === "approve" ? "Tarea aprobada" : "Se solicitaron cambios",
        action === "approve"
          ? `"${task.title}" fue aprobada`
          : `"${task.title}" necesita cambios: ${(comment || "").slice(0, 100)}`,
        "/app/panel/tasks"
      );
    }

    await db.logActivity(req.user.sub, `workspace_${action}`, "task", id, `Sesión → ${transition.to}`);

    return res.json({ success: true, session: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════
   DOCUMENTO (Tiptap) + VERSIONES
═══════════════════════════════════════ */

function docId(d) { return d.id ?? d.nocodb_id; }
function verId(v) { return v.id ?? v.nocodb_id; }

async function findDocument(id) {
  const all = await db.getAll("workspace_documents");
  return all.find(d => String(docId(d)) === String(id));
}

async function findSessionById(id) {
  const all = await db.getAll("workspace_sessions");
  return all.find(s => String(sid(s)) === String(id));
}

// Solo el dueño de la sesión (o un admin) puede escribir sobre su documento.
async function assertDocumentWriteAccess(req, session) {
  if (!session) return false;
  return req.user.role === "admin" || session.user_uuid === req.user.sub;
}

function parseContentJson(raw) {
  try { return JSON.parse(raw || "{}"); } catch { return emptyDoc(); }
}

// GET /api/user/tasks/:id/workspace/document?kind=document|code|design — documento de
// MI sesión para esta tarea (lo crea si no existe). Un documento por kind por sesión.
router.get("/user/tasks/:id/workspace/document", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const kind = VALID_DOC_KINDS.includes(req.query.kind) ? req.query.kind : "document";

    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const sessions = await findSessionsForTask(id);
    const session = sessions
      .filter(s => s.user_uuid === req.user.sub && s.status !== "closed")
      .sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))[0];
    if (!session) {
      return res.status(404).json({ success: false, message: "No hay una sesión activa — iniciá el workspace primero" });
    }

    const allDocs = await db.getAll("workspace_documents");
    let doc = allDocs.find(d => Number(d.session_id) === Number(sid(session)) && d.kind === kind);

    if (!doc) {
      const nowIso = new Date().toISOString();
      doc = await db.insert("workspace_documents", {
        session_id:      Number(sid(session)),
        task_id:         Number(id),
        kind,
        content_json:    JSON.stringify(emptyContentForKind(kind)),
        content_text:    "",
        current_version: 0,
        updated_at:      nowIso,
      });
    }

    return res.json({
      success: true,
      document: {
        id:              docId(doc),
        kind,
        content:         parseContentJson(doc.content_json),
        current_version: Number(doc.current_version) || 0,
        updated_at:      doc.updated_at || null,
      },
      session_status: session.status,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/workspace/documents/:id — autoguardado (formato de content según doc.kind)
router.patch("/user/workspace/documents/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, base_updated_at } = req.body || {};

    const doc = await findDocument(id);
    if (!doc) return res.status(404).json({ success: false, message: "Documento no encontrado" });

    const session = await findSessionById(doc.session_id);
    if (!(await assertDocumentWriteAccess(req, session))) {
      return res.status(403).json({ success: false, message: "Sin acceso de edición a este documento" });
    }

    if (session && DOCUMENT_LOCKED_STATUSES.includes(session.status) && req.user.role !== "admin") {
      return res.status(409).json({ success: false, message: "El documento está en revisión — no se puede editar por ahora" });
    }

    const expectedType = EXPECTED_CONTENT_TYPE[doc.kind] || "doc";
    if (!content || content.type !== expectedType) {
      return res.status(400).json({ success: false, message: "Formato de documento inválido" });
    }
    const serialized = JSON.stringify(content);
    if (serialized.length > MAX_CONTENT_CHARS) {
      return res.status(400).json({ success: false, message: "El documento es demasiado grande. Subí las imágenes como archivo en vez de incrustarlas." });
    }

    if (base_updated_at !== undefined && doc.updated_at && String(base_updated_at) !== String(doc.updated_at)) {
      return res.status(409).json({
        success: false,
        message: "Alguien más guardó cambios en este documento mientras editabas.",
        document: {
          id:         docId(doc),
          content:    parseContentJson(doc.content_json),
          updated_at: doc.updated_at,
        },
      });
    }

    const contentText = doc.kind === "document" ? extractText(content).slice(0, 20_000)
                       : doc.kind === "code"     ? String(content.value || "").slice(0, 20_000)
                       : "";

    const nowIso = new Date().toISOString();
    const updated = await db.update("workspace_documents", id, {
      content_json: serialized,
      content_text: contentText,
      updated_at:   nowIso,
    });

    if (session) {
      await db.update("workspace_sessions", sid(session), { last_activity_at: nowIso });
    }

    return res.json({
      success: true,
      document: {
        id:              docId(updated),
        current_version: Number(updated.current_version) || 0,
        updated_at:      updated.updated_at || nowIso,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/workspace/documents/:id/versions — snapshot inmutable del contenido actual
router.post("/user/workspace/documents/:id/versions", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body || {};

    const doc = await findDocument(id);
    if (!doc) return res.status(404).json({ success: false, message: "Documento no encontrado" });

    const session = await findSessionById(doc.session_id);
    if (!(await assertDocumentWriteAccess(req, session))) {
      return res.status(403).json({ success: false, message: "Sin acceso a este documento" });
    }

    const nextVersion = (Number(doc.current_version) || 0) + 1;
    const version = await db.insert("workspace_versions", {
      document_id:  Number(id),
      version:      nextVersion,
      content_json: doc.content_json,
      created_uuid: req.user.sub,
      label:        label ? String(label).trim().slice(0, 80) : null,
    });

    await db.update("workspace_documents", id, { current_version: nextVersion });
    await db.logActivity(req.user.sub, "workspace_save_version", "task", doc.task_id, `Versión ${nextVersion} guardada`);

    return res.status(201).json({
      success: true,
      version: {
        id:           verId(version),
        version:      nextVersion,
        label:        version.label || null,
        created_uuid: version.created_uuid,
        created_at:   version.CreatedAt || version.created_at || new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/workspace/documents/:id/versions — historial (sin contenido, solo metadata)
router.get("/user/workspace/documents/:id/versions", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await findDocument(id);
    if (!doc) return res.status(404).json({ success: false, message: "Documento no encontrado" });

    const task = await findTask(doc.task_id);
    if (!task || !(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a este documento" });
    }

    const all = await db.getAll("workspace_versions");
    const versions = all
      .filter(v => Number(v.document_id) === Number(id))
      .map(v => ({
        id:           verId(v),
        version:      Number(v.version),
        label:        v.label || null,
        created_uuid: v.created_uuid,
        created_at:   v.CreatedAt || v.created_at || null,
      }))
      .sort((a, b) => b.version - a.version);

    return res.json({ success: true, versions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/workspace/documents/:id/versions/:versionId/restore — carga una versión anterior al borrador actual
router.post("/user/workspace/documents/:id/versions/:versionId/restore", authMiddleware, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const doc = await findDocument(id);
    if (!doc) return res.status(404).json({ success: false, message: "Documento no encontrado" });

    const session = await findSessionById(doc.session_id);
    if (!(await assertDocumentWriteAccess(req, session))) {
      return res.status(403).json({ success: false, message: "Sin acceso de edición a este documento" });
    }

    const allVersions = await db.getAll("workspace_versions");
    const version = allVersions.find(v => String(verId(v)) === String(versionId) && Number(v.document_id) === Number(id));
    if (!version) return res.status(404).json({ success: false, message: "Versión no encontrada" });

    const nowIso = new Date().toISOString();
    const content = parseContentJson(version.content_json);
    const contentText = doc.kind === "document" ? extractText(content).slice(0, 20_000)
                       : doc.kind === "code"     ? String(content.value || "").slice(0, 20_000)
                       : "";
    const updated = await db.update("workspace_documents", id, {
      content_json: version.content_json,
      content_text: contentText,
      updated_at:   nowIso,
    });

    await db.logActivity(req.user.sub, "workspace_restore_version", "task", doc.task_id, `Restaurada versión ${version.version}`);

    return res.json({
      success: true,
      document: {
        id:              docId(updated),
        content,
        current_version: Number(updated.current_version) || 0,
        updated_at:      updated.updated_at || nowIso,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════
   ARCHIVOS (workspace_assets)
═══════════════════════════════════════ */

function assetId(a) { return a.id ?? a.nocodb_id; }

// GET /api/user/tasks/:id/workspace/assets — adjuntos de la tarea (de cualquier sesión/usuario con acceso)
router.get("/user/tasks/:id/workspace/assets", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const task = await findTask(id);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
    if (!(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
    }

    const all = await db.getAll("workspace_assets");
    const assets = all
      .filter(a => Number(a.task_id) === Number(id))
      .map(a => ({
        id:            assetId(a),
        original_name: a.original_name,
        mime_type:     a.mime_type,
        size_bytes:    Number(a.size_bytes) || 0,
        uploaded_by:   a.uploaded_by,
        created_at:    a.CreatedAt || a.created_at || null,
      }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return res.json({ success: true, assets });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/tasks/:id/workspace/assets — subir un archivo
router.post("/user/tasks/:id/workspace/assets", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const task = await findTask(id);
  if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });
  if (!(await assertTaskAccess(req, task))) {
    return res.status(403).json({ success: false, message: "Sin acceso a esta tarea" });
  }

  assetUpload.single("file")(req, res, async err => {
    if (err)       return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: "No se recibió archivo" });

    if (hasDangerousMagicBytes(req.file.path)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: "Tipo de archivo no permitido" });
    }

    try {
      const sessions = await findSessionsForTask(id);
      const session = sessions.find(s => s.user_uuid === req.user.sub && s.status !== "closed");

      const asset = await db.insert("workspace_assets", {
        task_id:       Number(id),
        session_id:    session ? Number(sid(session)) : null,
        uploaded_by:   req.user.sub,
        filename_stored: req.file.filename,
        original_name: req.file.originalname,
        mime_type:     req.file.mimetype,
        size_bytes:    req.file.size,
      });

      await db.logActivity(req.user.sub, "workspace_upload", "task", id, `Archivo subido: "${req.file.originalname}"`);

      return res.status(201).json({
        success: true,
        asset: {
          id:            assetId(asset),
          original_name: asset.original_name,
          mime_type:     asset.mime_type,
          size_bytes:    Number(asset.size_bytes) || 0,
          uploaded_by:   asset.uploaded_by,
          created_at:    asset.CreatedAt || asset.created_at || new Date().toISOString(),
        },
      });
    } catch (dbErr) {
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: dbErr.message });
    }
  });
});

// GET /api/user/workspace/assets/:assetId/file — descarga, verificando acceso a la tarea dueña
router.get("/user/workspace/assets/:assetId/file", authMiddleware, async (req, res) => {
  try {
    const { assetId: paramId } = req.params;
    const all = await db.getAll("workspace_assets");
    const asset = all.find(a => String(assetId(a)) === String(paramId));
    if (!asset) return res.status(404).json({ success: false, message: "Archivo no encontrado" });

    const task = await findTask(asset.task_id);
    if (!task || !(await assertTaskAccess(req, task))) {
      return res.status(403).json({ success: false, message: "Sin acceso a este archivo" });
    }

    const filepath = path.join(ASSETS_DIR, path.basename(asset.filename_stored));
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: "Archivo no encontrado en disco" });
    }

    res.setHeader("Content-Disposition", `inline; filename="${asset.original_name.replace(/"/g, "")}"`);
    return res.sendFile(filepath);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/user/workspace/assets/:assetId — solo quien lo subió (o admin)
router.delete("/user/workspace/assets/:assetId", authMiddleware, async (req, res) => {
  try {
    const { assetId: paramId } = req.params;
    const all = await db.getAll("workspace_assets");
    const asset = all.find(a => String(assetId(a)) === String(paramId));
    if (!asset) return res.status(404).json({ success: false, message: "Archivo no encontrado" });

    if (asset.uploaded_by !== req.user.sub && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Solo podés eliminar tus propios archivos" });
    }

    const filepath = path.join(ASSETS_DIR, path.basename(asset.filename_stored));
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    await db.remove("workspace_assets", paramId);
    await db.logActivity(req.user.sub, "workspace_delete_asset", "task", asset.task_id, `Archivo eliminado: "${asset.original_name}"`);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
