/**
 * admin.js — OCHO Admin Console
 * Lógica completa del panel de administración.
 * Depende de: auth.js (para sesión/logout), API REST en /api/admin/*
 */

/* ===========================
   CONFIG & STATE
=========================== */

const API = "";          // mismo origen; cambiar a https://api.ocho.com.ar en producción
const POLL_INTERVAL = 60_000; // refresco automático cada 60s

const state = {
  users: [],
  leads: [],
  filteredUsers: [],
  filteredLeads: [],
  userSearch: "",
  userRoleFilter: "all",
  userStatusFilter: "all",
  leadSearch: "",
  leadStageFilter: "all",
  currentUser: null,
  activityLog: [],
  pollTimer: null,
};

/* ===========================
   INIT
=========================== */

document.addEventListener("DOMContentLoaded", async () => {
  await guardAdmin();
  setupNav();
  setupLogout();
  setupFilters();
  setupActions();
  await loadAll();
  startPolling();
});

/* ===========================
   AUTH GUARD
=========================== */

async function guardAdmin() {
  try {
    const res = await fetch(`${API}/api/me`, { credentials: "include" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      redirectToLogin("No autenticado.");
      return;
    }

    const role = (data.user?.role || "").toLowerCase().trim();
    if (role !== "admin") {
      window.location.href = "/panel.html";
      return;
    }

    state.currentUser = data.user;
    renderAdminIdentity(data.user);
  } catch {
    redirectToLogin("Error de conexión.");
  }
}

function redirectToLogin(msg) {
  sessionStorage.setItem("ocho_redirect_msg", msg);
  window.location.href = "/login.html";
}

function renderAdminIdentity(user) {
  setTextSafe("adminUserName", user.full_name || `${user.first_name} ${user.last_name}`.trim() || "Admin");
  setTextSafe("adminUserEmail", user.email || "");
  setTextSafe("adminUserRole", `Rol: ${user.role}`);
}

/* ===========================
   LOAD ALL DATA
=========================== */

async function loadAll() {
  showLoading(true);
  try {
    const [usersData, leadsData] = await Promise.all([
      apiFetch("/api/admin/users"),
      apiFetch("/api/admin/leads"),
    ]);

    state.users = usersData.users || [];
    state.leads = leadsData.leads || [];

    applyUserFilters();
    applyLeadFilters();
    renderStats();
    renderActivityLog();
  } catch (err) {
    showToast("Error cargando datos: " + err.message, "danger");
  } finally {
    showLoading(false);
  }
}

/* ===========================
   STATS
=========================== */

function renderStats() {
  const activeUsers = state.users.filter(u => (u.status || "active") === "active").length;
  const admins = state.users.filter(u => normalizeRole(u.role) === "admin").length;
  const pending = state.users.filter(u => u.status === "pending").length;
  const totalLeads = state.leads.length;
  const newLeads = state.leads.filter(l => (l.stage || "new") === "new").length;

  animateCount("statActiveUsers", activeUsers);
  animateCount("statTotalLeads", totalLeads);
  animateCount("statAdmins", admins);
  animateCount("statPendingUsers", pending);
  animateCount("statNewLeads", newLeads);

  renderSegmentBreakdown();
  renderLeadsBudgetBreakdown();
}

function renderSegmentBreakdown() {
  const segments = {};
  for (const u of state.users) {
    const s = u.segment || "newsletter_only";
    segments[s] = (segments[s] || 0) + 1;
  }

  const container = document.getElementById("segmentBreakdown");
  if (!container) return;

  const labels = {
    newsletter_only: "Newsletter",
    ai_interest: "IA / Sistemas",
    ecommerce_interest: "Ecommerce",
    editorial_interest: "Editorial",
    marketing_leads: "Marketing",
  };

  const total = state.users.length || 1;
  container.innerHTML = Object.entries(segments)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const pct = Math.round((count / total) * 100);
      const label = labels[key] || key;
      return `
        <div class="segment-row">
          <span class="segment-label">${label}</span>
          <div class="segment-bar-wrap">
            <div class="segment-bar" style="width:${pct}%"></div>
          </div>
          <span class="segment-count">${count} · ${pct}%</span>
        </div>`;
    })
    .join("");
}

function renderLeadsBudgetBreakdown() {
  const budgets = {};
  for (const l of state.leads) {
    const b = l.budget || "Sin especificar";
    budgets[b] = (budgets[b] || 0) + 1;
  }

  const container = document.getElementById("budgetBreakdown");
  if (!container) return;

  const total = state.leads.length || 1;
  container.innerHTML = Object.entries(budgets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="segment-row">
          <span class="segment-label">${key}</span>
          <div class="segment-bar-wrap">
            <div class="segment-bar" style="width:${pct}%; background: var(--admin-warning);"></div>
          </div>
          <span class="segment-count">${count}</span>
        </div>`;
    })
    .join("") || `<p class="admin-muted">Sin leads aún.</p>`;
}

/* ===========================
   USERS TABLE
=========================== */

function applyUserFilters() {
  const search = state.userSearch.toLowerCase();
  state.filteredUsers = state.users.filter(u => {
    const name = `${u.full_name || ""} ${u.email || ""} ${u.company || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(search);
    const matchRole = state.userRoleFilter === "all" || normalizeRole(u.role) === state.userRoleFilter;
    const matchStatus = state.userStatusFilter === "all" || (u.status || "active") === state.userStatusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById("adminUsersTableBody");
  if (!tbody) return;

  if (!state.filteredUsers.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="admin-muted" style="text-align:center;padding:32px;">Sin usuarios que coincidan.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.filteredUsers.map(user => {
    const role = normalizeRole(user.role);
    const status = user.status || "active";
    const name = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
    const lastLogin = user.last_login_at ? formatDate(user.last_login_at) : "Nunca";
    const isAdmin = role === "admin";

    return `
      <tr data-uuid="${escapeHtml(user.uuid || "")}">
        <td>
          <div class="user-cell">
            <div class="user-avatar" aria-hidden="true">${getInitials(name)}</div>
            <div>
              <strong>${escapeHtml(name)}</strong>
              <span class="admin-muted" style="display:block;font-size:0.82rem;">${escapeHtml(user.email || "")}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="admin-pill ${isAdmin ? "warning" : ""}">${role}</span>
        </td>
        <td>
          <span class="admin-pill ${status === "active" ? "success" : status === "pending" ? "warning" : "danger"}">${status}</span>
        </td>
        <td class="admin-muted" style="font-size:0.88rem;">${escapeHtml(lastLogin)}</td>
        <td class="admin-muted" style="font-size:0.82rem;">${escapeHtml(user.segment || "—")}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${isAdmin
              ? `<button class="admin-btn" onclick="changeRole('${escapeHtml(user.uuid || "")}', 'member')" title="Quitar admin">↓ Member</button>`
              : `<button class="admin-btn" onclick="changeRole('${escapeHtml(user.uuid || "")}', 'admin')" title="Hacer admin">↑ Admin</button>`
            }
            ${status === "banned"
              ? `<button class="admin-btn" style="color:var(--aok)" onclick="changeStatus('${escapeHtml(user.uuid || "")}', 'active')">✓ Activar</button>`
              : `<button class="admin-btn danger" onclick="changeStatus('${escapeHtml(user.uuid || "")}', 'banned')">⊘ Banear</button>`
            }
            <button class="admin-btn" onclick="openUserDetail('${escapeHtml(user.uuid || "")}')">Ver</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

/* ===========================
   LEADS TABLE
=========================== */

function applyLeadFilters() {
  const search = state.leadSearch.toLowerCase();
  state.filteredLeads = state.leads.filter(l => {
    const text = `${l.name || ""} ${l.email || ""} ${l.company || ""} ${l.project_type || ""}`.toLowerCase();
    const matchSearch = !search || text.includes(search);
    const matchStage = state.leadStageFilter === "all" || (l.stage || "new") === state.leadStageFilter;
    return matchSearch && matchStage;
  });

  renderLeadsTable();
}

function renderLeadsTable() {
  const tbody = document.getElementById("adminLeadsTableBody");
  if (!tbody) return;

  if (!state.filteredLeads.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-muted" style="text-align:center;padding:32px;">Sin leads que coincidan.</td></tr>`;
    return;
  }

  // Guardar leads indexados para acceso seguro desde onclick
  window._adminLeadsIndex = {};

  const sorted = state.filteredLeads
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  tbody.innerHTML = sorted.map((lead, i) => {
      const stage = lead.stage || "new";
      const key = `lead_${i}`;
      window._adminLeadsIndex[key] = lead;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(lead.name || "—")}</strong>
            <span class="admin-muted" style="display:block;font-size:0.82rem;">${escapeHtml(lead.email || "")}</span>
          </td>
          <td>${escapeHtml(lead.company || "—")}</td>
          <td><span class="admin-pill">${escapeHtml(lead.project_type || "—")}</span></td>
          <td class="admin-muted" style="font-size:0.88rem;">${escapeHtml(lead.budget || "—")}</td>
          <td>
            <span class="admin-pill ${stageColor(stage)}">${stage}</span>
          </td>
          <td class="admin-muted" style="font-size:0.82rem;">${lead.created_at ? formatDate(lead.created_at) : "—"}</td>
          <td>
            <button class="admin-btn" onclick="openLeadDetail('${key}')">Ver</button>
            ${stage === "new" ? `<button class="admin-btn" onclick="updateLeadStage('${escapeHtml(lead.nocodb_record_id || lead.Id || "")}', 'contacted')" style="margin-top:4px;">Contactado</button>` : ""}
          </td>
        </tr>`;
    }).join("");
}

function stageColor(stage) {
  if (stage === "new") return "warning";
  if (stage === "contacted") return "";
  if (stage === "qualified") return "success";
  if (stage === "closed") return "danger";
  return "";
}

/* ===========================
   ROLE MANAGEMENT
=========================== */

async function changeRole(uuid, newRole) {
  if (!uuid) return;
  const confirm = window.confirm(`¿Cambiar rol de este usuario a "${newRole}"?`);
  if (!confirm) return;

  try {
    const res = await apiFetch(`/api/admin/users/${uuid}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });

    if (res.success) {
      const idx = state.users.findIndex(u => u.uuid === uuid);
      if (idx !== -1) {
        state.users[idx] = { ...state.users[idx], role: newRole };
      }
      applyUserFilters();
      renderStats();
      logActivity(`Rol cambiado a "${newRole}" para UUID ${uuid.slice(0, 8)}…`);
      showToast(`Rol actualizado a ${newRole}`, "success");
    } else {
      showToast(res.message || "Error actualizando rol", "danger");
    }
  } catch (err) {
    showToast("Error: " + err.message, "danger");
  }
}

/* ===========================
   STATUS MANAGEMENT (ban/unban)
=========================== */

async function changeStatus(uuid, newStatus) {
  if (!uuid) return;
  const labels = { banned: "banear", active: "activar", pending: "poner en pendiente" };
  if (!window.confirm(`¿Estás seguro que querés ${labels[newStatus] || newStatus} este usuario?`)) return;

  try {
    const res = await apiFetch(`/api/admin/users/${uuid}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.success) {
      updateLocalUser(uuid, { status: newStatus });
      logActivity(`Status → "${newStatus}" · ${uuid.slice(0, 8)}…`);
      showToast(res.message || `Usuario ${newStatus}`, "success");
    } else {
      showToast(res.message || "Error actualizando status", "danger");
    }
  } catch (err) {
    showToast("Error: " + err.message, "danger");
  }
}

/* ===========================
   DELETE USER
=========================== */

async function deleteUser(uuid, userName) {
  if (!uuid) return;
  if (!window.confirm(`⚠️ ¿Eliminar permanentemente a "${userName}"?\n\nEsta acción NO se puede deshacer.`)) return;
  if (!window.confirm(`Confirmación final: ¿seguro que querés eliminar a "${userName}"?`)) return;

  try {
    const res = await apiFetch(`/api/admin/users/${uuid}`, { method: "DELETE" });
    if (res.success) {
      state.users = state.users.filter(u => u.uuid !== uuid);
      applyUserFilters();
      renderStats();
      logActivity(`Usuario eliminado · ${uuid.slice(0, 8)}…`);
      showToast("Usuario eliminado correctamente", "success");
      closeModal();
    } else {
      showToast(res.message || "Error eliminando usuario", "danger");
    }
  } catch (err) {
    showToast("Error: " + err.message, "danger");
  }
}

/* ===========================
   LOCAL STATE UPDATE
=========================== */

function updateLocalUser(uuid, changes) {
  const idx = state.users.findIndex(u => u.uuid === uuid);
  if (idx !== -1) state.users[idx] = { ...state.users[idx], ...changes };
  applyUserFilters();
  renderStats();
}

/* ===========================
   LEAD STAGE UPDATE
=========================== */

async function updateLeadStage(recordId, newStage) {
  if (!recordId) {
    showToast("ID de lead no disponible para esta operación.", "danger");
    return;
  }
  try {
    const res = await apiFetch(`/api/admin/leads/${recordId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage: newStage }),
    });
    if (res.success) {
      const idx = state.leads.findIndex(l => (l.nocodb_record_id || l.Id) === recordId);
      if (idx !== -1) state.leads[idx].stage = newStage;
      applyLeadFilters();
      showToast(`Lead marcado como "${newStage}"`, "success");
    } else {
      showToast(res.message || "Error actualizando lead", "danger");
    }
  } catch (err) {
    showToast("Error: " + err.message, "danger");
  }
}

/* ===========================
   MODALS: USER DETAIL
=========================== */

function openUserDetail(uuid) {
  const user = state.users.find(u => u.uuid === uuid);
  if (!user) return;

  const name = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";

  showModal(`
    <div class="modal-header">
      <div class="user-avatar large">${getInitials(name)}</div>
      <div style="flex:1">
        <h2 style="margin:0 0 4px;">${escapeHtml(name)}</h2>
        <span class="admin-muted">${escapeHtml(user.email || "")}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
        ${normalizeRole(user.role) !== "admin"
          ? `<button class="admin-btn" onclick="changeRole('${escapeHtml(user.uuid || "")}', 'admin')">↑ Admin</button>`
          : `<button class="admin-btn" onclick="changeRole('${escapeHtml(user.uuid || "")}', 'member')">↓ Member</button>`
        }
        ${(user.status || "active") === "banned"
          ? `<button class="admin-btn" style="color:var(--aok)" onclick="changeStatus('${escapeHtml(user.uuid || "")}', 'active')">✓ Activar</button>`
          : `<button class="admin-btn danger" onclick="changeStatus('${escapeHtml(user.uuid || "")}', 'banned')">⊘ Banear</button>`
        }
        <button class="admin-btn danger" onclick="deleteUser('${escapeHtml(user.uuid || "")}', '${escapeHtml(name)}')">🗑 Eliminar</button>
      </div>
    </div>
    <div class="modal-grid">
      ${modalRow("Rol", user.role || "member")}
      ${modalRow("Estado", user.status || "active")}
      ${modalRow("Segmento", user.segment || "—")}
      ${modalRow("Ciudad", user.city || "—")}
      ${modalRow("País", user.country || "—")}
      ${modalRow("Empresa", user.company || "—")}
      ${modalRow("Rol (profesional)", user.role_title || "—")}
      ${modalRow("Teléfono", user.phone || "—")}
      ${modalRow("Interés", user.interest || "—")}
      ${modalRow("Fuente", user.source || "—")}
      ${modalRow("Último login", user.last_login_at ? formatDate(user.last_login_at) : "Nunca")}
      ${modalRow("Newsletter consent", user.newsletter_consent ? "✓ Sí" : "No")}
      ${modalRow("Data consent", user.data_consent ? "✓ Sí" : "No")}
      ${user.profile ? `<div class="modal-row full"><span class="modal-label">Perfil</span><p class="admin-muted">${escapeHtml(user.profile)}</p></div>` : ""}
    </div>
  `);
}

/* ===========================
   MODALS: LEAD DETAIL
=========================== */

function openLeadDetail(keyOrLead) {
  let lead;
  if (typeof keyOrLead === "string" && keyOrLead.startsWith("lead_")) {
    lead = window._adminLeadsIndex?.[keyOrLead];
    if (!lead) return;
  } else {
    lead = keyOrLead;
  }

  showModal(`
    <div class="modal-header">
      <h2 style="margin:0 0 4px;">${escapeHtml(lead.name || "Lead")}</h2>
      <span class="admin-muted">${escapeHtml(lead.email || "")}</span>
    </div>
    <div class="modal-grid">
      ${modalRow("Empresa", lead.company || "—")}
      ${modalRow("Proyecto", lead.project_type || "—")}
      ${modalRow("Presupuesto", lead.budget || "—")}
      ${modalRow("Stage", lead.stage || "new")}
      ${modalRow("Segmento", lead.segment || "—")}
      ${modalRow("Fuente", lead.source || "—")}
      ${modalRow("Fecha", lead.created_at ? formatDate(lead.created_at) : "—")}
    </div>
    ${lead.message ? `
      <div style="margin-top:16px;">
        <span class="modal-label">Mensaje</span>
        <div class="admin-card" style="padding:14px;margin-top:8px;font-size:0.94rem;line-height:1.6;">${escapeHtml(lead.message)}</div>
      </div>` : ""}
  `);
}

/* ===========================
   MODAL ENGINE
=========================== */

function showModal(html) {
  let overlay = document.getElementById("adminModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "adminModal";
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;
      display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="admin-card modal-inner" style="max-width:640px;width:100%;max-height:80vh;overflow-y:auto;position:relative;">
      <button onclick="closeModal()" style="
        position:sticky;top:0;float:right;background:none;border:none;
        color:#fff;font-size:1.4rem;cursor:pointer;line-height:1;padding:4px 8px;
      " aria-label="Cerrar">✕</button>
      ${html}
    </div>`;

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const overlay = document.getElementById("adminModal");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
}

window.closeModal = closeModal;

/* ===========================
   ACTIVITY LOG
=========================== */

function logActivity(message) {
  const now = new Date();
  state.activityLog.unshift({
    message,
    time: now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
  });
  if (state.activityLog.length > 20) state.activityLog.pop();
  renderActivityLog();
}

function renderActivityLog() {
  const container = document.getElementById("activityLog");
  if (!container) return;

  if (!state.activityLog.length) {
    container.innerHTML = `<p class="admin-muted">Sin actividad registrada en esta sesión.</p>`;
    return;
  }

  container.innerHTML = state.activityLog.map(entry => `
    <div class="admin-list-item">
      <strong>${escapeHtml(entry.time)} · ${escapeHtml(entry.message)}</strong>
    </div>`).join("");
}

/* ===========================
   FILTERS SETUP
=========================== */

function setupFilters() {
  // Usuarios
  on("userSearchInput", "input", e => {
    state.userSearch = e.target.value;
    applyUserFilters();
  });

  on("userRoleFilter", "change", e => {
    state.userRoleFilter = e.target.value;
    applyUserFilters();
  });

  on("userStatusFilter", "change", e => {
    state.userStatusFilter = e.target.value;
    applyUserFilters();
  });

  // Leads
  on("leadSearchInput", "input", e => {
    state.leadSearch = e.target.value;
    applyLeadFilters();
  });

  on("leadStageFilter", "change", e => {
    state.leadStageFilter = e.target.value;
    applyLeadFilters();
  });
}

/* ===========================
   ACTIONS SETUP
=========================== */

function setupActions() {
  on("btnRefresh", "click", () => {
    logActivity("Datos recargados manualmente.");
    loadAll();
  });

  on("btnExportUsers", "click", () => exportCSV(state.filteredUsers, "ocho_usuarios.csv"));
  on("btnExportLeads", "click", () => exportCSV(state.filteredLeads, "ocho_leads.csv"));
}

/* ===========================
   SIDEBAR NAV
=========================== */

function setupNav() {
  const navLinks = document.querySelectorAll(".admin-nav a[href^='#']");
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      navLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

/* ===========================
   LOGOUT
=========================== */

function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch(`${API}/api/logout`, { method: "POST", credentials: "include" });
      } catch { /* ignore */ }
      window.location.href = "/login.html";
    });
  }
}

/* ===========================
   POLLING
=========================== */

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    loadAll();
    logActivity("Auto-refresco de datos.");
  }, POLL_INTERVAL);
}

/* ===========================
   EXPORT CSV
=========================== */

function exportCSV(rows, filename) {
  if (!rows.length) {
    showToast("No hay datos para exportar.", "danger");
    return;
  }

  const keys = Object.keys(rows[0]).filter(k => !["password_hash", "passwordHash"].includes(k));
  const header = keys.join(",");
  const body = rows.map(row =>
    keys.map(k => {
      const v = row[k] ?? "";
      const str = String(v).replace(/"/g, '""');
      return `"${str}"`;
    }).join(",")
  ).join("\n");

  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  logActivity(`Exportado: ${filename}`);
  showToast(`Exportado ${rows.length} registros.`, "success");
}

/* ===========================
   TOAST
=========================== */

function showToast(message, type = "") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:2000;
      display:flex;flex-direction:column;gap:10px;max-width:320px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const colors = { success: "var(--admin-success)", danger: "var(--admin-danger)", "": "#fff" };
  toast.style.cssText = `
    background:rgba(10,10,10,0.95);border:1px solid rgba(255,255,255,0.1);
    padding:14px 18px;border-radius:16px;font-size:0.92rem;
    color:${colors[type] || "#fff"};
    animation:fadeInUp .25s ease;
  `;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ===========================
   LOADING STATE
=========================== */

function showLoading(on) {
  const el = document.getElementById("adminLoadingBar");
  if (el) el.style.display = on ? "block" : "none";
}

/* ===========================
   ANIMATED COUNT
=========================== */

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();

  const tick = (now) => {
    const elapsed = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (elapsed < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ===========================
   API HELPER
=========================== */

async function apiFetch(path, options = {}) {
  const defaults = {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  const res = await fetch(`${API}${path}`, { ...defaults, ...options });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

/* ===========================
   UTILITIES
=========================== */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
}

function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function modalRow(label, value) {
  return `
    <div class="modal-row">
      <span class="modal-label">${escapeHtml(label)}</span>
      <span>${escapeHtml(String(value))}</span>
    </div>`;
}

/* ===========================
   GLOBAL EXPOSURE
=========================== */

window.changeRole = changeRole;
window.changeStatus = changeStatus;
window.deleteUser = deleteUser;
window.openUserDetail = openUserDetail;
window.openLeadDetail = openLeadDetail;
window.updateLeadStage = updateLeadStage;
