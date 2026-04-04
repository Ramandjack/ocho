const API_BASE =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:3000"
    : "https://ocho-backend.onrender.com";

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const authStatus = document.getElementById("authStatus");

function setStatus(message, type = "") {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.className = "form-status";
  if (type) authStatus.classList.add(type);
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
    throw new Error(data.message || "Ocurrió un error");
  }

  return data;
}

/* =========================
   SESSION
========================= */

async function getCurrentUser() {
  return apiFetch("/api/me", { method: "GET" });
}

async function requireAuth() {
  try {
    document.body.classList.add("auth-loading");

    const result = await getCurrentUser();

    document.documentElement.setAttribute("data-auth", "true");
    document.body.classList.remove("auth-loading");
    document.body.classList.add("auth-ready");

    const authName = document.getElementById("authUserName");
    const authEmail = document.getElementById("authUserEmail");

    if (authName && result?.user) {
      const fullName = [result.user.first_name, result.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      authName.textContent = fullName || "Usuario";
    }

    if (authEmail && result?.user?.email) {
      authEmail.textContent = result.user.email;
    }

    return result.user;
  } catch (_error) {
    window.location.href = "/login.html";
    return null;
  }
}

async function logoutAndRedirect() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (_error) {
    // ignore
  } finally {
    window.location.href = "/login.html";
  }
}

/* =========================
   REGISTER
========================= */

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Creando cuenta...");

    const formData = new FormData(registerForm);

    const payload = {
      first_name: formData.get("first_name")?.toString().trim(),
      last_name: formData.get("last_name")?.toString().trim(),
      email: formData.get("email")?.toString().trim(),
      city: formData.get("city")?.toString().trim(),
      country: formData.get("country")?.toString().trim(),
      phone: formData.get("phone")?.toString().trim(),
      company: formData.get("company")?.toString().trim(),
      role: formData.get("role")?.toString().trim(),
      interest: formData.get("interest")?.toString().trim(),
      profile: formData.get("profile")?.toString().trim(),
      password: formData.get("password")?.toString(),
      newsletter_consent: formData.get("newsletter_consent") === "on",
      data_consent: formData.get("data_consent") === "on"
    };

    try {
      await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setStatus("Cuenta creada correctamente. Redirigiendo...", "success");

      setTimeout(() => {
        window.location.href = "/panel.html";
      }, 900);
    } catch (error) {
      setStatus(error.message || "No se pudo crear la cuenta", "error");
    }
  });
}

/* =========================
   LOGIN
========================= */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Ingresando...");

    const formData = new FormData(loginForm);

    const payload = {
      email: formData.get("email")?.toString().trim(),
      password: formData.get("password")?.toString()
    };

    try {
      await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setStatus("Login correcto. Redirigiendo...", "success");

      setTimeout(() => {
        window.location.href = "/panel.html";
      }, 700);
    } catch (error) {
      setStatus(error.message || "No se pudo iniciar sesión", "error");
    }
  });
}

/* =========================
   PANEL GUARD
========================= */

if (document.body?.dataset?.protected === "true") {
  requireAuth();
}

/* =========================
   LOGOUT
========================= */

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    await logoutAndRedirect();
  });
}

const logoutBtnSecondary = document.getElementById("logoutBtnSecondary");
if (logoutBtnSecondary) {
  logoutBtnSecondary.addEventListener("click", async (event) => {
    event.preventDefault();
    await logoutAndRedirect();
  });
}