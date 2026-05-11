/**
 * Base URL para la API: mismo origen cuando la SPA se sirve desde Express;
 * en dev con Vite, el proxy envía /api al backend.
 */
export function getApiBase() {
  if (import.meta.env.DEV) return "";
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  if (h === "127.0.0.1" || h === "localhost") {
    const port = window.location.port || "3000";
    return `http://${h}:${port}`;
  }
  return "https://api.ocho.com.ar";
}

export async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }

  return data;
}

export async function getCurrentUser() {
  return apiFetch("/api/me", { method: "GET" });
}

export async function logoutRequest() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
}
