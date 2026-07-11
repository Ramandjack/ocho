import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const SAVE_LABEL = {
  idle:     "",
  saving:   "Guardando…",
  saved:    "Guardado ✓",
  error:    "Error al guardar",
  conflict: "Alguien más guardó cambios",
};

export function SaveStatusPill({ saveState, locked }) {
  if (locked) return <span className="ws-save-pill locked-note">Solo lectura — documento en revisión</span>;
  if (saveState === "idle") return null;
  return (
    <>
      <span className={`ws-save-pill ${saveState}`}>{SAVE_LABEL[saveState]}</span>
      {saveState === "conflict" && (
        <button className="task-form-cancel" type="button" onClick={() => window.location.reload()}>
          Recargar
        </button>
      )}
    </>
  );
}

// Historial de versiones + "Guardar versión", compartido por los editores de
// Documento/Código/Diseño. `onRestore(content)` recibe el contenido de la versión
// restaurada para que el editor que lo use actualice su propio estado local.
export default function VersionHistoryPanel({ documentId, locked, show, onRestore }) {
  const [versions,  setVersions]  = useState([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadVersions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/user/workspace/documents/${documentId}/versions`);
      setVersions(res.versions ?? []);
    } catch {
      /* no bloqueante */
    }
  }, [documentId]);

  useEffect(() => { if (historyOpen) loadVersions(); }, [historyOpen, loadVersions]);

  async function saveVersion() {
    setSavingVersion(true);
    try {
      await apiFetch(`/api/user/workspace/documents/${documentId}/versions`, {
        method: "POST",
        body: JSON.stringify({ label: versionLabel.trim() || undefined }),
      });
      setVersionLabel("");
      show?.("Versión guardada", "success");
      if (historyOpen) await loadVersions();
    } catch (err) {
      show?.(err.message || "No se pudo guardar la versión", "error");
    } finally {
      setSavingVersion(false);
    }
  }

  async function restoreVersion(versionId) {
    try {
      const res = await apiFetch(`/api/user/workspace/documents/${documentId}/versions/${versionId}/restore`, {
        method: "POST",
      });
      onRestore?.(res.document.content);
      setConfirmRestoreId(null);
      show?.("Versión restaurada al borrador actual", "success");
    } catch (err) {
      show?.(err.message || "No se pudo restaurar la versión", "error");
    }
  }

  return (
    <>
      {!locked && (
        <div className="ws-version-actions">
          <input
            className="task-form-input"
            placeholder="Etiqueta de versión (opcional)"
            value={versionLabel}
            onChange={e => setVersionLabel(e.target.value)}
            style={{ maxWidth: "14rem" }}
          />
          <button className="task-form-save" type="button" disabled={savingVersion} onClick={saveVersion}>
            {savingVersion ? "Guardando…" : "Guardar versión"}
          </button>
        </div>
      )}

      <div className="ws-history">
        <button className="ws-history-toggle" type="button" onClick={() => setHistoryOpen(v => !v)}>
          {historyOpen ? "▾" : "▸"} Historial de versiones
        </button>
        {historyOpen && (
          versions.length === 0 ? (
            <p className="ws-history-empty">Todavía no guardaste ninguna versión.</p>
          ) : (
            <ul className="ws-history-list">
              {versions.map(v => (
                <li key={v.id} className="ws-history-item">
                  <div className="ws-history-item-body">
                    <span className="ws-history-item-version">v{v.version}</span>
                    {v.label && <span className="ws-history-item-label">{v.label}</span>}
                    <span className="ws-history-item-date">
                      {v.created_at ? new Date(v.created_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  {!locked && (
                    confirmRestoreId === v.id ? (
                      <span className="ws-history-confirm">
                        <button className="task-confirm-yes" type="button" onClick={() => restoreVersion(v.id)}>Confirmar</button>
                        <button className="task-confirm-no" type="button" onClick={() => setConfirmRestoreId(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <button className="task-form-cancel" type="button" onClick={() => setConfirmRestoreId(v.id)}>
                        Restaurar
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </>
  );
}
