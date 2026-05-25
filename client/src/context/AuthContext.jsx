import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch("/api/me");
      if (r.success) setUser(r.user);
      else setUser(null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function logout() { setUser(null); }

  const isAdmin  = String(user?.role || "").toLowerCase() === "admin";
  const isMember = !!user;

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh, logout, isAdmin, isMember }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
