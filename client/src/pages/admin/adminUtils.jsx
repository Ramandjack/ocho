export function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

export function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

export function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
}

export function exportCSV(rows, filename, showToast) {
  if (!rows.length) { showToast?.("No hay datos para exportar.", "danger"); return; }
  const keys = Object.keys(rows[0]).filter(k => !["password_hash", "passwordHash"].includes(k));
  const header = keys.join(",");
  const body = rows
    .map(row => keys.map(k => `"${String(row[k] ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`﻿${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast?.(`Exportado ${rows.length} registros.`, "success");
}

export function ToastContainer({ toasts }) {
  return (
    <div className="admin-toast-container" aria-live="polite">
      {toasts.map(t => (
        <div
          key={t.id}
          className="admin-toast"
          style={{
            color: t.type === "success" ? "var(--admin-success)"
                 : t.type === "danger"  ? "var(--admin-danger)"
                 : "#fff",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ModalRow({ label, value }) {
  return (
    <div className="modal-row">
      <span className="modal-label">{label}</span>
      <span>{String(value ?? "—")}</span>
    </div>
  );
}
