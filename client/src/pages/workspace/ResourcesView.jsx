import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload } from "../../lib/api.js";

const TYPE_OPTIONS = ["link", "doc", "tool", "template", "note"];

const TYPE_LABEL = {
  link:     "Link",
  doc:      "Doc",
  tool:     "Herramienta",
  template: "Template",
  note:     "Nota",
};

function fileExt(url = "") {
  const m = url.match(/\.\w+$/);
  return m ? m[0] : "";
}

function isFileResource(url = "") {
  return url.startsWith("/api/files/");
}

function ResourceCard({ resource, onDelete, canDelete }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    const id = resource.nocodb_id ?? resource.id;
    try {
      await apiFetch(`/api/user/resources/${id}`, { method: "DELETE" });
      onDelete(id);
    } catch {
      setConfirming(false);
    }
  }

  const hasFile = isFileResource(resource.url);
  const hasLink = resource.url && !hasFile;

  return (
    <div className="resource-card">
      <div className="resource-card-head">
        <div className="resource-card-left">
          <span className="resource-type-badge">{TYPE_LABEL[resource.type] ?? resource.type}</span>
          <span className="resource-card-title">
            {hasLink
              ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="resource-link">{resource.title}</a>
              : resource.title
            }
          </span>
        </div>
        <div className="resource-card-actions">
          {hasFile && (
            <a
              href={resource.url}
              download={resource.title + fileExt(resource.url)}
              className="resource-download-btn"
            >
              Descargar
            </a>
          )}
          {canDelete && (
            <button
              className={`resource-delete-btn${confirming ? " confirming" : ""}`}
              onClick={handleDelete}
              onBlur={() => setConfirming(false)}
              title={confirming ? "Confirmar eliminación" : "Eliminar"}
            >
              {confirming ? "¿Eliminar?" : "×"}
            </button>
          )}
        </div>
      </div>
      {resource.description && (
        <p className="resource-card-desc">{resource.description}</p>
      )}
    </div>
  );
}

function AddResourceForm({ projects, onAdd, onClose }) {
  const [fields, setFields] = useState({
    title: "", url: "", type: "link", description: "",
    project_id: projects[0]?.nocodb_id ?? projects[0]?.id ?? "",
  });
  const [mode, setMode]           = useState("url");
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const fileRef = useRef(null);

  function set(k, v) { setFields(f => ({ ...f, [k]: v })); }

  function switchMode(m) {
    setMode(m);
    set("url", "");
    setUploadedName("");
    setError(null);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload("/api/user/resources/upload", form);
      set("url", res.url);
      setUploadedName(res.original_name);
      if (!fields.title) set("title", file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!fields.title.trim()) return;
    if (mode === "file" && !fields.url) { setError("Elegí un archivo primero"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/user/resources", {
        method: "POST",
        body: JSON.stringify({ ...fields, project_id: Number(fields.project_id) }),
      });
      onAdd(res.resource);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="resource-add-form" onSubmit={submit}>

      <div className="resource-form-row">
        <input
          className="resource-form-input"
          placeholder="Título del recurso"
          value={fields.title}
          onChange={e => set("title", e.target.value)}
          autoFocus
          required
        />
        <select
          className="resource-form-select"
          value={fields.type}
          onChange={e => set("type", e.target.value)}
        >
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      <div className="resource-mode-toggle">
        <button type="button" className={`resource-mode-btn${mode === "url" ? " active" : ""}`} onClick={() => switchMode("url")}>
          URL
        </button>
        <button type="button" className={`resource-mode-btn${mode === "file" ? " active" : ""}`} onClick={() => switchMode("file")}>
          Archivo
        </button>
      </div>

      {mode === "url" ? (
        <input
          className="resource-form-input"
          placeholder="https://… (opcional)"
          type="url"
          value={fields.url}
          onChange={e => set("url", e.target.value)}
        />
      ) : (
        <div
          className={`resource-file-zone${uploading ? " uploading" : ""}${uploadedName ? " done" : ""}`}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" hidden onChange={handleFile} />
          {uploading
            ? <span>Subiendo…</span>
            : uploadedName
              ? <span>✓ {uploadedName}</span>
              : <span>Hacé click para seleccionar un archivo · máx 10 MB</span>
          }
        </div>
      )}

      <input
        className="resource-form-input"
        placeholder="Descripción (opcional)"
        value={fields.description}
        onChange={e => set("description", e.target.value)}
      />

      <div className="resource-form-row">
        <select
          className="resource-form-select"
          style={{ flex: 1 }}
          value={fields.project_id}
          onChange={e => set("project_id", e.target.value)}
        >
          {projects.map(p => (
            <option key={p.nocodb_id ?? p.id} value={p.nocodb_id ?? p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <div className="resource-form-actions">
          <button type="button" className="resource-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="resource-form-save" disabled={saving || uploading}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {error && <p className="resource-form-error">{error}</p>}
    </form>
  );
}

export default function ResourcesView() {
  const [resources, setResources] = useState([]);
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [adding, setAdding]       = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/user/resources"),
      apiFetch("/api/user/projects"),
      apiFetch("/api/me"),
    ])
      .then(([rRes, pRes, meRes]) => {
        setResources(rRes.resources ?? []);
        setProjects(pRes.projects ?? []);
        setCurrentUser(meRes.user ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(resource) {
    setResources(prev => [resource, ...prev]);
  }

  function handleDelete(id) {
    setResources(prev => prev.filter(r => (r.nocodb_id ?? r.id) !== id));
  }

  const visible = filter === "all"
    ? resources
    : resources.filter(r => r.type === filter);

  const groupedByProject = visible.reduce((acc, r) => {
    const key = String(r.project_id ?? "sin-proyecto");
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const projectMap = {};
  projects.forEach(p => {
    projectMap[String(p.nocodb_id ?? p.id)] = p;
  });

  if (loading) return <div className="view-loading">Cargando recursos…</div>;

  return (
    <div className="resources-view">
      <header className="view-header">
        <div className="resources-header-row">
          <div>
            <h1 className="view-title">Recursos</h1>
            <p className="view-sub">Links, documentos y herramientas de tus proyectos.</p>
          </div>
          {projects.length > 0 && !adding && (
            <button className="resources-add-btn" onClick={() => setAdding(true)}>
              + Agregar
            </button>
          )}
        </div>
      </header>

      {adding && (
        <AddResourceForm
          projects={projects}
          onAdd={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}

      {projects.length === 0 ? (
        <p className="view-empty">Necesitás tener proyectos asignados para agregar recursos.</p>
      ) : resources.length === 0 ? (
        <p className="view-empty">Todavía no hay recursos en tus proyectos.</p>
      ) : (
        <>
          <div className="resource-filters">
            {["all", ...TYPE_OPTIONS].map(f => {
              const count = f === "all" ? resources.length : resources.filter(r => r.type === f).length;
              if (f !== "all" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`task-filter-btn${filter === f ? " active" : ""}`}
                >
                  {f === "all" ? "Todos" : TYPE_LABEL[f]}
                  <span className="task-filter-count">{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="view-empty">Sin recursos de tipo "{TYPE_LABEL[filter]}".</p>
          ) : (
            <div className="resources-groups">
              {Object.entries(groupedByProject).map(([projectId, items]) => {
                const project = projectMap[projectId];
                return (
                  <section key={projectId} className="resources-group">
                    <h2 className="resources-group-title">
                      {project ? project.title : "Sin proyecto"}
                    </h2>
                    <div className="resources-list">
                      {items.map(r => (
                        <ResourceCard
                          key={r.nocodb_id ?? r.id}
                          resource={r}
                          onDelete={handleDelete}
                          canDelete={r.created_by === currentUser?.uuid}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
