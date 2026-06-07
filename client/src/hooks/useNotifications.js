import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiBase } from "../lib/api.js";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);
  const esRef = useRef(null);

  const applyUpdate = useCallback((all) => {
    setNotifications(all);
    setUnread(all.filter(n => !n.read).length);
  }, []);

  // Fallback: plain fetch (used when EventSource is unavailable or errors out)
  const fetchOnce = useCallback(async () => {
    try {
      const res = await apiFetch("/api/user/notifications");
      applyUpdate(res.notifications ?? []);
    } catch {}
  }, [applyUpdate]);

  useEffect(() => {
    let pollId = null;

    function startPolling() {
      if (pollId) return;
      fetchOnce();
      pollId = setInterval(fetchOnce, 60_000);
    }

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => clearInterval(pollId);
    }

    const url = `${getApiBase()}/api/user/notifications/stream`;
    const es  = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("notifications", (e) => {
      try {
        const { notifications: all, unread: u } = JSON.parse(e.data);
        setNotifications(all ?? []);
        setUnread(u ?? 0);
      } catch {}
    });

    es.onerror = () => {
      // SSE failed (network error, proxy timeout, etc.) — close and fall back to polling
      es.close();
      esRef.current = null;
      startPolling();
    };

    return () => {
      es.close();
      esRef.current = null;
      clearInterval(pollId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    // Manual refresh: re-fetch and optionally nudge the SSE (it'll push next cycle)
    await fetchOnce();
  }, [fetchOnce]);

  return { notifications, unread, refresh };
}
