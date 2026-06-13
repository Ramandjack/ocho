import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiFetch } from "../../lib/api.js";

const INTEREST_OPTIONS = [
  "saas", "ecommerce", "marketplace", "ia", "web", "mobile", "otro",
];

export default function ProfileView() {
  const { user, show } = useOutletContext();
  const { setUser }    = useAuth();

  // ── Datos personales ──────────────────────────────────────
  const [profile, setProfile] = useState({
    first_name: user?.first_name || "",
    last_name:  user?.last_name  || "",
    city:       user?.city       || "",
    country:    user?.country    || "",
    phone:      user?.phone      || "",
    company:    user?.company    || "",
    role_title: user?.role_title || "",
    profile:    user?.profile    || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDirty,  setProfileDirty]  = useState(false);

  function setP(k, v) {
    setProfile(p => ({ ...p, [k]: v }));
    setProfileDirty(true);
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await apiFetch("/api/user/profile", {
        method: "PATCH",
        body:   JSON.stringify(profile),
      });
      setUser(prev => ({
        ...prev,
        ...res.fields,
        full_name: `${res.fields.first_name ?? prev.first_name} ${res.fields.last_name ?? prev.last_name}`.trim(),
      }));
      setProfileDirty(false);
      show("Perfil actualizado", "success");
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Cambiar contraseña ────────────────────────────────────
  const [pwd, setPwd]         = useState({ current: "", next: "", confirm: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError,  setPwdError]  = useState(null);

  function setQ(k, v) { setPwd(p => ({ ...p, [k]: v })); setPwdError(null); }

  async function savePassword(e) {
    e.preventDefault();
    setPwdError(null);
    if (pwd.next.length < 8) {
      setPwdError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setPwdError("Las contraseñas no coinciden.");
      return;
    }
    setPwdSaving(true);
    try {
      await apiFetch("/api/user/password", {
        method: "PATCH",
        body:   JSON.stringify({ current_password: pwd.current, new_password: pwd.next }),
      });
      setPwd({ current: "", next: "", confirm: "" });
      show("Contraseña actualizada", "success");
    } catch (err) {
      setPwdError(err.message);
    } finally {
      setPwdSaving(false);
    }
  }

  const initials = (
    (user?.first_name?.[0] || user?.full_name?.[0] || "U") +
    (user?.last_name?.[0]  || user?.full_name?.split(" ")?.[1]?.[0] || "")
  ).toUpperCase();

  return (
    <div className="profile-view">

      {/* ── Avatar header ──────────────────────────────────── */}
      <header className="view-header">
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div>
            <h1 className="view-title">{user?.full_name || "Tu perfil"}</h1>
            <p className="view-sub">{user?.email}</p>
          </div>
        </div>
      </header>

      <div className="profile-body">

        {/* ── Datos personales ────────────────────────────── */}
        <section className="profile-card">
          <h2 className="profile-section-title">Datos personales</h2>
          <form onSubmit={saveProfile} className="profile-form">

            <div className="profile-row">
              <div className="profile-field">
                <label className="profile-label">Nombre</label>
                <input className="profile-input"
                  value={profile.first_name}
                  onChange={e => setP("first_name", e.target.value)}
                  placeholder="Nombre" />
              </div>
              <div className="profile-field">
                <label className="profile-label">Apellido</label>
                <input className="profile-input"
                  value={profile.last_name}
                  onChange={e => setP("last_name", e.target.value)}
                  placeholder="Apellido" />
              </div>
            </div>

            <div className="profile-field">
              <label className="profile-label">Email</label>
              <input className="profile-input profile-input-disabled"
                value={user?.email || ""}
                disabled
                title="El email no se puede cambiar" />
            </div>

            <div className="profile-row">
              <div className="profile-field">
                <label className="profile-label">Ciudad</label>
                <input className="profile-input"
                  value={profile.city}
                  onChange={e => setP("city", e.target.value)}
                  placeholder="Ciudad" />
              </div>
              <div className="profile-field">
                <label className="profile-label">País</label>
                <input className="profile-input"
                  value={profile.country}
                  onChange={e => setP("country", e.target.value)}
                  placeholder="País" />
              </div>
            </div>

            <div className="profile-row">
              <div className="profile-field">
                <label className="profile-label">Teléfono</label>
                <input className="profile-input"
                  value={profile.phone}
                  onChange={e => setP("phone", e.target.value)}
                  placeholder="+54 9 11..." />
              </div>
              <div className="profile-field">
                <label className="profile-label">Empresa</label>
                <input className="profile-input"
                  value={profile.company}
                  onChange={e => setP("company", e.target.value)}
                  placeholder="Empresa u organización" />
              </div>
            </div>

            <div className="profile-field">
              <label className="profile-label">Rol / Título</label>
              <input className="profile-input"
                value={profile.role_title}
                onChange={e => setP("role_title", e.target.value)}
                placeholder="Ej: Founder, CTO, Product Manager…" />
            </div>

            <div className="profile-field">
              <label className="profile-label">Bio / Perfil</label>
              <textarea className="profile-input profile-textarea"
                rows={3}
                value={profile.profile}
                onChange={e => setP("profile", e.target.value)}
                placeholder="Contanos un poco sobre vos o tu proyecto…"
              />
            </div>

            <div className="profile-footer">
              <button type="submit" className="profile-save-btn"
                disabled={profileSaving || !profileDirty}>
                {profileSaving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </section>

        {/* ── Cambiar contraseña ──────────────────────────── */}
        <section className="profile-card">
          <h2 className="profile-section-title">Cambiar contraseña</h2>
          <form onSubmit={savePassword} className="profile-form">

            <div className="profile-field">
              <label className="profile-label">Contraseña actual</label>
              <input className="profile-input" type="password"
                value={pwd.current}
                onChange={e => setQ("current", e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••" />
            </div>

            <div className="profile-row">
              <div className="profile-field">
                <label className="profile-label">Nueva contraseña</label>
                <input className="profile-input" type="password"
                  value={pwd.next}
                  onChange={e => setQ("next", e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres" />
              </div>
              <div className="profile-field">
                <label className="profile-label">Confirmar contraseña</label>
                <input className="profile-input" type="password"
                  value={pwd.confirm}
                  onChange={e => setQ("confirm", e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repetir nueva contraseña" />
              </div>
            </div>

            {pwdError && (
              <p className="profile-error">{pwdError}</p>
            )}

            <div className="profile-footer">
              <button type="submit" className="profile-save-btn"
                disabled={pwdSaving || !pwd.current || !pwd.next || !pwd.confirm}>
                {pwdSaving ? "Actualizando…" : "Actualizar contraseña"}
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
