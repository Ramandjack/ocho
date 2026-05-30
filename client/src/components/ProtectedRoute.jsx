import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const location = useLocation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-body" style={{ minHeight: "40vh", display: "grid", placeItems: "center" }}>
        <p className="section-text">Cargando…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const role   = String(user.role   || "").toLowerCase();
  const status = String(user.status || "active").toLowerCase();

  // Usuarios no activos (pending/rejected/banned) no acceden al panel
  if (role !== "admin" && status !== "active") {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  return children;
}
