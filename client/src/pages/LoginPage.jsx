import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { apiFetch, getCurrentUser } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const navigate    = useNavigate();
  const { setUser } = useAuth();
  const [status, setStatus] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ text: "Ingresando…", type: "" });
    setSubmitting(true);
    const form = e.target;
    const payload = {
      email: form.email.value.trim(),
      password: form.password.value,
    };

    try {
      await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus({ text: "Login correcto. Redirigiendo…", type: "success" });
      try {
        const me = await getCurrentUser();
        setUser(me.user); // Actualiza AuthContext antes de navegar
        const role = String(me?.user?.role || "").toLowerCase();
        setTimeout(() => navigate(role === "admin" ? "/admin" : "/panel", { replace: true }), 400);
      } catch {
        setTimeout(() => navigate("/panel", { replace: true }), 400);
      }
    } catch (err) {
      setStatus({ text: err.message || "No se pudo iniciar sesión", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-body">
      <AuthLayout
        brandEyebrow="OCHO"
        brandTitle="Volver a entrar es volver a construir."
        brandQuote="Accede a contenido, criterio y herramientas diseñadas para quienes no siguen sistemas. Los crean."
        benefits={[
          "Acceso a contenido exclusivo",
          "Herramientas del ecosistema OCHO",
          "Recursos estratégicos y formación",
        ]}
        eyebrow="Login"
        title="Ingresar"
        subtitle="Introduce tus credenciales para acceder al sistema."
      >
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="nombre@empresa.com" required autoComplete="email" />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button className="btn btn-solid btn-full" type="submit" disabled={submitting}>
            Ingresar
          </button>

          <p className={`form-status${status.type ? ` ${status.type}` : ""}`} aria-live="polite">
            {status.text}
          </p>
        </form>

        <p className="auth-switch">
          ¿No tienes cuenta? <Link to="/register">Crear cuenta</Link>
        </p>
      </AuthLayout>
    </div>
  );
}
