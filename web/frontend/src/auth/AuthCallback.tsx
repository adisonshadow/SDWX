/**
 * 授权回调落在 BFF。若浏览器仍打开本页，只确认会话是否已经建立。
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { consumeAuthReturnPath, fetchSession } from './auth';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    fetchSession().then((status) => {
      if (status === 'authenticated') {
        navigate(consumeAuthReturnPath('/OPWeb'), { replace: true });
        return;
      }
      navigate('/auth/login', { replace: true });
    });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin size="large" description="正在完成登录..." />
    </div>
  );
}
