import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TaskComments({ taskId, currentUserUuid, show, onLoaded }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [content,  setContent]  = useState("");
  const [sending,  setSending]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/user/tasks/${taskId}/comments`)
      .then(res => { if (!cancelled) setMessages(res.messages ?? []); })
      .catch(err => { if (!cancelled) show?.(err.message || "No se pudieron cargar los comentarios", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  // Reporta la lista al padre para que pueda derivar cosas (ej. último comentario de
  // revisión) sin duplicar el fetch de comentarios.
  useEffect(() => { onLoaded?.(messages); }, [messages, onLoaded]);

  async function send(e) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/user/tasks/${taskId}/comments`, {
        method: "POST",
        body:   JSON.stringify({ content: trimmed }),
      });
      setMessages(prev => [...prev, res.message]);
      setContent("");
    } catch (err) {
      show?.(err.message || "No se pudo enviar el comentario", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="task-comments">
      <p className="task-drawer-section-label">Comentarios</p>

      {loading ? (
        <p className="task-comments-empty">Cargando…</p>
      ) : messages.length === 0 ? (
        <p className="task-comments-empty">Sin comentarios todavía.</p>
      ) : (
        <div className="task-comments-list">
          {messages.map(m => (
            <div key={m.id ?? m.nocodb_id} className={`task-comment${m.user_uuid === currentUserUuid ? " own" : ""}`}>
              <div className="task-comment-head">
                <span className="task-comment-author">{m.author_name}</span>
                <span className="task-comment-time">{formatDateTime(m.CreatedAt)}</span>
              </div>
              <p className="task-comment-body">{m.content}</p>
            </div>
          ))}
        </div>
      )}

      <form className="task-comments-form" onSubmit={send}>
        <input
          className="task-form-input"
          placeholder="Escribir un comentario…"
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={sending}
        />
        <button className="task-form-save" type="submit" disabled={sending || !content.trim()}>
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
