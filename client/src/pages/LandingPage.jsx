import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="auth-body" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ letterSpacing: "0.2em", fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>OCHO COMMUNITY</p>
        <h1 style={{ fontSize: "clamp(2rem, 6vw, 4rem)", fontWeight: 800, lineHeight: 1.1, marginBottom: "1rem" }}>
          Accede a ideas, criterio<br />y contenido con dirección.
        </h1>
        <p style={{ opacity: 0.6, maxWidth: "480px", margin: "0 auto 2rem" }}>
          Newsletter, fotografías, revistas, libros y piezas seleccionadas para una comunidad que valora claridad, sistema y visión.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/login" className="btn btn-solid">Ingresar</Link>
          <Link to="/register" className="btn">Unirse a la comunidad</Link>
        </div>
      </div>
    </div>
  );
}
