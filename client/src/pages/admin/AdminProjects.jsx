import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { ToastContainer, ConfirmModal } from "./adminUtils.jsx";

const STATUS_OPTIONS  = ["draft", "active", "completed", "archived"];
const TYPE_OPTIONS    = ["web", "saas", "ecommerce", "marketplace", "ia"];
const PERM_OPTIONS    = ["viewer", "editor"];
const STATUS_LABEL    = { draft: "borrador", active: "activo", completed: "completado", archived: "archivado" };
const TYPE_LABEL      = { web: "Web", saas: "SaaS", ecommerce: "Ecommerce", marketplace: "Marketplace", ia: "IA" };

const EMPTY_FORM = { title: "", description: "", status: "active", type: "web", due_date: "" };

const PHASE_ORDER = ["discovery", "brief", "design", "development", "testing", "launch"];
const PHASE_LABEL_MAP = { discovery: "Discovery", brief: "Brief", design: "Diseño", development: "Desarrollo", testing: "Testing", launch: "Lanzamiento" };
const PHASE_STATUS_OPTIONS = ["pending", "in_progress", "completed"];
const PHASE_STATUS_LABEL   = { pending: "pendiente", in_progress: "en progreso", completed: "completado" };
const SCORE_DIMS = [
  { key: "problema",      label: "Problema"      },
  { key: "mercado",       label: "Mercado"       },
  { key: "factibilidad",  label: "Factibilidad"  },
  { key: "escalabilidad", label: "Escalabilidad" },
  { key: "monetizacion",  label: "Monetización"  },
];
const DELIV_TYPES = [
  { value: "discovery_doc", label: "Discovery Doc"     },
  { value: "brief",         label: "Brief"             },
  { value: "ux_arch",       label: "Arquitectura UX"   },
  { value: "tech_roadmap",  label: "Roadmap Técnico"   },
  { value: "qa_report",     label: "Reporte QA"        },
  { value: "launch_plan",   label: "Plan Lanzamiento"  },
  { value: "document",      label: "Documento"         },
];

function ThreadModal({ project, onClose, show }) {
  const [msgs, setMsgs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply]     = useState("");
  const [sending, setSending] = useState(false);
  const endRef                = useRef(null);

  useEffect(() => {
    apiFetch(`/api/admin/projects/${project.id}/messages`)
      .then(r => setMsgs(r.messages ?? []))
      .catch(err => show(err.message, "danger"))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const r = await apiFetch(`/api/admin/projects/${project.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: reply.trim() }),
      });
      setMsgs(prev => [...prev, r.message]);
      setReply("");
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="admin-card admin-modal-card modal-inner"
        style={{ maxWidth: 580, width: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 0 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Mensajes</h2>
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>{project.title}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Thread */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 200,
          maxHeight: "50vh",
          paddingRight: 4,
          marginBottom: 16,
        }}>
          {loading ? (
            <p className="admin-muted" style={{ fontSize: "0.85rem" }}>Cargando mensajes…</p>
          ) : !msgs.length ? (
            <p className="admin-muted" style={{ fontSize: "0.85rem" }}>Sin mensajes todavía.</p>
          ) : msgs.map((m, i) => {
            const isAdmin = ["admin", "member"].includes(String(m.author_role).toLowerCase());
            return (
              <div
                key={m.nocodb_id ?? m.id ?? i}
                style={{
                  padding: "0.55rem 0.75rem",
                  borderRadius: 8,
                  background: isAdmin
                    ? "rgba(232,213,176,0.09)"
                    : "rgba(255,255,255,0.04)",
                  alignSelf: isAdmin ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  border: isAdmin
                    ? "1px solid rgba(232,213,176,0.15)"
                    : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.9 }}>{m.author_name}</span>
                  <span className="admin-pill" style={{ fontSize: "0.68rem" }}>{m.author_role}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</p>
                {m.CreatedAt && (
                  <span style={{ fontSize: "0.7rem", opacity: 0.4, display: "block", marginTop: 4 }}>
                    {new Date(m.CreatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Reply form */}
        <form
          onSubmit={send}
          style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <input
            className="admin-control"
            style={{ flex: 1 }}
            placeholder="Escribir respuesta…"
            value={reply}
            onChange={e => setReply(e.target.value)}
            autoFocus
            disabled={sending}
          />
          <button
            type="submit"
            className="admin-btn primary"
            disabled={sending || !reply.trim()}
          >
            {sending ? "…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function WorkspaceModal({ project, onProjectUpdate, onClose, show }) {
  const [tab,          setTab]          = useState("phases");
  const [phases,       setPhases]       = useState([]);
  const [score,        setScore]        = useState({});
  const [deliverables, setDeliverables] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activePhase,  setActivePhase]  = useState(project.current_phase || "discovery");

  // Phase editing state
  const [phaseEdits, setPhaseEdits] = useState({});  // { [phase]: { status, admin_notes } }
  const [phaseSaving, setPhaseSaving] = useState(null);

  // Score editing state
  const [scoreDraft, setScoreDraft] = useState({});
  const [scoreSaving, setScoreSaving] = useState(false);

  // Deliverable state
  const [expandedDeliv, setExpandedDeliv]   = useState(null);
  const [editingDeliv,  setEditingDeliv]    = useState(null);   // { id, content }
  const [delivSaving,   setDelivSaving]     = useState(false);
  const [newDeliv,      setNewDeliv]        = useState(null);   // form state

  useEffect(() => {
    Promise.allSettled([
      apiFetch(`/api/admin/projects/${project.id}/phases`),
      apiFetch(`/api/admin/projects/${project.id}/score`),
      apiFetch(`/api/admin/projects/${project.id}/deliverables`),
    ]).then(([pR, sR, dR]) => {
      const phasesData = pR.status === "fulfilled" ? (pR.value?.phases ?? []) : [];
      setPhases(phasesData);

      const initEdits = {};
      phasesData.forEach(p => {
        initEdits[p.phase] = { status: p.status || "pending", admin_notes: p.admin_notes || "" };
      });
      setPhaseEdits(initEdits);

      const s = sR.status === "fulfilled" ? (sR.value?.score ?? {}) : {};
      setScore(s);
      setScoreDraft({
        problema: s.problema ?? 0, mercado: s.mercado ?? 0,
        factibilidad: s.factibilidad ?? 0, escalabilidad: s.escalabilidad ?? 0,
        monetizacion: s.monetizacion ?? 0,
      });

      setDeliverables(dR.status === "fulfilled" ? (dR.value?.deliverables ?? []) : []);
    }).finally(() => setLoading(false));
  }, [project.id]);

  // ── Phases ───────────────────────────────────────────────

  async function savePhase(phase) {
    setPhaseSaving(phase);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/phases/${phase}`, {
        method: "PATCH",
        body: JSON.stringify(phaseEdits[phase] || {}),
      });
      setPhases(prev => prev.map(p =>
        p.phase === phase ? { ...p, ...(phaseEdits[phase] || {}) } : p
      ));
      show("Fase guardada", "success");
    } catch (err) { show(err.message, "danger"); }
    finally { setPhaseSaving(null); }
  }

  async function advancePhase(phase) {
    try {
      await apiFetch(`/api/admin/projects/${project.id}/phase`, {
        method: "PATCH",
        body: JSON.stringify({ phase }),
      });
      onProjectUpdate({ current_phase: phase });
      show(`Proyecto avanzado a ${PHASE_LABEL_MAP[phase]}`, "success");
    } catch (err) { show(err.message, "danger"); }
  }

  // ── Score ─────────────────────────────────────────────────

  const scoreTotal = SCORE_DIMS.reduce((s, d) => s + Number(scoreDraft[d.key] || 0), 0);

  async function saveScore() {
    setScoreSaving(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/score`, {
        method: "PATCH",
        body: JSON.stringify(scoreDraft),
      });
      show(`Score guardado: ${scoreTotal}/100`, "success");
    } catch (err) { show(err.message, "danger"); }
    finally { setScoreSaving(false); }
  }

  // ── Deliverables ──────────────────────────────────────────

  async function createDeliverable(e) {
    e.preventDefault();
    if (!newDeliv?.title?.trim()) return;
    setDelivSaving(true);
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}/deliverables`, {
        method: "POST",
        body: JSON.stringify({ ...newDeliv, generated_by: "admin" }),
      });
      setDeliverables(prev => [...prev, res.deliverable]);
      setNewDeliv(null);
      show("Entregable creado", "success");
    } catch (err) { show(err.message, "danger"); }
    finally { setDelivSaving(false); }
  }

  async function updateDeliverable(did) {
    setDelivSaving(true);
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}/deliverables/${did}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editingDeliv.content }),
      });
      setDeliverables(prev => prev.map(d => (d.id || d.nocodb_id) === did ? { ...d, ...res.deliverable } : d));
      setEditingDeliv(null);
      show("Entregable actualizado", "success");
    } catch (err) { show(err.message, "danger"); }
    finally { setDelivSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────

  const activePhaseData = phases.find(p => p.phase === activePhase);
  const currentPhaseIdx = PHASE_ORDER.indexOf(project.current_phase || "discovery");
  const activePhaseIdx  = PHASE_ORDER.indexOf(activePhase);

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="admin-card admin-modal-card modal-inner"
        style={{ maxWidth: 700, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Product Workspace</h2>
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>{project.title}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 12 }}>
          {[["phases", "Fases"], ["score", "Score"], ["deliverables", "Entregables"]].map(([t, label]) => (
            <button key={t} type="button"
              className={`admin-btn${tab === t ? " primary" : ""}`}
              style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
              onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <p className="admin-muted" style={{ padding: "2rem 0", textAlign: "center" }}>Cargando…</p>
          ) : (

            /* ── TAB: FASES ─────────────────────────────── */
            tab === "phases" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Mini phase rail */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {PHASE_ORDER.map((ph, i) => {
                    const isCurrent = ph === (project.current_phase || "discovery");
                    const isPast    = i < currentPhaseIdx;
                    return (
                      <button key={ph} type="button"
                        className={`admin-btn${activePhase === ph ? " primary" : ""}`}
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", position: "relative" }}
                        onClick={() => setActivePhase(ph)}>
                        {isCurrent && <span style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: "50%", background: "rgba(255,220,100,0.9)" }} />}
                        {isPast ? "✓ " : ""}{PHASE_LABEL_MAP[ph]}
                      </button>
                    );
                  })}
                </div>

                {/* Selected phase detail */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Advance button */}
                  {activePhaseIdx !== currentPhaseIdx && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(255,220,100,0.06)", border: "1px solid rgba(255,220,100,0.15)", borderRadius: 8 }}>
                      <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "rgba(255,220,100,0.85)" }}>
                        El proyecto está actualmente en <strong>{PHASE_LABEL_MAP[project.current_phase || "discovery"]}</strong>.
                      </p>
                      <button type="button" className="admin-btn"
                        style={{ fontSize: "0.78rem" }}
                        onClick={() => advancePhase(activePhase)}>
                        Avanzar proyecto a {PHASE_LABEL_MAP[activePhase]}
                      </button>
                    </div>
                  )}

                  {/* Status + notes */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", opacity: 0.5 }}>Estado de la fase</label>
                    <select className="admin-control"
                      value={phaseEdits[activePhase]?.status || "pending"}
                      onChange={e => setPhaseEdits(prev => ({ ...prev, [activePhase]: { ...prev[activePhase], status: e.target.value } }))}>
                      {PHASE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{PHASE_STATUS_LABEL[s]}</option>)}
                    </select>

                    <label style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", opacity: 0.5, marginTop: 4 }}>Notas internas</label>
                    <textarea className="admin-control"
                      rows={3}
                      placeholder="Notas del equipo (solo visible en admin)…"
                      value={phaseEdits[activePhase]?.admin_notes || ""}
                      onChange={e => setPhaseEdits(prev => ({ ...prev, [activePhase]: { ...prev[activePhase], admin_notes: e.target.value } }))}
                      style={{ resize: "vertical" }}
                    />
                    <button type="button" className="admin-btn primary"
                      style={{ alignSelf: "flex-end", fontSize: "0.8rem" }}
                      disabled={phaseSaving === activePhase}
                      onClick={() => savePhase(activePhase)}>
                      {phaseSaving === activePhase ? "Guardando…" : "Guardar fase"}
                    </button>
                  </div>

                  {/* Client questionnaire */}
                  {activePhaseData?.questionnaire && Object.keys(activePhaseData.questionnaire).length > 0 && (
                    <details style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                      <summary style={{ cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, opacity: 0.7, userSelect: "none" }}>
                        Respuestas del cliente
                      </summary>
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        {Object.entries(activePhaseData.questionnaire)
                          .filter(([, v]) => String(v || "").trim())
                          .map(([k, v]) => (
                            <div key={k}>
                              <p style={{ margin: "0 0 2px", fontSize: "0.72rem", fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</p>
                              <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{v}</p>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}

                  {/* AI Output */}
                  {activePhaseData?.ai_output && (
                    <details open style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                      <summary style={{ cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, opacity: 0.7, userSelect: "none" }}>
                        Análisis IA
                      </summary>
                      <p style={{ margin: "12px 0 0", fontSize: "0.85rem", lineHeight: 1.65, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.75)" }}>
                        {activePhaseData.ai_output}
                      </p>
                    </details>
                  )}

                </div>
              </div>

            /* ── TAB: SCORE ──────────────────────────────── */
            ) : tab === "score" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p className="admin-muted" style={{ margin: 0, fontSize: "0.85rem" }}>Cada dimensión: 0–20 puntos</p>
                  <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {scoreTotal}<span style={{ fontSize: "0.85rem", opacity: 0.5 }}>/100</span>
                  </span>
                </div>

                {SCORE_DIMS.map(dim => (
                  <div key={dim.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ width: "7rem", flexShrink: 0, fontSize: "0.85rem", opacity: 0.8 }}>{dim.label}</label>
                    <input type="range" min={0} max={20} step={1}
                      value={scoreDraft[dim.key] ?? 0}
                      onChange={e => setScoreDraft(prev => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                      style={{ flex: 1 }}
                    />
                    <input type="number" min={0} max={20}
                      className="admin-control"
                      style={{ width: "3.5rem", textAlign: "center", padding: "0.3rem 0.5rem", fontSize: "0.875rem" }}
                      value={scoreDraft[dim.key] ?? 0}
                      onChange={e => {
                        const v = Math.min(20, Math.max(0, Number(e.target.value) || 0));
                        setScoreDraft(prev => ({ ...prev, [dim.key]: v }));
                      }}
                    />
                  </div>
                ))}

                <button type="button" className="admin-btn primary"
                  style={{ alignSelf: "flex-end", marginTop: 4 }}
                  disabled={scoreSaving}
                  onClick={saveScore}>
                  {scoreSaving ? "Guardando…" : `Guardar score (${scoreTotal}/100)`}
                </button>
              </div>

            /* ── TAB: ENTREGABLES ────────────────────────── */
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* List */}
                {!deliverables.length && !newDeliv && (
                  <p className="admin-muted" style={{ fontSize: "0.85rem" }}>Sin entregables todavía.</p>
                )}

                {deliverables.map(d => {
                  const did      = d.id || d.nocodb_id;
                  const isEditing = editingDeliv?.id === did;
                  const isOpen    = expandedDeliv === did;
                  return (
                    <div key={did} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0.65rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span className="admin-pill" style={{ fontSize: "0.65rem", flexShrink: 0 }}>{d.phase}</span>
                          <strong style={{ fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</strong>
                          {d.version > 1 && <span className="admin-muted" style={{ fontSize: "0.72rem", flexShrink: 0 }}>v{d.version}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button type="button" className="admin-btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                            onClick={() => { setExpandedDeliv(isOpen ? null : did); setEditingDeliv(null); }}>
                            {isOpen ? "Cerrar" : "Ver"}
                          </button>
                          <button type="button" className="admin-btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                            onClick={() => { setEditingDeliv({ id: did, content: d.content || "" }); setExpandedDeliv(null); }}>
                            Editar
                          </button>
                        </div>
                      </div>

                      {isOpen && !isEditing && (
                        <div style={{ padding: "0 1rem 0.85rem", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "0.75rem" }}>
                          <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.65, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.75)" }}>
                            {d.content || "(sin contenido)"}
                          </p>
                        </div>
                      )}

                      {isEditing && (
                        <div style={{ padding: "0 1rem 1rem", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: 8 }}>
                          <textarea className="admin-control" rows={8}
                            style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }}
                            value={editingDeliv.content}
                            onChange={e => setEditingDeliv(prev => ({ ...prev, content: e.target.value }))}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" className="admin-btn primary" style={{ fontSize: "0.8rem" }}
                              disabled={delivSaving} onClick={() => updateDeliverable(did)}>
                              {delivSaving ? "Guardando…" : "Guardar"}
                            </button>
                            <button type="button" className="admin-btn" style={{ fontSize: "0.8rem" }}
                              onClick={() => setEditingDeliv(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* New deliverable form */}
                {newDeliv ? (
                  <form onSubmit={createDeliverable}
                    style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="admin-controls">
                      <input className="admin-control" style={{ flex: 1 }} placeholder="Título *"
                        value={newDeliv.title || ""}
                        onChange={e => setNewDeliv(p => ({ ...p, title: e.target.value }))}
                        autoFocus required />
                      <select className="admin-control"
                        value={newDeliv.phase || "discovery"}
                        onChange={e => setNewDeliv(p => ({ ...p, phase: e.target.value }))}>
                        {PHASE_ORDER.map(ph => <option key={ph} value={ph}>{PHASE_LABEL_MAP[ph]}</option>)}
                      </select>
                      <select className="admin-control"
                        value={newDeliv.type || "document"}
                        onChange={e => setNewDeliv(p => ({ ...p, type: e.target.value }))}>
                        {DELIV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <textarea className="admin-control" rows={6}
                      placeholder="Contenido (soporta **markdown** básico)…"
                      style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }}
                      value={newDeliv.content || ""}
                      onChange={e => setNewDeliv(p => ({ ...p, content: e.target.value }))}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="submit" className="admin-btn primary" disabled={delivSaving || !newDeliv.title?.trim()}>
                        {delivSaving ? "Creando…" : "Crear entregable"}
                      </button>
                      <button type="button" className="admin-btn" onClick={() => setNewDeliv(null)}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="admin-btn"
                    style={{ alignSelf: "flex-start", fontSize: "0.8rem" }}
                    onClick={() => setNewDeliv({ title: "", phase: project.current_phase || "discovery", type: "document", content: "" })}>
                    + Nuevo entregable
                  </button>
                )}

              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminProjects() {
  const { projects, setProjects, users } = useAdminData();
  const [form, setForm]               = useState(null);
  const [assignModal, setAssign]      = useState(null);
  const [threadModal, setThread]      = useState(null);
  const [workspaceModal, setWorkspace] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [assignUuid, setAssignUuid]   = useState("");
  const [assignPerm, setAssignPerm]   = useState("viewer");
  const [saving, setSaving]           = useState(false);
  const { toasts, show } = useToast();

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function saveProject(e) {
    e.preventDefault();
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      if (form.id) {
        const res = await apiFetch(`/api/admin/projects/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: form.title, description: form.description, status: form.status, type: form.type, due_date: form.due_date || null }),
        });
        setProjects(prev => prev.map(p => (p.nocodb_id ?? p.id) === form.id ? { ...p, ...res.project } : p));
        show("Proyecto actualizado", "success");
      } else {
        const res = await apiFetch("/api/admin/projects", {
          method: "POST",
          body: JSON.stringify({ title: form.title, description: form.description, status: form.status, type: form.type, due_date: form.due_date || null }),
        });
        setProjects(prev => [res.project, ...prev]);
        show("Proyecto creado", "success");
      }
      setForm(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  async function deleteProject(id, title) {
    try {
      await apiFetch(`/api/admin/projects/${id}`, { method: "DELETE" });
      setProjects(prev => prev.filter(p => (p.nocodb_id ?? p.id) !== id));
      show("Proyecto eliminado", "success");
    } catch (err) { show(err.message, "danger"); }
  }

  async function assignUser(e) {
    e.preventDefault();
    if (!assignUuid) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/projects/${assignModal.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ user_uuids: [assignUuid], permission: assignPerm }),
      });
      show("Usuario asignado", "success");
      setAssign(null);
    } catch (err) { show(err.message, "danger"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Proyectos</h1>
          <p>{projects.length} proyectos en el sistema</p>
        </div>
        {!form && (
          <button type="button" className="admin-btn primary" onClick={() => setForm({ ...EMPTY_FORM })}>
            + Nuevo proyecto
          </button>
        )}
      </section>

      {form && !form.id && (
        <section className="admin-full">
          <article className="admin-card">
            <h2>Nuevo proyecto</h2>
            <form onSubmit={saveProject} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="admin-controls">
                <input className="admin-control" style={{ flex: 1 }} placeholder="Título *" value={form.title} onChange={e => setF("title", e.target.value)} required autoFocus />
                <select className="admin-control" value={form.type} onChange={e => setF("type", e.target.value)}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <select className="admin-control" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <input className="admin-control" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value)} />
              </div>
              <input className="admin-control" placeholder="Descripción (opcional)" value={form.description || ""} onChange={e => setF("description", e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Guardando…" : "Crear proyecto"}</button>
                <button type="button" className="admin-btn" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          </article>
        </section>
      )}

      {form?.id && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setForm(null)}>
          <div className="admin-card admin-modal-card modal-inner" style={{ maxWidth: 520, width: "95vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Editar proyecto</h2>
              <button type="button" className="admin-modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <form onSubmit={saveProject} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="admin-control" placeholder="Título *" value={form.title} onChange={e => setF("title", e.target.value)} required autoFocus />
              <input className="admin-control" placeholder="Descripción (opcional)" value={form.description || ""} onChange={e => setF("description", e.target.value)} />
              <div className="admin-controls">
                <select className="admin-control" value={form.type} onChange={e => setF("type", e.target.value)}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <select className="admin-control" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <input className="admin-control" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="admin-btn" onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="admin-full">
        <article className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Proyecto</th><th>Tipo</th><th>Estado</th><th>Vence</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {!projects.length ? (
                  <tr><td colSpan={5} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin proyectos.</td></tr>
                ) : projects.map(p => {
                  const id = p.nocodb_id ?? p.id;
                  return (
                    <tr key={id}>
                      <td>
                        <strong>{p.title}</strong>
                        {p.description && <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{p.description}</span>}
                      </td>
                      <td><span className="admin-pill">{TYPE_LABEL[p.type] ?? p.type}</span></td>
                      <td>
                        <span className={`admin-pill ${p.status === "active" ? "success" : p.status === "archived" ? "danger" : ""}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="admin-muted" style={{ fontSize: "0.85rem" }}>{p.due_date || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="admin-btn" onClick={() => setForm({ id, title: p.title, description: p.description || "", status: p.status, type: p.type, due_date: p.due_date || "" })}>
                            Editar
                          </button>
                          <button type="button" className="admin-btn" onClick={() => setThread({ id, title: p.title })}>
                            Mensajes
                          </button>
                          <button type="button" className="admin-btn" onClick={() => setWorkspace({ id, title: p.title, current_phase: p.current_phase || "discovery" })}>
                            Workspace
                          </button>
                          <button type="button" className="admin-btn" onClick={() => { setAssign({ id, title: p.title }); setAssignUuid(""); setAssignPerm("viewer"); }}>
                            Asignar
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => setConfirmState({
                            title: `¿Eliminar "${p.title}"?`,
                            message: "Esta acción no se puede deshacer.",
                            danger: true,
                            confirmLabel: "Eliminar",
                            onConfirm: () => deleteProject(id, p.title),
                          })}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {threadModal && (
        <ThreadModal
          project={threadModal}
          onClose={() => setThread(null)}
          show={show}
        />
      )}

      {workspaceModal && (
        <WorkspaceModal
          project={workspaceModal}
          onProjectUpdate={updates => {
            setProjects(prev => prev.map(p =>
              (p.nocodb_id ?? p.id) === workspaceModal.id ? { ...p, ...updates } : p
            ));
            setWorkspace(prev => ({ ...prev, ...updates }));
          }}
          onClose={() => setWorkspace(null)}
          show={show}
        />
      )}

      {assignModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setAssign(null)}>
          <div className="admin-card admin-modal-card modal-inner">
            <button type="button" className="admin-modal-close" onClick={() => setAssign(null)}>✕</button>
            <h2 style={{ marginBottom: 16 }}>Asignar usuario a "{assignModal.title}"</h2>
            <form onSubmit={assignUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <select className="admin-control" value={assignUuid} onChange={e => setAssignUuid(e.target.value)} required>
                <option value="">Seleccionar usuario…</option>
                {users.map(u => (
                  <option key={u.uuid} value={u.uuid}>
                    {u.full_name || u.email} ({u.email})
                  </option>
                ))}
              </select>
              <select className="admin-control" value={assignPerm} onChange={e => setAssignPerm(e.target.value)}>
                {PERM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="admin-btn primary" disabled={saving || !assignUuid}>
                  {saving ? "Asignando…" : "Asignar"}
                </button>
                <button type="button" className="admin-btn" onClick={() => setAssign(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />

      {confirmState && (
        <ConfirmModal
          {...confirmState}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
        />
      )}
    </>
  );
}
