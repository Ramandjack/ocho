import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db } from "../nocodb.service.js";
import { authMiddleware } from "../middleware/auth.js";

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const BLOCKED_EXTS = new Set([".exe",".bat",".sh",".cmd",".msi",".ps1",".dll"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTS.has(ext)) return cb(new Error("Tipo de archivo no permitido"));
    cb(null, true);
  },
});

const router = express.Router();

router.get("/user/resources", authMiddleware, async (req, res) => {
  try {
    const assignments = await db.getWhere("user_projects", `(user_uuid,eq,${req.user.sub})`);
    if (!assignments.length) return res.json({ success: true, resources: [] });

    const projectIds  = assignments.map(a => Number(a.project_id));
    const allResources = await db.getAll("resources");
    const resources   = allResources.filter(r => projectIds.includes(Number(r.project_id)));

    return res.json({ success: true, resources });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/user/resources/upload", authMiddleware, (req, res) => {
  upload.single("file")(req, res, err => {
    if (err)       return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: "No se recibió archivo" });
    return res.json({ success: true, url: `/api/files/${req.file.filename}`, original_name: req.file.originalname });
  });
});

router.get("/files/:filename", authMiddleware, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: "Archivo no encontrado" });
  }
  res.sendFile(filepath);
});

router.post("/user/resources", authMiddleware, async (req, res) => {
  try {
    const { title, url, type, description, project_id } = req.body || {};
    if (!title || !project_id) {
      return res.status(400).json({ success: false, message: "title y project_id son obligatorios" });
    }

    const assignment = await db.getWhere(
      "user_projects",
      `(user_uuid,eq,${req.user.sub})~and(project_id,eq,${project_id})`
    );
    if (!assignment.length) {
      return res.status(403).json({ success: false, message: "Sin acceso a ese proyecto" });
    }

    const resource = await db.insert("resources", {
      title:       String(title).trim(),
      url:         url         ? String(url).trim()         : "",
      type:        type        || "link",
      description: description ? String(description).trim() : "",
      project_id:  Number(project_id),
      created_by:  req.user.sub,
    });
    return res.status(201).json({ success: true, resource });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/user/resources/:id", authMiddleware, async (req, res) => {
  try {
    const { id }   = req.params;
    const resource = await db.getById("resources", id);
    if (!resource) return res.status(404).json({ success: false, message: "Recurso no encontrado" });
    if (resource.created_by !== req.user.sub) {
      return res.status(403).json({ success: false, message: "Solo podés eliminar tus propios recursos" });
    }
    if (resource.url?.startsWith("/api/files/")) {
      const filepath = path.join(UPLOADS_DIR, path.basename(resource.url));
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    await db.remove("resources", id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
