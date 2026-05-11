export default function AuthLayout({
  eyebrow,
  title,
  subtitle,
  brandEyebrow,
  brandTitle,
  brandQuote,
  benefits,
  children,
  backSiteHref = "/",
}) {
  return (
    <main className="auth-layout">
      <section className="auth-shell">
        <div className="auth-brand">
          <div className="auth-brand-inner">
            <p className="auth-eyebrow">{brandEyebrow}</p>
            <h1>{brandTitle}</h1>
            <p className="auth-quote">{brandQuote}</p>
            <ul className="auth-benefits">
              {benefits.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="auth-form-panel panel">
          <a className="auth-back" href={backSiteHref}>
            ← Volver
          </a>

          <div className="auth-head">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p className="section-text">{subtitle}</p>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
