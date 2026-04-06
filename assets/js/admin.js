const API_BASE =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:3000"
    : "https://api.ocho.com.ar";

const state = {
  currentUser: null,
  users: [],
  leads: [],
  stats: null
};

function normalizeRole(role) {
  if (Array.isArray(role)) {
    return String(role[0] || "").toLowerCase();
  }
  return String(role || "").toLowerCase();
}

async function apiFetch(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("API ERROR:", url, data);
    throw new Error(data.message || "Ocurrió un error");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function roleBadge(role) {
  const safeRole = normalizeRole(role) || "member";
  return `<span class="admin-pill">${escapeHtml(safeRole)}</span>`;
}

function statusBadge(status) {
  const safeStatus = String(status || "inactive").toLowerCase();

  let variant = "";
  if (safeStatus === "active") variant = "success";
  if (safeStatus === "pending") variant = "warning";
  if (safeStatus === "blocked" || safeStatus === "inactive") variant = "danger";

  return `<span class="admin-pill ${variant}">${escapeHtml(safeStatus)}</span>`;
}

function setAdminIdentity(user) {
  const adminName = document.getElementById("adminUserName");
  const adminEmail = document.getElementById("adminUserEmail");
  const adminRole = document.getElementById("adminUserRole");

  const fullName =
    user.full_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    "Administrador";

  if (adminName) adminName.textContent = fullName;
  if (adminEmail) adminEmail.textContent = user.email || "Sin email";
  if (adminRole) adminRole.textContent = `Rol: ${normalizeRole(user.role) || "admin"}`;
}

function renderStats(stats) {
  const activeUsers = document.getElementById("statActiveUsers");
  const totalLeads = document.getElementById("statTotalLeads");
  const admins = document.getElementById("statAdmins");
  const pendingUsers = document.getElementById("statPendingUsers");

  if (activeUsers) activeUsers.textContent = stats.activeUsers;
  if (totalLeads) totalLeads.textContent = stats.totalLeads;
  if (admins) admins.textContent = stats.adminUsers;
  if (pendingUsers) pendingUsers.textContent = stats.pendingUsers;
}

function renderUsersTable(users) {
  const tbody = document.getElementById("adminUsersTableBody");
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No hay usuarios disponibles.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users
    .map((user) => {
      const fullName =
        user.full_name ||
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        "Sin nombre";

      return `
        <tr>
          <td>
            ${escapeHtml(fullName)}<br>
            <span class="admin-muted">${escapeHtml(user.email || "Sin email")}</span>
          </td>
          <td>${roleBadge(user.role)}</td>
          <td>${statusBadge(user.status)}</td>
          <td>${formatDate(user.last_login_at || user.CreatedAt || user.created_at)}</td>
          <td>
            <button class="admin-btn" data-action="toggle-role" data-uuid="${escapeHtml(user.uuid)}">
              Cambiar rol
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById("adminLeadsTableBody");
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No hay leads disponibles.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = leads
    .map((lead) => `
      <tr>
        <td>
          ${escapeHtml(lead.name || "Sin nombre")}<br>
          <span class="admin-muted">${escapeHtml(lead.email || "Sin email")}</span>
        </td>
        <td>${escapeHtml(lead.company || "—")}</td>
        <td>${escapeHtml(lead.project_type || "—")}</td>
        <td>${escapeHtml(lead.budget || "—")}</td>
        <td>${formatDate(lead.created_at || lead.CreatedAt)}</td>
      </tr>
    `)
    .join("");
}

async function loadSession() {
  console.log("Verificando sesión...");
  const result = await apiFetch("/api/me", { method: "GET" });
  const user = result?.user || {};

  if (normalizeRole(user.role) !== "admin") {
    window.location.href = "/panel.html";
    return null;
  }

  state.currentUser = user;
  setAdminIdentity(user);

  console.log("Sesión OK:", user.email, "| role:", normalizeRole(user.role));
  return user;
}

async function loadUsers() {
  console.log("Cargando usuarios...");
  const result = await apiFetch("/api/admin/users", { method: "GET" });
  state.users = result.users || [];
  console.log("Usuarios:", state.users.length);
  return state.users;
}

async function loadLeads() {
  console.log("Cargando leads...");
  const result = await apiFetch("/api/admin/leads", { method: "GET" });
  state.leads = result.leads || [];
  console.log("Leads:", state.leads.length);
  return state.leads;
}

function buildStats() {
  const users = state.users;
  const leads = state.leads;

  const stats = {
    activeUsers: users.filter((u) => String(u.status || "").toLowerCase() === "active").length,
    totalLeads: leads.length,
    adminUsers: users.filter((u) => normalizeRole(u.role) === "admin").length,
    pendingUsers: users.filter((u) => String(u.status || "").toLowerCase() === "pending").length
  };

  state.stats = stats;
  renderStats(stats);
}

async function toggleUserRole(uuid) {
  const user = state.users.find((u) => u.uuid === uuid);
  if (!user) return;

  const nextRole = normalizeRole(user.role) === "admin" ? "member" : "admin";

  await apiFetch(`/api/admin/users/${encodeURIComponent(uuid)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role: nextRole })
  });

  await refreshAdminData();
}

function bindEvents() {
  const usersTable = document.getElementById("adminUsersTableBody");
  const logoutBtn = document.getElementById("logoutBtn");

  if (usersTable) {
    usersTable.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action='toggle-role']");
      if (!button) return;

      const uuid = button.dataset.uuid;
      if (!uuid) return;

      try {
        await toggleUserRole(uuid);
      } catch (error) {
        alert(error.message || "No se pudo actualizar el rol");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      try {
        await apiFetch("/api/logout", { method: "POST" });
      } catch {
        // ignore
      } finally {
        window.location.href = "/login.html";
      }
    });
  }
}

async function refreshAdminData() {
  const usersPromise = loadUsers();
  const leadsPromise = loadLeads();

  const users = await usersPromise;
  renderUsersTable(users);

  try {
    const leads = await leadsPromise;
    renderLeadsTable(leads);
  } catch (error) {
    console.error("Error leads:", error);
    renderLeadsTable([]);
  }

  buildStats();
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadSession();
    bindEvents();
    await refreshAdminData();
  } catch (error) {
    console.error("Error cargando admin:", error);

    const msg = String(error?.message || "").toLowerCase();

    if (
      msg.includes("no autenticado") ||
      msg.includes("sesión inválida") ||
      msg.includes("no autorizado")
    ) {
      window.location.href = "/login.html";
      return;
    }

    alert("El panel admin abrió sesión, pero hubo un error cargando datos. Revisá la consola.");
  }
});