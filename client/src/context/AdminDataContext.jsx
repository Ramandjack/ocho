import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const Ctx = createContext(null);

const PATHS = {
  users:    "/api/admin/users",
  leads:    "/api/admin/leads",
  projects: "/api/admin/projects",
  tasks:    "/api/admin/tasks",
  modules:  "/api/admin/modules",
  content:  "/api/admin/content",
  activity: "/api/admin/activity",
};

const EXTRACT = {
  users:    r => r.users    ?? [],
  leads:    r => r.leads    ?? [],
  projects: r => r.projects ?? [],
  tasks:    r => r.tasks    ?? [],
  modules:  r => r.modules  ?? [],
  content:  r => r.content  ?? [],
  activity: r => r.logs     ?? [],
};

const ALL_KEYS = Object.keys(PATHS);

export function AdminDataProvider({ children }) {
  const [users,    setUsers]    = useState([]);
  const [leads,    setLeads]    = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [modules,  setModules]  = useState([]);
  const [content,  setContent]  = useState([]);
  const [activity, setActivity] = useState([]);
  const [ready,    setReady]    = useState(false);

  const setterMap = { users: setUsers, leads: setLeads, projects: setProjects, tasks: setTasks, modules: setModules, content: setContent, activity: setActivity };

  const fetchKeys = useCallback(async (keys = ALL_KEYS) => {
    const results = await Promise.allSettled(
      keys.map(k => apiFetch(PATHS[k]).then(r => EXTRACT[k](r)))
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") setterMap[keys[i]](r.value);
    });
  // setterMap values are stable useState setters — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchKeys().finally(() => setReady(true));
    const id = setInterval(() => fetchKeys(), 60_000);
    return () => clearInterval(id);
  // fetchKeys is stable (useCallback with [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback((keys) => {
    const k = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : ALL_KEYS;
    return fetchKeys(k);
  }, [fetchKeys]);

  return (
    <Ctx.Provider value={{
      users, setUsers,
      leads, setLeads,
      projects, setProjects,
      tasks, setTasks,
      modules, setModules,
      content, setContent,
      activity, setActivity,
      ready, refresh,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminData must be used inside AdminDataProvider");
  return ctx;
}
