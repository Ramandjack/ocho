import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const [users,     setUsers]     = useState([]);
  const [leads,     setLeads]     = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [modules,   setModules]   = useState([]);
  const [content,   setContent]   = useState([]);
  const [activity,  setActivity]  = useState([]);
  const [ready,     setReady]     = useState(false);
  const [loadError, setLoadError] = useState(null);

  const setterMap = {
    users: setUsers, leads: setLeads, projects: setProjects,
    tasks: setTasks, modules: setModules, content: setContent, activity: setActivity,
  };

  const fetchBootstrap = useCallback(async () => {
    setLoadError(null);
    const r = await apiFetch("/api/admin/bootstrap");
    setUsers(r.users    ?? []);
    setLeads(r.leads    ?? []);
    setProjects(r.projects ?? []);
    setTasks(r.tasks    ?? []);
    setModules(r.modules  ?? []);
    setContent(r.content  ?? []);
    setActivity(r.activity ?? []);
    if (r._errors) {
      const names = Object.keys(r._errors).join(", ");
      setLoadError(`Datos parciales — error en: ${names}. Revisá la configuración de NocoDB.`);
    }
  }, []);

  const fetchKeys = useCallback(async (keys) => {
    const targets = Array.isArray(keys) ? keys : [keys];
    const results = await Promise.allSettled(
      targets.map(k => apiFetch(PATHS[k]).then(r => EXTRACT[k](r)))
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") setterMap[targets[i]](r.value);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didInit = useRef(false);
  useEffect(() => {
    // React StrictMode invoca este efecto dos veces en desarrollo (mount→cleanup→mount)
    // para detectar efectos no idempotentes — este guard evita duplicar el fetch inicial
    // contra NocoDB. El ref sobrevive ese doble-invoke porque la instancia no se destruye.
    if (!didInit.current) {
      didInit.current = true;
      fetchBootstrap()
        .catch(err => setLoadError(err.message || "Error al conectar con el servidor"))
        .finally(() => setReady(true));
    }
    const id = setInterval(fetchBootstrap, 120_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback((keys) => {
    if (!keys || (Array.isArray(keys) && keys.length === ALL_KEYS.length)) {
      return fetchBootstrap();
    }
    return fetchKeys(Array.isArray(keys) ? keys : [keys]);
  }, [fetchBootstrap, fetchKeys]);

  return (
    <Ctx.Provider value={{
      users, setUsers,
      leads, setLeads,
      projects, setProjects,
      tasks, setTasks,
      modules, setModules,
      content, setContent,
      activity, setActivity,
      ready, loadError, refresh,
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
