import { useEffect, useRef, useState } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { timeAgo } from "../../lib/utils.js";

const PHASES = [
  { id: "discovery",   label: "Discovery"   },
  { id: "brief",       label: "Brief"       },
  { id: "design",      label: "Diseño"      },
  { id: "development", label: "Desarrollo"  },
  { id: "testing",     label: "Testing"     },
  { id: "launch",      label: "Lanzamiento" },
];

const PHASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));

const PHASE_META = {
  discovery: {
    ocho_does: ["Analizamos y profundizamos el problema", "Validamos con datos de mercado", "Identificamos el MVP mínimo viable"],
    expected:  "Documento Discovery aprobado",
  },
  brief: {
    ocho_does: ["Definimos el alcance técnico", "Establecemos el roadmap de producto", "Alineamos expectativas y restricciones"],
    expected:  "Brief de producto documentado",
  },
  design: {
    ocho_does: ["Diseñamos la arquitectura UX", "Creamos wireframes y prototipos", "Validamos el flujo principal"],
    expected:  "Diseño UX aprobado",
  },
  development: {
    ocho_does: ["Desarrollamos por sprints", "Demos semanales del progreso", "Code review y testing continuo"],
    expected:  "Producto funcional en staging",
  },
  testing: {
    ocho_does: ["Testing funcional completo", "Performance y seguridad", "Corrección de bugs críticos"],
    expected:  "Producto aprobado para lanzamiento",
  },
  launch: {
    ocho_does: ["Deploy a producción", "Monitoreo post-lanzamiento", "Soporte técnico inicial"],
    expected:  "Producto en producción",
  },
};

const PHASE_QUESTIONS = {
  discovery: [
    { key: "problema",        label: "¿Cuál es el problema que querés resolver?",       rows: 3 },
    { key: "usuario",         label: "¿Quién lo tiene? (usuario objetivo)",              rows: 2 },
    { key: "solucion_actual", label: "¿Cómo lo resuelven hoy?",                          rows: 2 },
    { key: "costo",           label: "¿Qué costo tiene no resolver esto?",               rows: 2 },
    { key: "diferencial",     label: "¿Existe competencia? ¿Qué te diferencia?",         rows: 2 },
  ],
  brief: [
    { key: "objetivo",        label: "¿Cuál es el objetivo principal del producto?",     rows: 3 },
    { key: "usuarios",        label: "¿Quiénes son tus usuarios y qué necesitan?",       rows: 2 },
    { key: "funcionalidades", label: "¿Cuáles son las funcionalidades esenciales?",      rows: 3 },
    { key: "exclusiones",     label: "¿Qué NO debe tener el producto?",                  rows: 2 },
    { key: "expectativas",    label: "¿Cuál es tu expectativa de tiempo y presupuesto?", rows: 2 },
  ],
  design: [
    { key: "referencias",     label: "¿Tenés referencias visuales o inspiración?",       rows: 2 },
    { key: "tono",            label: "¿Cuál es el tono de la marca?",                    rows: 2 },
    { key: "guias",           label: "¿Hay guías de estilo existentes?",                 rows: 2 },
    { key: "flujo_principal", label: "¿Cuál es la pantalla/flujo más importante?",      rows: 2 },
    { key: "aprobacion",      label: "¿Quién aprueba el diseño?",                        rows: 1 },
  ],
  development: [
    { key: "integraciones",   label: "¿Hay integraciones con sistemas externos?",        rows: 2 },
    { key: "criterios",       label: "¿Cuáles son los criterios de aceptación?",         rows: 3 },
    { key: "restricciones",   label: "¿Hay restricciones técnicas o de plataforma?",     rows: 2 },
    { key: "deploy",          label: "¿Cómo se va a hacer el deploy?",                   rows: 2 },
  ],
  testing: [
    { key: "testers",         label: "¿Quiénes van a hacer el testing de aceptación?",   rows: 2 },
    { key: "casos_criticos",  label: "¿Cuáles son los casos críticos a testear?",        rows: 3 },
    { key: "ambiente",        label: "¿Cuál es el ambiente de testing?",                  rows: 2 },
  ],
  launch: [
    { key: "fecha",           label: "¿Cuál es la fecha objetivo de lanzamiento?",       rows: 1 },
    { key: "comunicacion",    label: "¿Cuál es el plan de comunicación?",                rows: 3 },
    { key: "soporte",         label: "¿Quién da soporte post-lanzamiento?",              rows: 2 },
  ],
};

const SCORE_DIMS = [
  { key: "problema",      label: "Problema"      },
  { key: "mercado",       label: "Mercado"       },
  { key: "factibilidad",  label: "Factibilidad"  },
  { key: "escalabilidad", label: "Escalabilidad" },
  { key: "monetizacion",  label: "Monetización"  },
];

const NEXT_STATUS = { pending: "in_progress", in_progress: "done", done: "pending" };
const STATUS_LABEL = { pending: "pendiente", in_progress: "en curso", done: "completado" };

export default function WorkspaceView() {
  const { id }   = useParams();
  const { user } = useOutletContext();

  const [project,  setProject]  = useState(null);
  const [phases,   setPhases]   = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [messages, setMessages] = useState([]);
  const [score,    setScore]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const [activePhaseId,  setActivePhaseId]  = useState(null);
  const [questionnaire,  setQuestionnaire]  = useState({});
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const saveTimerRef = useRef(null);

  const [msgText,  setMsgText]  = useState("");
  const [sending,  setSending]  = useState(false);
  const [msgError, setMsgError] = useState(null);

  const msgEndRef   = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    Promise.allSettled([
      apiFetch(`/api/user/projects/${id}`),
      apiFetch(`/api/user/projects/${id}/phases`),
      apiFetch(`/api/user/projects/${id}/messages`),
      apiFetch(`/api/user/projects/${id}/score`),
    ]).then(([projR, phasesR, msgsR, scoreR]) => {
      if (projR.status === "rejected") {
        setError(projR.reason?.message || "Error cargando el proyecto");
        return;
      }
      const proj = projR.value?.project;
      setProject(proj);
      setTasks(projR.value?.tasks ?? []);

      const phasesData = phasesR.status === "fulfilled" ? (phasesR.value?.phases ?? []) : [];
      setPhases(phasesData);
      setMessages(msgsR.status === "fulfilled" ? (msgsR.value?.messages ?? []) : []);
      setScore(scoreR.status === "fulfilled" ? scoreR.value?.score : null);

      const currentPhase = proj?.current_phase || "discovery";
      setActivePhaseId(currentPhase);
      const active = phasesData.find(p => p.phase === currentPhase);
      setQuestionnaire(active?.questionnaire || {});
    })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectPhase(phaseId) {
    clearTimeout(saveTimerRef.current);
    setActivePhaseId(phaseId);
    const phaseData = phases.find(p => p.phase === phaseId);
    setQuestionnaire(phaseData?.questionnaire || {});
    setSaved(false);
  }

  function handleQuestionnaireChange(key, value) {
    const updated = { ...questionnaire, [key]: value };
    setQuestionnaire(updated);
    setSaved(false);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(updated), 1500);
  }

  async function doSave(data) {
    if (!activePhaseId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/user/projects/${id}/phases/${activePhaseId}`, {
        method: "PATCH",
        body: JSON.stringify({ questionnaire: data }),
      });
      setPhases(prev => {
        const exists = prev.some(p => p.phase === activePhaseId);
        if (exists) {
          return prev.map(p =>
            p.phase === activePhaseId
              ? { ...p, questionnaire: data, status: p.status === "pending" ? "in_progress" : p.status }
              : p
          );
        }
        return [...prev, { phase: activePhaseId, status: "in_progress", questionnaire: data }];
      });
      setSaved(true);
    } catch {
      // silent fail on auto-save
    } finally {
      setSaving(false);
    }
  }

  async function cycleStatus(task) {
    const next = NEXT_STATUS[task.status] ?? "pending";
    const tid  = task.nocodb_id ?? task.id;
    setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: next } : t));
    try {
      await apiFetch(`/api/user/tasks/${tid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setTasks(prev => prev.map(t => (t.nocodb_id ?? t.id) === tid ? { ...t, status: task.status } : t));
    }
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const content = msgText.trim();
    if (!content || sending) return;
    setSending(true);
    setMsgError(null);

    const tempId     = `temp-${Date.now()}`;
    const optimistic = {
      nocodb_id:   tempId,
      content,
      author_name: user?.first_name || user?.full_name?.split(" ")[0] || "Vos",
      author_role: user?.role || "client",
      CreatedAt:   new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setMsgText("");

    try {
      const res = await apiFetch(`/api/user/projects/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages(prev => prev.map(m => (m.nocodb_id ?? m.id) === tempId ? res.message : m));
    } catch (err) {
      setMessages(prev => prev.filter(m => (m.nocodb_id ?? m.id) !== tempId));
      setMsgText(content);
      setMsgError(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  if (loading) return <div className="view-loading">Cargando producto…</div>;
  if (error)   return <div className="view-loading">{error}</div>;
  if (!project) return null;

  const currentPhaseIndex = PHASE_INDEX[project.current_phase || "discovery"] ?? 0;
  const activePhase       = PHASES.find(p => p.id === activePhaseId) || PHASES[0];
  const activePhaseData   = phases.find(p => p.phase === activePhaseId);
  const activePhaseIndex  = PHASE_INDEX[activePhaseId] ?? 0;
  const isEditable        = activePhaseIndex <= currentPhaseIndex;
  const questions         = PHASE_QUESTIONS[activePhaseId] || [];
  const meta              = PHASE_META[activePhaseId] || {};

  const scoreTotal = score
    ? SCORE_DIMS.reduce((sum, d) => sum + Number(score[d.key] || 0), 0)
    : null;

  const createdAt  = project.CreatedAt || project.created_at;
  const daysActive = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
    : null;

  const tasksDone  = tasks.filter(t => t.status === "done").length;
  const tasksTotal = tasks.length;

  return (
    <div className="pw-view">
      <Link to="/panel/projects" className="canvas-back">← Productos</Link>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="pw-header">
        <div className="pw-header-meta">
          {project.type && <span className="canvas-type-badge">{project.type}</span>}
          <span className={`canvas-status-badge ${project.status ?? ""}`}>
            {project.status === "active" ? "activo" : (project.status ?? "")}
          </span>
        </div>
        <h1 className="pw-title">{project.title}</h1>
        {project.description && <p className="pw-desc">{project.description}</p>}
      </div>

      {/* ── Phase Progress Rail ─────────────────────────── */}
      <div className="pw-rail">
        {PHASES.map((phase, i) => {
          const dbPhase      = phases.find(p => p.phase === phase.id);
          const state        = i < currentPhaseIndex ? "done" : i === currentPhaseIndex ? "active" : "pending";
          const isSelectable = i <= currentPhaseIndex;
          const isSelected   = activePhaseId === phase.id;
          return (
            <button
              key={phase.id}
              className={`pw-rail-step ${state}${isSelected ? " selected" : ""}${!isSelectable ? " locked" : ""}`}
              onClick={() => isSelectable && selectPhase(phase.id)}
              disabled={!isSelectable}
            >
              <div className="pw-rail-connector" />
              <div className="pw-rail-dot-wrap">
                <div className="pw-rail-dot">
                  {state === "done" && <span className="pw-rail-check">✓</span>}
                </div>
                {dbPhase?.status === "in_progress" && state !== "done" && (
                  <span className="pw-rail-ping" />
                )}
              </div>
              <span className="pw-rail-label">{phase.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Body: 2 columns ────────────────────────────── */}
      <div className="pw-body">

        {/* Left — Phase Panel */}
        <div className="pw-left">
          <div className="pw-phase-panel">

            <div className="pw-phase-panel-head">
              <span className="pw-phase-name">{activePhase.label}</span>
              {activePhaseData && (
                <span className={`pw-phase-pill ${activePhaseData.status}`}>
                  {activePhaseData.status === "in_progress" ? "en progreso" :
                   activePhaseData.status === "completed"   ? "completado"  : "pendiente"}
                </span>
              )}
            </div>

            {/* Questionnaire */}
            {questions.length > 0 && (
              <div className="pw-questionnaire">
                <p className="pw-q-heading">Lo que necesitamos saber</p>
                {questions.map(q => (
                  <div key={q.key} className="pw-question">
                    <label className="pw-q-label">{q.label}</label>
                    <textarea
                      className="pw-q-input"
                      rows={q.rows}
                      value={questionnaire[q.key] || ""}
                      onChange={e => handleQuestionnaireChange(q.key, e.target.value)}
                      disabled={!isEditable}
                      placeholder={isEditable ? "Escribí tu respuesta…" : ""}
                    />
                  </div>
                ))}
                <div className="pw-q-footer">
                  {saving     && <span className="pw-save-status">Guardando…</span>}
                  {saved && !saving && <span className="pw-save-status saved">Guardado ✓</span>}
                  {isEditable && (
                    <button className="pw-save-btn" onClick={() => doSave(questionnaire)} disabled={saving}>
                      Guardar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* What OCHO does */}
            {meta.ocho_does && (
              <div className="pw-phase-meta">
                <p className="pw-meta-title">Qué hace OCHO en esta etapa</p>
                <ul className="pw-meta-list">
                  {meta.ocho_does.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
                {meta.expected && (
                  <p className="pw-meta-result">
                    Resultado: <strong>{meta.expected}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Tasks (compact) */}
            {tasksTotal > 0 && (
              <div className="pw-tasks-compact">
                <p className="pw-meta-title">Tareas asignadas</p>
                <ul className="pw-task-list">
                  {tasks.slice(0, 5).map(task => {
                    const tid = task.nocodb_id ?? task.id;
                    return (
                      <li key={tid} className="pw-task-item">
                        <button
                          className={`pw-task-pill ${task.status ?? "pending"}`}
                          onClick={() => cycleStatus(task)}
                        >
                          {STATUS_LABEL[task.status] ?? task.status}
                        </button>
                        <span className="pw-task-title">{task.title}</span>
                      </li>
                    );
                  })}
                </ul>
                {tasksTotal > 5 && (
                  <p className="pw-tasks-more">+{tasksTotal - 5} más</p>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Right — Score + Metrics */}
        <div className="pw-right">

          {/* Idea Score */}
          <div className="pw-card">
            <div className="pw-card-head">
              <span className="pw-card-title">Idea Score</span>
              {scoreTotal !== null && (
                <span className="pw-score-total">
                  {scoreTotal}<span className="pw-score-max">/100</span>
                </span>
              )}
            </div>
            {score ? (
              <div className="pw-score-dims">
                {SCORE_DIMS.map(dim => {
                  const val = Number(score[dim.key] || 0);
                  return (
                    <div key={dim.key} className="pw-score-row">
                      <span className="pw-score-label">{dim.label}</span>
                      <div className="pw-score-track">
                        <div className="pw-score-fill" style={{ width: `${(val / 20) * 100}%` }} />
                      </div>
                      <span className="pw-score-val">{val}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pw-card-empty">OCHO completará el score durante el proceso.</p>
            )}
          </div>

          {/* Metrics */}
          <div className="pw-card">
            <p className="pw-card-title">Métricas</p>
            <div className="pw-metrics">
              <div className="pw-metric-row">
                <span className="pw-metric-label">Etapa actual</span>
                <span className="pw-metric-value">
                  {PHASES.find(p => p.id === (project.current_phase || "discovery"))?.label}
                </span>
              </div>
              {daysActive !== null && (
                <div className="pw-metric-row">
                  <span className="pw-metric-label">Días activos</span>
                  <span className="pw-metric-value">{daysActive}</span>
                </div>
              )}
              {tasksTotal > 0 && (
                <div className="pw-metric-row">
                  <span className="pw-metric-label">Tareas</span>
                  <span className="pw-metric-value">{tasksDone}/{tasksTotal}</span>
                </div>
              )}
              {scoreTotal !== null && (
                <div className="pw-metric-row">
                  <span className="pw-metric-label">Score</span>
                  <span className="pw-metric-value">{scoreTotal}/100</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Conversación del Producto ──────────────────── */}
      <div className="canvas-panel pw-convo">
        <div className="canvas-panel-header">
          <span className="canvas-panel-title">Conversación del Producto</span>
          <span className="pw-convo-sub">Co-creación con el equipo OCHO</span>
        </div>

        <div className="canvas-thread">
          {!messages.length ? (
            <p className="canvas-thread-empty">
              Usá este espacio para dejar comentarios, preguntas o ideas.<br />
              El equipo OCHO responde desde acá.
            </p>
          ) : (
            messages.map(msg => {
              const isTeam = ["admin", "member"].includes(String(msg.author_role || "").toLowerCase());
              const msgId  = msg.nocodb_id ?? msg.id;
              return (
                <div key={msgId} className={`canvas-msg ${isTeam ? "team" : "client"}`}>
                  <div className="canvas-msg-meta">
                    <span className="canvas-msg-author">
                      {isTeam ? "OCHO" : (msg.author_name || "Vos")}
                    </span>
                    <span className="canvas-msg-time">
                      {timeAgo(msg.CreatedAt || msg.created_at)}
                    </span>
                  </div>
                  <p className="canvas-msg-content">{msg.content}</p>
                </div>
              );
            })
          )}
          <div ref={msgEndRef} />
        </div>

        <form className="canvas-msg-form" onSubmit={sendMessage}>
          {msgError && <p className="canvas-msg-error">{msgError}</p>}
          <div className="canvas-msg-input-row">
            <textarea
              ref={textareaRef}
              className="canvas-msg-input"
              placeholder="Escribí tu mensaje… (Enter para enviar)"
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={handleKey}
              disabled={sending}
              rows={2}
            />
            <button
              className="canvas-msg-send"
              type="submit"
              disabled={sending || !msgText.trim()}
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
