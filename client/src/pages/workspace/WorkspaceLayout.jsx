import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Sidebar from "../../components/workspace/Sidebar.jsx";
import { useToast } from "../../hooks/useToast.js";
import "./workspace.css";

function WorkspaceToast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="ws-toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <div key={t.id} className={`ws-toast${t.type ? ` ${t.type}` : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const { toasts, show } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className={`workspace${sidebarOpen ? " sidebar-open" : ""}`}>
      <div className="workspace-mobile-bar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={sidebarOpen}
        >
          <span className="sidebar-toggle-icon" />
        </button>
        <span className="sidebar-brand-word">OCHO</span>
      </div>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar user={user} />
      <main className="workspace-main">
        <Outlet context={{ user, show }} />
      </main>

      <WorkspaceToast toasts={toasts} />
    </div>
  );
}
