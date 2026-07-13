/**
 * AuthCallback — SSO 回调处理
 * 支持 token / access_token / accessToken 多键名 (与参考工程一致)
 * 兼容 Electron webview 与纯浏览器环境
 */
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, message } from 'antd';
import { saveAuth, consumeAuthReturnPath } from './auth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const token =
      searchParams.get('token') ||
      searchParams.get('access_token') ||
      searchParams.get('accessToken');
    const refreshToken = searchParams.get('refresh_token') || undefined;
    const userInfoRaw = searchParams.get('user_info') || undefined;
    const userInfo = userInfoRaw ? safeParse(userInfoRaw) : undefined;
    const returnTo =
      (location.state as { from?: string } | null)?.from ?? consumeAuthReturnPath('/OPWeb');

    if (token) {
      saveAuth(token, refreshToken, userInfo);
      messageApi.success('登录成功');
      navigate(returnTo, { replace: true });
      return;
    }
    messageApi.error('SSO 回调缺少 token');
    navigate('/auth/login', { replace: true });
  }, [location.state, messageApi, navigate, searchParams]);

  return (
    <>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" description="正在完成 SSO 登录..." />
      </div>
    </>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
