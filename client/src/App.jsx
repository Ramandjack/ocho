import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage      from "./pages/LoginPage.jsx";
import RegisterPage   from "./pages/RegisterPage.jsx";
import LogoutPage     from "./pages/LogoutPage.jsx";
import AdminPage      from "./pages/admin/AdminPage.jsx";
import WorkspaceLayout from "./pages/workspace/WorkspaceLayout.jsx";
import DashboardView  from "./pages/workspace/DashboardView.jsx";
import ProjectsView   from "./pages/workspace/ProjectsView.jsx";
import TasksView      from "./pages/workspace/TasksView.jsx";
import WorkspaceView  from "./pages/workspace/WorkspaceView.jsx";
import ActivityView   from "./pages/workspace/ActivityView.jsx";
import ResourcesView  from "./pages/workspace/ResourcesView.jsx";
import AIView             from "./pages/workspace/AIView.jsx";
import WorkspaceFocusView from "./pages/workspace/WorkspaceFocusView.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="login"    element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="logout"   element={<LogoutPage />} />

      <Route
        path="panel"
        element={
          <ProtectedRoute>
            <WorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route index                   element={<DashboardView />} />
        <Route path="projects"         element={<ProjectsView />} />
        <Route path="projects/:id"     element={<WorkspaceView />} />
        <Route path="tasks"            element={<TasksView />} />
        <Route path="activity"         element={<ActivityView />} />
        <Route path="resources"        element={<ResourcesView />} />
        <Route path="ai"               element={<AIView />} />
        <Route path="workspace"        element={<WorkspaceFocusView />} />
      </Route>

      <Route
        path="admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route path="/"  element={<Navigate to="login" replace />} />
      <Route path="*"  element={<Navigate to="login" replace />} />
    </Routes>
  );
}
