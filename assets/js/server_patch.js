/**
 * server_patch.js — ENDPOINTS ADICIONALES PARA server.js
 *
 * Agrega estos bloques a tu server.js, dentro de la sección /* ADMIN API *\/
 * ANTES de la sección /* START *\/
 */

/* =========================
   PATCH /api/admin/leads/:id/stage
   Actualiza el stage de un lead por su NocoDB record ID
========================= */

app.patch("/api/admin/leads/:id/stage", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body || {};

    const allowedStages = ["new", "contacted", "qualified", "closed"];
    if (!allowedStages.includes(String(stage || "").toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Stage inválido. Valores permitidos: new, contacted, qualified, closed"
      });
    }

    if (!NOCODB_TOKEN || !NOCODB_LEADS_URL) {
      return res.status(503).json({
        success: false,
        message: "NocoDB no configurado"
      });
    }

    const baseUrl = NOCODB_LEADS_URL.replace(/\/$/, "");
    const updateUrl = `${baseUrl}/${id}`;

    const result = await ncdbFetch(updateUrl, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          stage: String(stage).toLowerCase()
        }
      })
    });

    return res.json({
      success: true,
      message: "Stage actualizado correctamente",
      lead: flattenRecord(result)
    });
  } catch (error) {
    console.error("Error en /api/admin/leads/:id/stage:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "No se pudo actualizar el stage del lead"
    });
  }
});


/* =========================
   PATCH /api/admin/users/:uuid/status
   Activa o bloquea un usuario
========================= */

app.patch("/api/admin/users/:uuid/status", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { status } = req.body || {};

    const allowedStatuses = ["active", "pending", "blocked"];
    if (!allowedStatuses.includes(String(status || "").toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Status inválido. Valores: active, pending, blocked"
      });
    }

    const users = await getAllUsers();
    const target = users.find((u) => u.uuid === uuid);

    if (!target) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const recordId = target.nocodb_record_id || target.Id || target.id;
    if (!recordId) {
      return res.status(422).json({ success: false, message: "No se encontró el record id del usuario" });
    }

    const baseUrl = NOCODB_USERS_URL.replace(/\/$/, "");
    const updateUrl = `${baseUrl}/${recordId}`;

    const result = await ncdbFetch(updateUrl, {
      method: "PATCH",
      body: JSON.stringify({ fields: { status: String(status).toLowerCase() } })
    });

    return res.json({
      success: true,
      message: "Status actualizado",
      user: sanitizeUser(flattenRecord(result))
    });
  } catch (error) {
    console.error("Error en /api/admin/users/:uuid/status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "No se pudo actualizar el status"
    });
  }
});


/* =========================
   GET /api/admin/stats
   Resumen de métricas para el dashboard
========================= */

app.get("/api/admin/stats", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const [users, leads] = await Promise.all([getAllUsers(), getAllLeads()]);

    const now = new Date();
    const last30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      users: {
        total: users.length,
        active: users.filter(u => (u.status || "active") === "active").length,
        pending: users.filter(u => u.status === "pending").length,
        admins: users.filter(u => normalizeRole(u.role) === "admin").length,
        last30Days: users.filter(u => u.created_at && new Date(u.created_at) >= last30).length,
        bySegment: groupByField(users, "segment"),
        byCountry: groupByField(users, "country"),
      },
      leads: {
        total: leads.length,
        new: leads.filter(l => (l.stage || "new") === "new").length,
        contacted: leads.filter(l => l.stage === "contacted").length,
        qualified: leads.filter(l => l.stage === "qualified").length,
        closed: leads.filter(l => l.stage === "closed").length,
        last30Days: leads.filter(l => l.created_at && new Date(l.created_at) >= last30).length,
        byBudget: groupByField(leads, "budget"),
        byProjectType: groupByField(leads, "project_type"),
      }
    };

    return res.json({ success: true, stats });
  } catch (error) {
    console.error("Error en /api/admin/stats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo stats"
    });
  }
});

/* Helper — nombre único para no colisionar con otras funciones en server.js */
function groupByField(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "sin_datos";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
