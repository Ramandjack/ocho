import { Link } from "react-router-dom";
import { interestLabel, segmentLabel } from "../lib/labels.js";
import "./panelExtras.css";

function displayName(user) {
  return user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Miembro";
}

export default function PanelPage({ user }) {
  const name = displayName(user);
  const firstName = user.first_name || name.split(" ")[0];
  const role = String(user.role || "member").toLowerCase();

  return (
    <div className="protected-page">
      <header className="site-header" id="top">
        <div className="container header-inner">
          <a className="brand" href="/" aria-label="OCHO inicio">
            <span className="brand-word">OCHO</span>
          </a>

          <nav className="site-nav static-nav" aria-label="Navegación privada">
            <Link to="/panel">Panel</Link>
            <a href="#resources">Recursos</a>
            <a href="#library">Biblioteca</a>
            <a href="#profile">Perfil</a>
            {role === "admin" && (
              <Link to="/admin">Admin</Link>
            )}
            <Link to="/logout" id="logoutBtn">
              Salir
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <div id="projects" style={{ scrollMarginTop: "80px" }} aria-hidden />
        <div id="tasks" style={{ scrollMarginTop: "80px" }} aria-hidden />

        <section className="section-first">
          <div className="container">
            <section className="dashboard-hero panel panel-fade-in" aria-labelledby="panel-title">
              <p className="eyebrow">Member Area</p>
              <h1 id="panel-title">Bienvenido al ecosistema privado de OCHO.</h1>
              <p className="section-text large-text">
                Un espacio para acceder a contenido curado, recursos estratégicos, piezas editoriales y futuras herramientas del
                sistema.
              </p>

              <div className="hero-tags">
                <span>Contenido</span>
                <span>Recursos exclusivos</span>
                <span>Editorial</span>
                <span>CRM Community</span>
              </div>

              <div className="cards-grid cards-3 dashboard-grid">
                <article className="panel panel-fade-in">
                  <span className="card-index">01 / Sesión</span>
                  <h3>Tu acceso está activo</h3>
                  <p>Has ingresado correctamente al área privada de OCHO.</p>
                </article>

                <article className="panel panel-fade-in">
                  <span className="card-index">02 / Usuario</span>
                  <h3>{name}</h3>
                  <p>{user.email}</p>
                  <p className="section-text" style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
                    <span className={`member-badge ${role === "admin" ? "admin" : ""}`} id="panelRoleBadge">
                      {role === "admin" ? "Admin" : "Miembro"}
                    </span>{" "}
                    <span id="panelSegment">{segmentLabel(user.segment)}</span> ·{" "}
                    <span id="panelInterest">{interestLabel(user.interest)}</span>
                  </p>
                </article>

                <article className="panel panel-fade-in">
                  <span className="card-index">03 / Próximo paso</span>
                  <h3>Base CRM en evolución</h3>
                  <p>Este panel será la base para gestionar recursos, comunidad y futuras automatizaciones.</p>
                </article>
              </div>

              {role === "admin" && (
                <article className="panel panel-fade-in" style={{ marginTop: "1.5rem" }} id="adminAccessCard">
                  <span className="card-index">Admin</span>
                  <h3>Consola de administración</h3>
                  <p className="section-text">Gestioná usuarios, leads y métricas del sistema.</p>
                  <Link className="btn btn-solid" to="/admin" style={{ marginTop: "1rem", display: "inline-block" }}>
                    Abrir admin
                  </Link>
                </article>
              )}
            </section>
          </div>
        </section>

        <section className="section" id="resources">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Recursos</p>
              <h2>Contenido con criterio para miembros de la comunidad.</h2>
              <p className="section-text">
                Este bloque puede crecer luego con newsletters privadas, descargas y materiales de formación.
              </p>
            </div>

            <div className="cards-grid cards-3">
              <article className="panel service-card panel-fade-in">
                <span className="card-index">Newsletter</span>
                <h3>Ideas y dirección</h3>
                <p>
                  Reflexiones, estrategia y lecturas seleccionadas para quienes construyen productos y negocios digitales.
                </p>
              </article>
              <article className="panel service-card panel-fade-in">
                <span className="card-index">Editorial</span>
                <h3>Fotografía, revistas y libros</h3>
                <p>Un espacio para piezas visuales y contenido editorial curado con la mirada de OCHO.</p>
              </article>
              <article className="panel service-card panel-fade-in">
                <span className="card-index">Toolkit</span>
                <h3>Plantillas y recursos</h3>
                <p>Frameworks, materiales descargables y activos listos para usar en branding, producto y crecimiento.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="library">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Biblioteca</p>
              <h2>Una base privada para lo que vale la pena guardar.</h2>
              <p className="section-text">
                Aquí luego podrás conectar documentos, PDFs, galerías, newsletters históricas y colecciones curatoriales.
              </p>
            </div>

            <div className="cards-grid cards-4">
              <article className="panel step-card panel-fade-in">
                <span className="step-number">01</span>
                <h3>Libros</h3>
                <p>Selecciones comentadas, recomendaciones y fichas de lectura.</p>
              </article>
              <article className="panel step-card panel-fade-in">
                <span className="step-number">02</span>
                <h3>Revistas</h3>
                <p>Piezas editoriales y referencias culturales para enriquecer criterio.</p>
              </article>
              <article className="panel step-card panel-fade-in">
                <span className="step-number">03</span>
                <h3>Fotografías</h3>
                <p>Galerías privadas y colecciones visuales curadas para la comunidad.</p>
              </article>
              <article className="panel step-card panel-fade-in">
                <span className="step-number">04</span>
                <h3>Archivos</h3>
                <p>Descargables, documentos y recursos premium vinculados a OCHO.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="profile">
          <div className="container contact-grid">
            <div>
              <p className="eyebrow">Perfil</p>
              <h2>Hola, {firstName}.</h2>
              <p className="section-text large-text">
                Tu registro es parte de una comunidad con dirección. En esta siguiente etapa podrás actualizar tu perfil, tus
                intereses y el tipo de contenido que quieres recibir.
              </p>

              <div className="panel note-card panel-fade-in">
                <h3>CRM con intención</h3>
                <p>
                  La idea no es acumular datos. Es entender mejor a cada miembro para ofrecer contenido, experiencias y
                  herramientas más relevantes.
                </p>
              </div>

              <div className="panel panel-fade-in" style={{ marginTop: "1rem" }}>
                <p className="eyebrow">Datos de cuenta</p>
                <p className="section-text" style={{ marginTop: "0.5rem" }}>
                  Ciudad: <strong>{user.city || "—"}</strong> · País: <strong>{user.country || "—"}</strong>
                </p>
                <p className="section-text">
                  Empresa: <strong>{user.company || "—"}</strong> · Fuente: <strong>{user.source || "register_form"}</strong>
                </p>
                <div id="consentStatus" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
                  <div className={`consent-line ${user.newsletter_consent ? "ok" : "no"}`}>
                    {user.newsletter_consent ? "✓" : "✗"} Newsletter activado
                  </div>
                  <div className={`consent-line ${user.data_consent ? "ok" : "no"}`}>
                    {user.data_consent ? "✓" : "✗"} Datos de CRM autorizados
                  </div>
                </div>
              </div>
            </div>

            <div className="panel form-panel panel-fade-in">
              <p className="eyebrow">Estado de cuenta</p>
              <h3>Resumen actual</h3>

              <div className="contact-form">
                <label>
                  <span>Nombre completo</span>
                  <input type="text" value={name} readOnly disabled />
                </label>
                <label>
                  <span>Email</span>
                  <input type="email" value={user.email || ""} readOnly disabled />
                </label>
                <label>
                  <span>Teléfono</span>
                  <input type="text" value={user.phone || ""} readOnly disabled />
                </label>
                <label>
                  <span>Estado</span>
                  <input type="text" value="Activo" readOnly disabled />
                </label>
                <label>
                  <span>Acceso</span>
                  <input type="text" value="Miembro autenticado" readOnly disabled />
                </label>

                <Link to="/logout" className="btn btn-ghost btn-full" id="logoutBtnSecondary">
                  Cerrar sesión
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-shell">
          <div className="footer-top">
            <div className="footer-brand">
              <p className="footer-title">OCHO</p>
              <p className="footer-tagline">Claridad, sistema y dirección para construir activos digitales reales.</p>
            </div>
            <div className="footer-side">
              <a href="mailto:contacto@ocho.com.ar" className="footer-link">
                contacto@ocho.com.ar
              </a>
              <p className="footer-manifesto">Menos ruido. Más dirección.</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 OCHO — Private Member Area</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
