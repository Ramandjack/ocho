import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const DEFAULT_DEBOUNCE_MS = 2000;

// Autoguardado con debounce + concurrencia optimista, compartido por los editores
// de Documento/Código/Diseño — todos pegan al mismo PATCH /workspace/documents/:id.
export function useAutosave(documentId, initialUpdatedAt) {
  const [saveState, setSaveState] = useState("idle");
  const updatedAtRef = useRef(initialUpdatedAt);
  const timerRef = useRef(null);

  const save = useCallback(async (content) => {
    try {
      const res = await apiFetch(`/api/user/workspace/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content, base_updated_at: updatedAtRef.current }),
      });
      updatedAtRef.current = res.document.updated_at;
      setSaveState("saved");
    } catch (err) {
      setSaveState(err.status === 409 ? "conflict" : "error");
    }
  }, [documentId]);

  const scheduleSave = useCallback((content, delay = DEFAULT_DEBOUNCE_MS) => {
    setSaveState("saving");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(content), delay);
  }, [save]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { saveState, setSaveState, scheduleSave, updatedAtRef };
}
