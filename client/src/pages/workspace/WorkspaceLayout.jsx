import { Outlet } from "react-router-dom";
import Sidebar from "../../components/workspace/Sidebar.jsx";
import "./workspace.css";

export default function WorkspaceLayout({ user }) {
  return (
    <div className="workspace">
      <Sidebar user={user} />
      <main className="workspace-main">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
