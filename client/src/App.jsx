import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import LogoutPage from "./pages/LogoutPage.jsx";
import PanelPage from "./pages/PanelPage.jsx";
import AdminPage from "./pages/admin/AdminPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="logout" element={<LogoutPage />} />
      <Route
        path="panel"
        element={
          <ProtectedRoute>
            <PanelPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="login" replace />} />
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
