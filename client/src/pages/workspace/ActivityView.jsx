import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

const TYPE_DOT = {
  project: "P",
  task:    "T",
  system:  "S",
};

export default function ActivityView() {
  const [items, setItems]     = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    apiFetch("/api/user/notifications")
      .then(res => {
        setItems(res.notifications ?? []);
        setUnread(res.unread ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function markRead(item) {
    const id = item.nocodb_id ?? item.id;
    if (item.read) return;

    setItems(prev =>
      prev.map(n => (n.nocodb_id ?? n.id) === id ? { ...n, read: true } : n)
    );
    setUnread(u => Math.max(0, u - 1));

    apiFetch(`/api/user/notifications/${id}/read`, { method: "PATCH" }).catch(() => {
      setItems(prev =>
        prev.map(n => (n.nocodb_id ?? n.id) === id ? { ...n, read: false } : n)
      );
      setUnread(u => u + 1);
    });
  }

  async function markAllRead() {
    if (!unread || marking) return;
    setMarking(true);

    const prev = items;
    setItems(i => i.map(n => ({ ...n, read: true })));
    setUnread(0);

    try {
      await apiFetch("/api/user/notifications/read-all", { method: "PATCH" });
    } catch {
      setItems(prev);
      setUnread(prev.filter(n => !n.read).length);
    } finally {
      setMarking(false);
    }
  }

  if (loading) return <div className="view-loading">Cargando actividad…</div>;

  return (
    <div className="activity-view">
      <header className="view-header">
        <div className="activity-header-row">
          <div>
            <h1 className="view-title">Actividad</h1>
            <p className="view-sub">Notificaciones y eventos de tu cuenta.</p>
          </div>
          {unread > 0 && (
            <button
              className="activity-mark-all"
              onClick={markAllRead}
              disabled={marking}
            >
              Marcar todo como leído
            </button>
          )}
        </div>
      </header>

      {!items.length ? (
        <p className="view-empty">Sin actividad registrada todavía.</p>
      ) : (
        <ul className="activity-list">
          {items.map(item => {
            const id = item.nocodb_id ?? item.id;
            return (
              <li
                key={id}
                className={`activity-item${!item.read ? " unread" : ""}`}
                onClick={() => markRead(item)}
              >
                <span className={`activity-dot type-${item.type ?? "system"}`}>
                  {TYPE_DOT[item.type] ?? "·"}
                </span>

                <div className="activity-body">
                  <span className="activity-title">{item.title}</span>
                  {item.message && (
                    <span className="activity-message">{item.message}</span>
                  )}
                </div>

                <span className="activity-time">
                  {timeAgo(item.CreatedAt ?? item.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
