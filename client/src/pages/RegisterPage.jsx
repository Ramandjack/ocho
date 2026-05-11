import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { apiFetch } from "../lib/api.js";

const INTEREST_OPTIONS = [
  { value: "", label: "Seleccionar" },
  { value: "branding", label: "Branding y posicionamiento" },
  { value: "digital_products", label: "Productos digitales" },
  { value: "ai_systems", label: "Sistemas y automatización con IA" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "marketing", label: "Marketing y growth" },
  { value: "editorial", label: "Fotografía, libros y contenido editorial" },
  { value: "all", label: "Todo lo anterior" },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ text: "Creando cuenta…", type: "" });
    setSubmitting(true);
    const form = e.target;

    const newsletterConsent = form.newsletter_consent.checked;
    const dataConsent = form.data_consent.checked;

    const payload = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      email: form.email.value.trim(),
      city: form.city.value.trim(),
      country: form.country.value.trim(),
      phone: form.phone.value.trim(),
      company: form.company.value.trim(),
      role: form.role.value.trim(),
      interest: form.interest.value.trim(),
      profile: form.profile.value.trim(),
      password: form.password.value,
      newsletter_consent: newsletterConsent,
      data_consent: dataConsent,
    };

    try {
      await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus({ text: "Cuenta creada correctamente. Redirigiendo…", type: "success" });
      setTimeout(() => navigate("/panel", { replace: true }), 900);
    } catch (err) {
      setStatus({ text: err.message || "No se pudo crear la cuenta", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-body">
      <AuthLayout
        brandEyebrow="OCHO COMMUNITY"
        brandTitle="Accede a ideas, criterio y contenido con dirección."
        brandQuote="Newsletter, fotografías, revistas, libros y piezas seleccionadas para una comunidad que valora claridad, sistema y visión."
        benefits={["Contenido curado", "Recursos exclusivos", "Mirada editorial y estratégica", "Acceso anticipado a novedades"]}
        eyebrow="Registro"
        title="Únete a la comunidad OCHO"
        subtitle="Déjanos tus datos para crear tu cuenta y enviarte contenido de valor relevante para ti."
      >
        <form className="auth-form auth-form-extended" onSubmit={onSubmit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="first_name">Nombre</label>
              <input id="first_name" name="first_name" type="text" placeholder="Tu nombre" required autoComplete="given-name" />
            </div>
            <div className="field">
              <label htmlFor="last_name">Apellido</label>
              <input id="last_name" name="last_name" type="text" placeholder="Tu apellido" required autoComplete="family-name" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="nombre@empresa.com" required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="phone">Teléfono celular</label>
              <input id="phone" name="phone" type="tel" placeholder="+54 9 341 000 0000" required autoComplete="tel" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="city">Localidad</label>
              <input id="city" name="city" type="text" placeholder="Rosario, Santa Fe" required />
            </div>
            <div className="field">
              <label htmlFor="country">País</label>
              <input id="country" name="country" type="text" placeholder="Argentina" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="company">Empresa / proyecto</label>
              <input id="company" name="company" type="text" placeholder="Nombre de empresa o proyecto" />
            </div>
            <div className="field">
              <label htmlFor="role">Rol</label>
              <input id="role" name="role" type="text" placeholder="Founder, marketing, dirección, etc." />
            </div>
          </div>

          <div className="field">
            <label htmlFor="interest">¿Qué tipo de contenido te interesa más?</label>
            <select id="interest" name="interest" required defaultValue="">
              {INTEREST_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="profile">Cuéntanos brevemente sobre ti</label>
            <textarea
              id="profile"
              name="profile"
              rows={4}
              placeholder="Tu proyecto, tu momento actual, lo que estás buscando o el tipo de contenido que más valoras."
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="consent-group">
            <label className="consent-check">
              <input id="newsletter_consent" name="newsletter_consent" type="checkbox" required />
              <span>
                Acepto recibir newsletters, novedades, recursos editoriales y comunicaciones de valor de OCHO.
              </span>
            </label>
            <label className="consent-check">
              <input id="data_consent" name="data_consent" type="checkbox" required />
              <span>
                Acepto que mis datos sean utilizados para personalizar contenido, segmentación y acciones de CRM marketing.
              </span>
            </label>
          </div>

          <button className="btn btn-solid btn-full" type="submit" disabled={submitting}>
            Crear cuenta
          </button>

          <p className={`form-status${status.type ? ` ${status.type}` : ""}`} aria-live="polite">
            {status.text}
          </p>
        </form>

        <p className="auth-switch">
          ¿Ya tienes cuenta? <Link to="/login">Ingresar</Link>
        </p>
      </AuthLayout>
    </div>
  );
}
