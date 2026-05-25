import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute       from "./components/ProtectedRoute.jsx";

// Auth
import LoginPage            from "./pages/LoginPage.jsx";
import RegisterPage         from "./pages/RegisterPage.jsx";
import LogoutPage           from "./pages/LogoutPage.jsx";

// Workspace (user panel)
import WorkspaceLayout      from "./pages/workspace/WorkspaceLayout.jsx";
import DashboardView        from "./pages/workspace/DashboardView.jsx";
import ProjectsView         from "./pages/workspace/ProjectsView.jsx";
import TasksView            from "./pages/workspace/TasksView.jsx";
import WorkspaceView        from "./pages/workspace/WorkspaceView.jsx";
import ActivityView         from "./pages/workspace/ActivityView.jsx";
import ResourcesView        from "./pages/workspace/ResourcesView.jsx";
import AIView               from "./pages/workspace/AIView.jsx";
import WorkspaceFocusView   from "./pages/workspace/WorkspaceFocusView.jsx";

// Admin
import AdminLayout          from "./pages/admin/AdminLayout.jsx";
import AdminDashboard       from "./pages/admin/AdminDashboard.jsx";
import AdminUsers           from "./pages/admin/AdminUsers.jsx";
import AdminLeads           from "./pages/admin/AdminLeads.jsx";
import AdminProjects        from "./pages/admin/AdminProjects.jsx";
import AdminTasks           from "./pages/admin/AdminTasks.jsx";
import AdminModules         from "./pages/admin/AdminModules.jsx";
import AdminSecurity        from "./pages/admin/AdminSecurity.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="login"    element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="logout"   element={<LogoutPage />} />

      {/* User workspace */}
      <Route path="panel" element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
        <Route index                 element={<DashboardView />} />
        <Route path="projects"       element={<ProjectsView />} />
        <Route path="projects/:id"   element={<WorkspaceView />} />
        <Route path="tasks"          element={<TasksView />} />
        <Route path="activity"       element={<ActivityView />} />
        <Route path="resources"      element={<ResourcesView />} />
        <Route path="ai"             element={<AIView />} />
        <Route path="workspace"      element={<WorkspaceFocusView />} />
      </Route>

      {/* Admin console */}
      <Route path="admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
        <Route index              element={<AdminDashboard />} />
        <Route path="users"       element={<AdminUsers />} />
        <Route path="projects"    element={<AdminProjects />} />
        <Route path="tasks"       element={<AdminTasks />} />
        <Route path="modules"     element={<AdminModules />} />
        <Route path="leads"       element={<AdminLeads />} />
        <Route path="security"    element={<AdminSecurity />} />
      </Route>

      <Route path="/"  element={<Navigate to="login" replace />} />
      <Route path="*"  element={<Navigate to="login" replace />} />
    </Routes>
  );
}
