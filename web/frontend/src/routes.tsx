import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './auth/LoginPage';
import AuthCallback from './auth/AuthCallback';
import AuthGate from './auth/AuthGate';
import OPShell from './layout/OPShell';

export function AppRoutes() {
  return (
    <Routes>
      {/* SSO 认证路由 */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* 工位作业 — 受 AuthGate 保护（副屏独立路由，避免登录回跳丢失 screen 参数） */}
      <Route
        path="/OPWeb/secondary"
        element={
          <AuthGate>
            <OPShell />
          </AuthGate>
        }
      />
      <Route
        path="/OPWeb"
        element={
          <AuthGate>
            <OPShell />
          </AuthGate>
        }
      />

      {/* 默认跳转 */}
      <Route path="/" element={<Navigate to="/OPWeb" replace />} />
      <Route path="*" element={<Navigate to="/OPWeb" replace />} />
    </Routes>
  );
}
