import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Sidebar from "../../components/workspace/Sidebar.jsx";
import "./workspace.css";

export default function WorkspaceLayout() {
  const { user } = useAuth();
  return (
    <div className="workspace">
      <Sidebar user={user} />
      <main className="workspace-main">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
