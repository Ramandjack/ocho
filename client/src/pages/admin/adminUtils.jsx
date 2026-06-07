import { useEffect } from "react";

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

export function ConfirmModal({ title, message, confirmLabel = "Confirmar", danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="admin-card admin-modal-card modal-inner" style={{ maxWidth: 420 }}>
        <h3 style={{ marginBottom: message ? 8 : 24 }}>{title}</h3>
        {message && (
          <p className="admin-muted" style={{ fontSize: "0.9rem", marginBottom: 24, lineHeight: 1.5 }}>{message}</p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="admin-btn" onClick={onCancel}>Cancelar</button>
          <button type="button" className={`admin-btn${danger ? " danger" : " primary"}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
