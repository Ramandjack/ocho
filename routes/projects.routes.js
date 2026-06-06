/**
 * projects.routes.js — Rutas de proyectos
 *
 * INTEGRACIÓN en server.js:
 *   import projectsRouter from './projects.routes.js';
 *   app.use('/api', projectsRouter);
 *
 * Middleware importado desde middleware/auth.js
 */

import express from "express";
import { db } from "../services/nocodb.service.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ===========================
   ADMIN — CRUD PROYECTOS
=========================== */

// GET /api/admin/projects — listar todos
router.get("/admin/projects", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const projects = await db.getAll("projects");
    return res.json({ success: true, projects });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/projects — crear proyecto
router.post("/admin/projects", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, description, status, type, due_date } = req.body || {};

    if (!title) {
      return res.status(400).json({ success: false, message: "El título es obligatorio" });
    }

    const project = await db.insert("projects", {
      title: String(title).trim(),
      description: String(description || "").trim(),
      status: status || "draft",
      type: type || "web",
      created_by: req.user.sub,
      due_date: due_date || null,
    });

    const projectId = Number(project.nocodb_id ?? project.id);

    // Auto-asignar al creador como owner
    await db.insert("user_projects", {
      user_uuid:  req.user.sub,
      project_id: projectId,
      permission: "editor",
    });

    await db.logActivity(
      req.user.sub,
      "create",
      "project",
      projectId,
      `Proyecto creado: "${title}"`
    );

    return res.status(201).json({ success: true, project: { ...project, permission: "editor" } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/projects/:id — editar proyecto
router.patch("/admin/projects/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, type, due_date } = req.body || {};

    const fields = {};
    if (title !== undefined) fields.title = String(title).trim();
    if (description !== undefined) fields.description = String(description).trim();
    if (status !== undefined) fields.status = status;
    if (type !== undefined) fields.type = type;
    if (due_date !== undefined) fields.due_date = due_date;

    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: "Sin campos para actualizar" });
    }

    const updated = await db.update("projects", id, fields);

    await db.logActivity(
      req.user.sub,
      "update",
      "project",
      id,
      `Proyecto actualizado: ${JSON.stringify(fields)}`
    );

    // Notificar a usuarios asignados si cambia el status
    if (fields.status) {
      const assignments = await db.getWhere("user_projects", `(project_id,eq,${id})`);
      const userUuids = assignments.map(a => a.user_uuid).filter(Boolean);
      if (userUuids.length) {
        await db.sendNotificationToMany(
          userUuids,
          "project",
          "Proyecto actualizado",
          `El proyecto cambió su estado a: ${fields.status}`,
          `/app/panel#projects`
        );
      }
    }

    return res.json({ success: true, project: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/projects/:id — eliminar proyecto
router.delete("/admin/projects/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Eliminar asignaciones relacionadas
    const assignments = await db.getWhere("user_projects", `(project_id,eq,${id})`);
    await Promise.allSettled(
      assignments.map(a => db.remove("user_projects", a.nocodb_id || a.id))
    );

    await db.remove("projects", id);

    await db.logActivity(req.user.sub, "delete", "project", id, `Proyecto eliminado`);

    return res.json({ success: true, message: "Proyecto eliminado", id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/projects/:id/assign — asignar usuarios a proyecto
router.post("/admin/projects/:id/assign", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_uuids, permission: raw } = req.body || {};
    const permission = ["viewer", "editor"].includes(raw) ? raw : "viewer";

    if (!Array.isArray(user_uuids) || !user_uuids.length) {
      return res.status(400).json({ success: false, message: "user_uuids debe ser un array" });
    }

    const results = [];

    for (const user_uuid of user_uuids) {
      // Verificar si ya existe la asignación
      const existing = await db.getWhere(
        "user_projects",
        `(user_uuid,eq,${user_uuid})~and(project_id,eq,${id})`
      );

      if (existing.length) {
        // Actualizar permiso si ya existe
        const updated = await db.update("user_projects", existing[0].nocodb_id || existing[0].id, {
          permission,
        });
        results.push(updated);
      } else {
        // Crear nueva asignación
        const created = await db.insert("user_projects", {
          user_uuid,
          project_id: Number(id),
          permission,
        });
        results.push(created);

        // Notificar al usuario
        await db.sendNotification(
          user_uuid,
          "project",
          "Nuevo proyecto asignado",
          `Se te asignó un proyecto con permiso: ${permission}`,
          `/app/panel#projects`
        );
      }
    }

    await db.logActivity(
      req.user.sub,
      "assign",
      "project",
      id,
      `Usuarios asignados: ${user_uuids.join(", ")}`
    );

    return res.json({ success: true, assignments: results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/projects/:id/assign/:userUuid — quitar usuario de proyecto
router.delete("/admin/projects/:id/assign/:userUuid", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, userUuid } = req.params;

    const existing = await db.getWhere(
      "user_projects",
      `(user_uuid,eq,${userUuid})~and(project_id,eq,${id})`
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Asignación no encontrada" });
    }

    await db.remove("user_projects", existing[0].nocodb_id || existing[0].id);

    await db.logActivity(
      req.user.sub,
      "unassign",
      "project",
      id,
      `Usuario removido: ${userUuid}`
    );

    return res.json({ success: true, message: "Usuario removido del proyecto" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   USER — VER SUS PROYECTOS
=========================== */

// GET /api/user/projects — proyectos asignados al usuario logueado
router.get("/user/projects", authMiddleware, async (req, res) => {
  try {
    const userUuid = req.user.sub;

    // Obtener asignaciones del usuario
    const assignments = await db.getWhere("user_projects", `(user_uuid,eq,${userUuid})`);

    if (!assignments.length) {
      return res.json({ success: true, projects: [] });
    }

    // Obtener todos los proyectos y filtrar por los asignados
    const projectIds = assignments.map(a => Number(a.project_id));
    const allProjects = await db.getAll("projects");

    const projects = allProjects
      .filter(p => projectIds.includes(Number(p.id || p.nocodb_id)))
      .map(p => {
        const assignment = assignments.find(a => Number(a.project_id) === Number(p.id || p.nocodb_id));
        return {
          ...p,
          permission: assignment?.permission || "viewer",
        };
      });

    return res.json({ success: true, projects });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/projects/:id — detalle de un proyecto (si está asignado)
router.get("/user/projects/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userUuid = req.user.sub;

    const assignment = await db.getWhere(
      "user_projects",
      `(user_uuid,eq,${userUuid})~and(project_id,eq,${id})`
    );

    if (!assignment.length) {
      return res.status(403).json({ success: false, message: "Sin acceso a este proyecto" });
    }

    const project = await db.getById("projects", id);
    const tasks = await db.getWhere("tasks", `(project_id,eq,${id})~and(assigned_to,eq,${userUuid})`);

    return res.json({
      success: true,
      project: { ...project, permission: assignment[0].permission },
      tasks,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ===========================
   PROJECT MESSAGES (feedback thread)

   NocoDB table: project_messages
   Required fields:
     project_id   (Number)
     user_uuid    (Text)
     author_name  (Text)
     author_role  (Text)   — "admin" | "member" | "client"
     content      (Long Text)
=========================== */

async function assertProjectAccess(userUuid, projectId) {
  const rows = await db.getWhere(
    "user_projects",
    `(user_uuid,eq,${userUuid})~and(project_id,eq,${projectId})`
  );
  return rows.length > 0;
}

// GET /api/user/projects/:id/messages
router.get("/user/projects/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await assertProjectAccess(req.user.sub, id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Sin acceso a este proyecto" });
    }

    const msgs = await db.getWhere("project_messages", `(project_id,eq,${id})`);
    const sorted = msgs.sort((a, b) => new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0));
    return res.json({ success: true, messages: sorted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/projects/:id/messages
router.post("/user/projects/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userUuid = req.user.sub;
    const content = String(req.body?.content || "").trim();

    if (!content) {
      return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío" });
    }

    const hasAccess = await assertProjectAccess(userUuid, id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Sin acceso a este proyecto" });
    }

    const userRow = await db.findOne("users", "uuid", userUuid);

    const message = await db.insert("project_messages", {
      project_id:  Number(id),
      user_uuid:   userUuid,
      author_name: userRow?.full_name || userRow?.first_name || "Usuario",
      author_role: userRow?.role || "client",
      content,
    });

    await db.logActivity(userUuid, "message", "project", id, `Mensaje: ${content.slice(0, 60)}`);

    // Notify admins when a non-admin writes
    if (!["admin", "member"].includes(String(userRow?.role || "").toLowerCase())) {
      const allAdmins = await db.getWhere("users", "(role,eq,admin)");
      if (allAdmins.length) {
        await db.sendNotificationToMany(
          allAdmins.map(a => a.uuid).filter(Boolean),
          "project",
          "Nuevo mensaje de cliente",
          `${userRow?.full_name || "Cliente"} escribió en el proyecto #${id}`,
          `/app/panel/projects/${id}`
        );
      }
    }

    return res.status(201).json({ success: true, message });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/projects/:id/messages — admin puede leer sin estar asignado
router.get("/admin/projects/:id/messages", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const msgs = await db.getWhere("project_messages", `(project_id,eq,${id})`);
    const sorted = msgs.sort((a, b) => new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0));
    return res.json({ success: true, messages: sorted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/projects/:id/messages — admin responde desde el admin panel
router.post("/admin/projects/:id/messages", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userUuid = req.user.sub;
    const content = String(req.body?.content || "").trim();

    if (!content) {
      return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío" });
    }

    const userRow = await db.findOne("users", "uuid", userUuid);

    const message = await db.insert("project_messages", {
      project_id:  Number(id),
      user_uuid:   userUuid,
      author_name: userRow?.full_name || userRow?.first_name || "OCHO",
      author_role: "admin",
      content,
    });

    // Notify project members
    const assignments = await db.getWhere("user_projects", `(project_id,eq,${id})`);
    const clientUuids = assignments
      .map(a => a.user_uuid)
      .filter(uuid => uuid !== userUuid);

    if (clientUuids.length) {
      await db.sendNotificationToMany(
        clientUuids,
        "project",
        "Nuevo mensaje del equipo",
        content.slice(0, 80),
        `/app/panel/projects/${id}`
      );
    }

    return res.status(201).json({ success: true, message });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
