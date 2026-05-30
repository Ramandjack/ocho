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
  const { ready } = useAdminData();
  return ready ? <Outlet /> : <AdminSkeleton />;
}

export default function AdminLayout() {
  const { user } = useAuth();

  // Guard de seguridad: rechaza cualquier sesión que no sea admin explícitamente
  if (!user || String(user.role || "").toLowerCase() !== "admin") {
    return <Navigate to="/app" replace />;
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
              <Link to="/app">← Panel cliente</Link>
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
