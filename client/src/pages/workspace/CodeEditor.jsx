import { useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useAutosave } from "./useAutosave.js";
import VersionHistoryPanel, { SaveStatusPill } from "./VersionHistoryPanel.jsx";

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python",     label: "Python" },
  { value: "json",       label: "JSON" },
  { value: "html",       label: "HTML" },
  { value: "css",        label: "CSS" },
  { value: "sql",        label: "SQL" },
  { value: "yaml",       label: "YAML" },
  { value: "markdown",   label: "Markdown" },
  { value: "shell",      label: "Shell" },
];

export default function CodeEditor({ documentId, initialContent, initialUpdatedAt, locked, show }) {
  const [language, setLanguage] = useState(initialContent?.language || "javascript");
  const { saveState, setSaveState, scheduleSave } = useAutosave(documentId, initialUpdatedAt);
  const valueRef = useRef(initialContent?.value || "");

  function handleChange(value) {
    valueRef.current = value ?? "";
    if (locked) return;
    scheduleSave({ type: "code", language, value: valueRef.current });
  }

  function handleLanguageChange(next) {
    setLanguage(next);
    if (locked) return;
    scheduleSave({ type: "code", language: next, value: valueRef.current }, 400);
  }

  function handleRestore(content) {
    valueRef.current = content.value || "";
    setLanguage(content.language || "javascript");
    setSaveState("idle");
  }

  return (
    <div className="ws-editor-wrap">
      <div className="ws-toolbar">
        <select
          className="ws-toolbar-select"
          value={language}
          onChange={e => handleLanguageChange(e.target.value)}
          disabled={locked}
        >
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {locked && <span className="ws-save-pill locked-note">Solo lectura — documento en revisión</span>}
      </div>

      <div className={`ws-code-editor${locked ? " locked" : ""}`}>
        <Editor
          height="50vh"
          theme="vs-dark"
          language={language}
          defaultValue={valueRef.current}
          onChange={handleChange}
          options={{
            readOnly: locked,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
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
