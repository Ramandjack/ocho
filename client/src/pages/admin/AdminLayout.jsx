import { NavLink, Link, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { AdminDataProvider, useAdminData } from "../../context/AdminDataContext.jsx";
import "./admin-console.css";

const NAV = [
  { to: "/admin",           label: "Dashboard",  end: true },
  { to: "/admin/users",     label: "Usuarios" },
  { to: "/admin/projects",  label: "Proyectos" },
  { to: "/admin/tasks",     label: "Tareas" },
  { to: "/admin/modules",   label: "Módulos" },
  { to: "/admin/leads",     label: "Leads" },
  { to: "/admin/content",   label: "Contenidos" },
  { to: "/admin/security",  label: "Seguridad" },
];

function AdminSkeleton() {
  return (
    <div className="admin-skeleton">
      <div className="admin-skeleton-topbar skeleton-shimmer" />
      <div className="admin-skeleton-cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="admin-skeleton-card skeleton-shimmer" />
        ))}
      </div>
      <div className="admin-skeleton-table skeleton-shimmer" />
    </div>
  );
}

function AdminMain() {
  const { ready, loadError, refresh } = useAdminData();

  if (!ready) return <AdminSkeleton />;

  if (loadError) {
    return (
      <div style={{
        padding: "3rem 2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        maxWidth: 560,
      }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--admin-danger, #f87171)" }}>
          Error al conectar con NocoDB
        </h2>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--admin-muted, rgba(255,255,255,.5))", lineHeight: 1.6 }}>
          {loadError}
        </p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--admin-muted, rgba(255,255,255,.5))", lineHeight: 1.6 }}>
          Verificá las variables de entorno en Render: <code>NOCODB_TOKEN</code>, <code>NOCODB_BASE</code> y los <code>NOCODB_*_TABLE</code>.
          También podés revisar <code>/api/health</code> para ver el estado de configuración.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className="admin-btn primary"
            onClick={() => refresh()}
          >
            Reintentar
          </button>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn"
          >
            Ver /api/health
          </a>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.1)", margin: "0.5rem 0" }} />
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--admin-muted, rgba(255,255,255,.4))" }}>
          Datos parciales pueden seguir disponibles. Podés navegar entre secciones.
        </p>
        <Outlet />
      </div>
    );
  }

  return <Outlet />;
}

export default function AdminLayout() {
  const { user } = useAuth();

  // Guard de seguridad: rechaza cualquier sesión que no sea admin explícitamente
  if (!user || String(user.role || "").toLowerCase() !== "admin") {
    return <Navigate to="/panel" replace />;
  }

  const adminName = user?.full_name || `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Admin";

  return (
    <div className="admin-body protected-page">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-word">OCHO</span>
            <span className="admin-role-badge">Admin</span>
          </div>

          <nav className="admin-nav">
            <div className="admin-nav-group">
              <span className="admin-nav-label">Gestión</span>
              {NAV.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => isActive ? "active" : ""}
                >
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="admin-nav-group">
              <span className="admin-nav-label">Acciones</span>
              <Link to="/panel">← Panel cliente</Link>
              <Link to="/logout">Cerrar sesión</Link>
            </div>
          </nav>

          <div className="admin-user-box">
            <strong>{adminName}</strong>
            <span>{user?.email}</span>
            <span>Rol: {user?.role}</span>
          </div>
        </aside>

        <main className="admin-main">
          <AdminDataProvider>
            <AdminMain />
          </AdminDataProvider>
        </main>
      </div>
    </div>
  );
}
