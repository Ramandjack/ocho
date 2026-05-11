import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logoutRequest } from "../lib/api.js";

/**
 * Ruta dedicada a cerrar sesión: POST /api/logout y redirección a login.
 * No hay AuthProvider aún; la sesión real vive en la cookie HttpOnly.
 */
export default function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await logoutRequest();
      } finally {
        if (!cancelled) {
          navigate("/login", { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="auth-body" style={{ minHeight: "40vh", display: "grid", placeItems: "center" }}>
      <p className="section-text">Cerrando sesión…</p>
    </div>
  );
}
