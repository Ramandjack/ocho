import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
}

function BriefCard({ brief, loading, onRegenerate, regenerating }) {
  return (
    <section className="ai-section">
      <div className="ai-section-head">
        <h2 className="ai-section-title">Brief del día</h2>
        <button
          className="ai-section-action"
          onClick={onRegenerate}
          disabled={loading || regenerating}
        >
          {regenerating ? "Generando…" : "Regenerar"}
        </button>
      </div>

      <div className="ai-brief-card">
        {loading ? (
          <div className="ai-brief-loading">
            <span className="ai-pulse" />
            <span className="ai-pulse" />
            <span className="ai-pulse" />
          </div>
        ) : (
          <div
            className="ai-brief-text"
            dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(brief ?? "")}</p>` }}
          />
        )}
      </div>
    </section>
  );
}

function ChatMessage({ role, content }) {
  return (
    <div className={`ai-msg ai-msg-${role}`}>
      <div
        className="ai-msg-content"
        dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(content)}</p>` }}
      />
    </div>
  );
}

export default function AIView() {
  const [brief, setBrief]               = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => { loadBrief(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function loadBrief(isRegen = false) {
    if (isRegen) setRegenerating(true);
    else setBriefLoading(true);

    try {
      const res = await apiFetch("/api/ai/brief", { method: "POST" });
      setBrief(res.brief ?? "");
    } catch {
      setBrief("No se pudo generar el brief.");
    } finally {
      setBriefLoading(false);
      setRegenerating(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next }),
      });
      setMessages(m => [...m, { role: "assistant", content: res.message ?? "" }]);
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="ai-view">
      <header className="view-header">
        <h1 className="view-title">IA</h1>
        <p className="view-sub">Tu asistente de workspace.</p>
      </header>

      <BriefCard
        brief={brief}
        loading={briefLoading}
        onRegenerate={() => loadBrief(true)}
        regenerating={regenerating}
      />

      <section className="ai-section">
        <div className="ai-section-head">
          <h2 className="ai-section-title">Chat</h2>
          {messages.length > 0 && (
            <button
              className="ai-section-action"
              onClick={() => setMessages([])}
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="ai-chat-window">
          {messages.length === 0 && !sending ? (
            <p className="ai-chat-empty">
              Preguntale algo sobre tus proyectos, tareas o el workspace.
            </p>
          ) : (
            <>
              {messages.map((m, i) => (
                <ChatMessage key={i} role={m.role} content={m.content} />
              ))}
              {sending && (
                <div className="ai-msg ai-msg-assistant">
                  <div className="ai-brief-loading">
                    <span className="ai-pulse" />
                    <span className="ai-pulse" />
                    <span className="ai-pulse" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        <form className="ai-chat-form" onSubmit={sendMessage}>
          <input
            ref={inputRef}
            className="ai-chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escribí tu pregunta…"
            disabled={sending}
          />
          <button
            type="submit"
            className="ai-chat-send"
            disabled={!input.trim() || sending}
          >
            →
          </button>
        </form>
      </section>
    </div>
  );
}
