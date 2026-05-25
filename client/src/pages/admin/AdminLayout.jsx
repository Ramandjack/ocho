import { NavLink, Link, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import "./admin-console.css";

const NAV = [
  { to: "/admin",           label: "Dashboard",  end: true },
  { to: "/admin/users",     label: "Usuarios" },
  { to: "/admin/projects",  label: "Proyectos" },
  { to: "/admin/tasks",     label: "Tareas" },
  { to: "/admin/modules",   label: "Módulos" },
  { to: "/admin/leads",     label: "Leads" },
  { to: "/admin/security",  label: "Seguridad" },
];

export default function AdminLayout() {
  const { user } = useAuth();
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
