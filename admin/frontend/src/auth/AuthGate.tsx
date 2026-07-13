/**
 * AuthGate — 路由守卫，保护需登录的页面
 * 改编自参考工程 AuthGate.tsx
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { checkAuth, saveAuthReturnPath } from './auth';

export default function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let active = true;
    checkAuth().then((ok) => {
      if (active) {
        setAuthed(ok);
        setChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" description="正在验证登录状态..." />
      </div>
    );
  }

  if (!authed) {
    const returnTo = `${location.pathname}${location.search}`;
    saveAuthReturnPath(returnTo);
    return <Navigate to="/auth/login" replace state={{ from: returnTo }} />;
  }

  return <>{children}</>;
}
