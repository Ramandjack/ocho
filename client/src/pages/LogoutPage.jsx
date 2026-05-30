import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logoutRequest } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LogoutPage() {
  const navigate    = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await logoutRequest(); // limpia cookie en el servidor
      } finally {
        if (!cancelled) {
          setUser(null); // limpia AuthContext — crítico para aislar sesiones
          navigate("/login", { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, setUser]);

  return (
    <div className="auth-body" style={{ minHeight: "40vh", display: "grid", placeItems: "center" }}>
      <p className="section-text">Cerrando sesión…</p>
    </div>
  );
}
