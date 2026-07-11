import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { useAutosave } from "./useAutosave.js";
import VersionHistoryPanel, { SaveStatusPill } from "./VersionHistoryPanel.jsx";

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`ws-toolbar-btn${active ? " active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export default function DocumentEditor({ documentId, initialContent, initialUpdatedAt, locked, show }) {
  const { saveState, setSaveState, scheduleSave } = useAutosave(documentId, initialUpdatedAt);

  const editor = useEditor({
    editable: !locked,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onUpdate: ({ editor: ed }) => {
      if (locked) return;
      scheduleSave(ed.getJSON());
    },
  });

  function insertLink() {
    const url = window.prompt("URL del link:");
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertImage() {
    const url = window.prompt("URL de la imagen (subida de archivos vive en la pestaña Archivos):");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function handleRestore(content) {
    editor?.commands.setContent(content);
    setSaveState("idle");
  }

  if (!editor) return null;

  return (
    <div className="ws-editor-wrap">
      {locked ? (
        <div className="ws-toolbar">
          <span className="ws-save-pill locked-note">Solo lectura — documento en revisión</span>
        </div>
      ) : (
        <div className="ws-toolbar">
          <ToolbarButton title="Negrita" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
          <ToolbarButton title="Cursiva" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
          <ToolbarButton title="Título 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton title="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton title="Lista con viñetas" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
          <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton title="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</ToolbarButton>
          <ToolbarButton title="Bloque de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{"</>"}</ToolbarButton>
          <ToolbarButton title="Tabla" onClick={insertTable}>⊞</ToolbarButton>
          <ToolbarButton title="Link" active={editor.isActive("link")} onClick={insertLink}>🔗</ToolbarButton>
          <ToolbarButton title="Imagen (por URL)" onClick={insertImage}>🖼</ToolbarButton>
          <ToolbarButton title="Deshacer" onClick={() => editor.chain().focus().undo().run()}>↺</ToolbarButton>
          <ToolbarButton title="Rehacer" onClick={() => editor.chain().focus().redo().run()}>↻</ToolbarButton>
        </div>
      )}

      <EditorContent editor={editor} className={`ws-editor${locked ? " locked" : ""}`} />

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
