const state = {
  user: null,
  users: [],
  leads: []
};

/* =========================
   API HELPER
========================= */

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      typeof data === "object"
        ? data.message || JSON.stringify(data)
        : String(data)
    );
  }

  return data;
}

/* =========================
   SESSION
========================= */

async function loadSession() {
  console.log("🔐 Verificando sesión...");

  const result = await apiFetch("/api/me", { method: "GET" });

  if (!result?.user) {
    throw new Error("No autenticado");
  }

  if (result.user.role !== "admin") {
    throw new Error("No autorizado");
  }

  state.user = result.user;

  console.log("✅ Sesión válida:", state.user);
}

/* =========================
   USERS
========================= */

async function loadUsers() {
  console.log("📦 Cargando /api/admin/users...");

  const result = await apiFetch("/api/admin/users", { method: "GET" });

  console.log("✅ Usuarios:", result);

  state.users = result.users || [];

  renderUsers();
}

/* =========================
   LEADS
========================= */

async function loadLeads() {
  console.log("📦 Cargando /api/admin/leads...");

  const result = await apiFetch("/api/admin/leads", { method: "GET" });

  console.log("✅ Leads:", result);

  state.leads = result.leads || [];

  renderLeads();
}

/* =========================
   RENDER USERS
========================= */

function renderUsers() {
  const container = document.getElementById("usersTable");

  if (!container) return;

  if (!state.users.length) {
    container.innerHTML = "<p>No hay usuarios</p>";
    return;
  }

  container.innerHTML = `
    <table border="1" cellpadding="8">
      <thead>
        <tr>
          <th>Email</th>
          <th>Nombre</th>
          <th>Rol</th>
        </tr>
      </thead>
      <tbody>
        ${state.users
          .map(
            (u) => `
          <tr>
            <td>${u.email}</td>
            <td>${u.full_name || ""}</td>
            <td>${u.role}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================
   RENDER LEADS
========================= */

function renderLeads() {
  const container = document.getElementById("leadsTable");

  if (!container) return;

  if (!state.leads.length) {
    container.innerHTML = "<p>No hay leads</p>";
    return;
  }

  container.innerHTML = `
    <table border="1" cellpadding="8">
      <thead>
        <tr>
          <th>Email</th>
          <th>Proyecto</th>
          <th>Mensaje</th>
        </tr>
      </thead>
      <tbody>
        ${state.leads
          .map(
            (l) => `
          <tr>
            <td>${l.email}</td>
            <td>${l.project_type}</td>
            <td>${l.message}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================
   EVENTS
========================= */

function bindEvents() {
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/api/logout", { method: "POST" });
        window.location.href = "/login.html";
      } catch (error) {
        console.error("Error logout:", error);
      }
    });
  }
}

/* =========================
   INIT
========================= */

async function initAdmin() {
  try {
    await loadSession();
    bindEvents();

    // 🔥 IMPORTANTE: cargamos en paralelo
    await Promise.all([loadUsers(), loadLeads()]);
  } catch (error) {
    console.error("❌ Error admin:", error);

    const message = String(error.message || "").toLowerCase();

    if (
      message.includes("no autenticado") ||
      message.includes("sesión inválida") ||
      message.includes("no autorizado")
    ) {
      window.location.href = "/login.html";
      return;
    }

    alert("El admin cargó pero fallaron datos. Ver consola.");
  }
}

document.addEventListener("DOMContentLoaded", initAdmin);