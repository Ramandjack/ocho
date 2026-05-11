import { cloneElement, isValidElement, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "../lib/api.js";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, user: null, forbidden: false });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getCurrentUser();
        if (cancelled) return;
        const user = data.user;
        if (!data.success || !user) {
          setState({ loading: false, user: null, forbidden: false });
          return;
        }
        const role = String(user.role || "").toLowerCase();
        if (requireAdmin && role !== "admin") {
          setState({ loading: false, user: null, forbidden: true });
          return;
        }
        setState({ loading: false, user, forbidden: false });
      } catch {
        if (!cancelled) setState({ loading: false, user: null, forbidden: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requireAdmin, location.pathname]);

  if (state.loading) {
    return (
      <div className="auth-body" style={{ minHeight: "40vh", display: "grid", placeItems: "center" }}>
        <p className="section-text">Cargando…</p>
      </div>
    );
  }

  if (state.forbidden) {
    return <Navigate to="/panel" replace />;
  }

  if (!state.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return isValidElement(children) ? cloneElement(children, { user: state.user }) : children;
}
