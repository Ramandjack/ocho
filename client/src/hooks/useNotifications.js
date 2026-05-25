import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { usePolling } from "./usePolling.js";

export function useNotifications(intervalMs = 30_000) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);

  const fetch = useCallback(async () => {
    try {
      const res = await apiFetch("/api/user/notifications");
      const all = res.notifications ?? [];
      setNotifications(all);
      setUnread(all.filter(n => !n.read).length);
    } catch {}
  }, []);

  usePolling(fetch, intervalMs);

  return { notifications, unread, refresh: fetch };
}
