function getCsrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)ocho_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Base URL para la API: mismo origen cuando la SPA se sirve desde Express;
 * en dev con Vite, el proxy envía /api al backend.
 */
export function getApiBase() {
  if (import.meta.env.DEV) return "";
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  if (h === "127.0.0.1" || h === "localhost") {
    return `http://${h}:${window.location.port || "3000"}`;
  }
  // Producción: Netlify proxea /api/* → Render; Express monolito usa mismo origen
  return "";
}

export async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const method = (options.method || "GET").toUpperCase();
  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  const csrfToken = isMutating ? getCsrfToken() : "";
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return data;
}

export async function getCurrentUser() {
  return apiFetch("/api/me", { method: "GET" });
}

export async function apiUpload(path, formData) {
  const base = getApiBase();
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": getCsrfToken() },
    body: formData,
    // No Content-Type: browser sets multipart/form-data with boundary
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

export async function logoutRequest() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
}
