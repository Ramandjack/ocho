import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload, getApiBase } from "../../lib/api.js";

function formatSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPanel({ taskId, currentUserUuid, locked, show }) {
  const [assets, setAssets]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const fileInputRef = useRef(null);
  const didLoad = useRef(false);

  function loadAssets() {
    apiFetch(`/api/user/tasks/${taskId}/workspace/assets`)
      .then(res => setAssets(res.assets ?? []))
      .catch(err => show?.(err.message || "No se pudieron cargar los archivos", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    loadAssets();
  }, []);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiUpload(`/api/user/tasks/${taskId}/workspace/assets`, formData);
      setAssets(prev => [res.asset, ...prev]);
      show?.("Archivo subido", "success");
    } catch (err) {
      show?.(err.message || "No se pudo subir el archivo", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteAsset(id) {
    try {
      await apiFetch(`/api/user/workspace/assets/${id}`, { method: "DELETE" });
      setAssets(prev => prev.filter(a => a.id !== id));
      setConfirmDeleteId(null);
      show?.("Archivo eliminado", "success");
    } catch (err) {
      show?.(err.message || "No se pudo eliminar el archivo", "error");
    }
  }

  if (loading) {
    return <p className="ws-history-empty">Cargando archivos…</p>;
  }

  return (
    <div className="ws-files">
      {!locked && (
        <div className="ws-files-upload">
          <input
            ref={fileInputRef}
            type="file"
            id="ws-file-input"
            className="ws-files-input"
            onChange={handleUpload}
            disabled={uploading}
          />
          <label htmlFor="ws-file-input" className="task-form-save ws-files-upload-btn">
            {uploading ? "Subiendo…" : "+ Subir archivo"}
          </label>
          <span className="ws-files-hint">Máximo 15MB. No se permiten ejecutables ni scripts.</span>
        </div>
      )}

      {assets.length === 0 ? (
        <p className="ws-history-empty">Todavía no se subió ningún archivo a esta tarea.</p>
      ) : (
        <ul className="ws-files-list">
          {assets.map(a => (
            <li key={a.id} className="ws-files-item">
              <a
                className="ws-files-item-link"
                href={`${getApiBase()}/api/user/workspace/assets/${a.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {a.original_name}
              </a>
              <span className="ws-files-item-meta">{formatSize(a.size_bytes)}</span>
              {(a.uploaded_by === currentUserUuid) && (
                confirmDeleteId === a.id ? (
                  <span className="ws-history-confirm">
                    <button className="task-confirm-yes" type="button" onClick={() => deleteAsset(a.id)}>Confirmar</button>
                    <button className="task-confirm-no" type="button" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                  </span>
                ) : (
                  <button className="task-form-cancel" type="button" onClick={() => setConfirmDeleteId(a.id)}>
                    Eliminar
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
