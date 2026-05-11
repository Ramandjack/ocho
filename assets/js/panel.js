/**
 * panel.js — OCHO Member Panel
 * Dashboard del usuario autenticado (no-admin).
 * Depende de: API REST en /api/me, /api/logout
 */

const API = "";

document.addEventListener("DOMContentLoaded", async () => {
  await initPanel();
});

/* ===========================
   INIT
=========================== */

async function initPanel() {
  try {
    const res = await fetch(`${API}/api/me`, { credentials: "include" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      window.location.href = "/login.html";
      return;
    }

    renderUser(data.user);
    setupLogout(data.user);
    setupProfileForm(data.user);
    animateWelcome();
  } catch {
    window.location.href = "/login.html";
  }
}

/* ===========================
   RENDER USER DATA
=========================== */

function renderUser(user) {
  const name = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Miembro";
  const firstName = user.first_name || name.split(" ")[0];

  // Header panel
  setHTML("authUserName", escapeHtml(name));
  setHTML("authUserEmail", escapeHtml(user.email || ""));

  // Welcome greeting
  setHTML("panelGreeting", `Hola, ${escapeHtml(firstName)}.`);

  // Role badge
  const role = (user.role || "member").toLowerCase();
  const roleBadge = document.getElementById("panelRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = role === "admin" ? "Admin" : "Miembro";
    roleBadge.className = `member-badge ${role === "admin" ? "admin" : ""}`;
  }

  // Segment chip
  setHTML("panelSegment", segmentLabel(user.segment));

  // Interest
  setHTML("panelInterest", interestLabel(user.interest));

  // Stats cards
  setHTML("panelCity", escapeHtml(user.city || "—"));
  setHTML("panelCountry", escapeHtml(user.country || "—"));
  setHTML("panelCompany", escapeHtml(user.company || "—"));
  setHTML("panelSource", escapeHtml(user.source || "register_form"));

  // Si es admin, mostrar acceso
  const adminLink = document.getElementById("adminAccessCard");
  if (adminLink && role === "admin") {
    adminLink.style.display = "block";
  }

  // Consent status
  renderConsentStatus(user);
}

/* ===========================
   CONSENT STATUS
=========================== */

function renderConsentStatus(user) {
  const el = document.getElementById("consentStatus");
  if (!el) return;

  el.innerHTML = `
    <div class="consent-line ${user.newsletter_consent ? "ok" : "no"}">
      ${user.newsletter_consent ? "✓" : "✗"} Newsletter activado
    </div>
    <div class="consent-line ${user.data_consent ? "ok" : "no"}">
      ${user.data_consent ? "✓" : "✗"} Datos de CRM autorizados
    </div>
  `;
}

/* ===========================
   PROFILE FORM (lectura)
=========================== */

function setupProfileForm(user) {
  const fields = {
    profileName: user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    profileEmail: user.email || "",
    profilePhone: user.phone || "",
    profileCity: user.city || "",
    profileCompany: user.company || "",
    profileRole: user.role_title || "",
  };

  for (const [id, value] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
}

/* ===========================
   LOGOUT
=========================== */

function setupLogout(user) {
  const buttons = document.querySelectorAll("[id^='logoutBtn']");
  buttons.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch(`${API}/api/logout`, { method: "POST", credentials: "include" });
      } catch { /* ignore */ }
      window.location.href = "/login.html";
    });
  });
}

/* ===========================
   ANIMATE WELCOME
=========================== */

function animateWelcome() {
  const cards = document.querySelectorAll(".panel-fade-in");
  cards.forEach((card, i) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(16px)";
    setTimeout(() => {
      card.style.transition = "opacity .4s ease, transform .4s ease";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    }, 80 + i * 60);
  });
}

/* ===========================
   LABEL HELPERS
=========================== */

function segmentLabel(segment) {
  const map = {
    newsletter_only: "Newsletter",
    ai_interest: "IA · Sistemas",
    ecommerce_interest: "Ecommerce",
    editorial_interest: "Editorial",
    marketing_leads: "Marketing",
  };
  return map[segment] || segment || "General";
}

function interestLabel(interest) {
  const map = {
    branding: "Branding",
    digital_products: "Productos digitales",
    ai_systems: "IA · Automatización",
    ecommerce: "Ecommerce",
    marketing: "Marketing",
    editorial: "Editorial",
    all: "Todos los temas",
  };
  return map[interest] || interest || "—";
}

/* ===========================
   UTILITIES
=========================== */

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
