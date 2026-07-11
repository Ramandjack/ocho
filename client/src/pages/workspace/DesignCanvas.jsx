import { useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useAutosave } from "./useAutosave.js";
import VersionHistoryPanel, { SaveStatusPill } from "./VersionHistoryPanel.jsx";

export default function DesignCanvas({ documentId, initialContent, initialUpdatedAt, locked, show }) {
  const { saveState, setSaveState, scheduleSave } = useAutosave(documentId, initialUpdatedAt);
  const apiRef = useRef(null);

  function handleChange(elements) {
    if (locked) return;
    // Solo persistimos los elementos del dibujo — el appState de Excalidraw trae
    // referencias no serializables (colaboradores, etc.) que no hace falta guardar.
    scheduleSave({ type: "excalidraw", elements: elements.map(el => ({ ...el })) });
  }

  function handleRestore(content) {
    apiRef.current?.updateScene({ elements: content.elements || [] });
    setSaveState("idle");
  }

  return (
    <div className="ws-editor-wrap">
      {locked && (
        <div className="ws-toolbar">
          <span className="ws-save-pill locked-note">Solo lectura — documento en revisión</span>
        </div>
      )}

      <div className={`ws-canvas${locked ? " locked" : ""}`}>
        <Excalidraw
          excalidrawAPI={api => { apiRef.current = api; }}
          initialData={{ elements: initialContent?.elements || [], scrollToContent: true }}
          onChange={handleChange}
          viewModeEnabled={locked}
          theme="dark"
        />
      </div>

      {!locked && (
        <div className="ws-editor-footer">
          <div className="ws-save-status">
            <SaveStatusPill saveState={saveState} locked={locked} />
          </div>
        </div>
      )}
      <VersionHistoryPanel documentId={documentId} locked={locked} show={show} onRestore={handleRestore} />
    </div>
  );
}
