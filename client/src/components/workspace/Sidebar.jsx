import { NavLink, Link } from "react-router-dom";

const NAV_PRIMARY = [
  { to: "/panel",          label: "Inicio",    end: true },
  { to: "/panel/projects", label: "Proyectos" },
  { to: "/panel/tasks",    label: "Tareas" },
  { to: "/panel/activity", label: "Actividad" },
];

const NAV_SECONDARY = [
  { to: "/panel/resources",  label: "Recursos" },
  { to: "/panel/workspace",  label: "Workspace" },
  { to: "/panel/ai",         label: "IA" },
];

export default function Sidebar({ user }) {
  const name = user?.full_name || user?.first_name || "Usuario";
  const role = String(user?.role || "").toLowerCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-word">OCHO</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_PRIMARY.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            {label}
          </NavLink>
        ))}

        <div className="sidebar-nav-divider" />

        {NAV_SECONDARY.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="sidebar-user-name">{name}</span>
          <span className="sidebar-user-role">{role === "admin" ? "Admin" : "Miembro"}</span>
        </div>

        {role === "admin" && (
          <Link to="/admin" className="sidebar-link dim">
            Consola admin
          </Link>
        )}
        <Link to="/logout" className="sidebar-link dim">
          Salir
        </Link>
      </div>
    </aside>
  );
}
