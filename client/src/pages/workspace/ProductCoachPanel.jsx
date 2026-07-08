import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

export default function ProductCoachPanel({ onClose, onOpenTask, show }) {
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState(null);
  const [emptyMessage, setEmptyMessage] = useState(null);

  useEffect(() => { generate(); }, []);

  async function generate() {
    setLoading(true);
    setRecommendations(null);
    setEmptyMessage(null);
    try {
      const res = await apiFetch("/api/user/tasks/coach", { method: "POST" });
      if (!res.recommendations?.length) {
        setEmptyMessage(res.message || "No hay tareas activas para priorizar — todo al día.");
      } else {
        setRecommendations(res.recommendations);
      }
    } catch (err) {
      show?.(err.message || "No se pudo generar el plan del día", "error");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ai-gen-modal coach-modal">
        <div className="ai-gen-header">
          <div>
            <span className="ai-gen-title">✨ Planificar mi día</span>
            {recommendations && (
              <span className="ai-gen-sub">Priorizado según vencimientos, bloqueos y cercanía al lanzamiento</span>
            )}
          </div>
          <button className="task-form-close" onClick={onClose} type="button">✕</button>
        </div>

        {loading && (
          <div className="ai-gen-loading coach-loading">
            <span className="pw-ai-dot" /><span className="pw-ai-dot" /><span className="pw-ai-dot" />
            Analizando tus tareas…
          </div>
        )}

        {!loading && emptyMessage && (
          <p className="coach-empty">{emptyMessage}</p>
        )}

        {!loading && recommendations && (
          <div className="coach-list">
            {recommendations.map((r, i) => (
              <div key={r.task.nocodb_id ?? r.task.id} className="coach-item">
                <span className="coach-item-rank">{i + 1}</span>
                <div className="coach-item-body">
                  <p className="coach-item-title" onClick={() => onOpenTask(r.task)}>{r.task.title}</p>
                  {r.reason && <p className="coach-item-reason">{r.reason}</p>}
                  {r.impact && <p className="coach-item-impact">→ {r.impact}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="ai-gen-preview-footer">
          <button className="task-form-cancel" onClick={generate} disabled={loading} type="button">
            ↻ Regenerar
          </button>
          <button className="task-form-save" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
