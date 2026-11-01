/**
 * LoginPage — SSO 登录入口
 * 点击跳转到 EADAF 登录页
 */
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, Typography, Space } from 'antd';
import { buildSsoLoginUrl, saveAuthReturnPath } from './auth';

const { Title } = Typography;

export default function LoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnTo =
    (location.state as { from?: string } | null)?.from || searchParams.get('from') || '';

  const handleLogin = () => {
    if (returnTo) saveAuthReturnPath(returnTo);
    window.location.href = buildSsoLoginUrl();
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0958d9',
        backgroundImage:
          'url(/images/waves-animation_dark2.svg), linear-gradient(135deg, rgb(0 132 216) 0%, rgb(62 40 128) 100%)',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundPosition: 'bottom center, center',
        backgroundSize: '100% auto, cover',
      }}
    >
      <Card style={{ width: 520, textAlign: 'center', padding: '40px', backgroundImage: 'linear-gradient(135deg, rgb(197 220 239) 0%, rgb(182 195 231) 100%)' }} variant="borderless">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <img
              src="/images/sdlogo.svg"
              alt="SD Logo"
              style={{ display: 'block', width: 180, maxWidth: '100%', margin: '0 auto 16px' }}
            />
            <Title level={2} style={{ marginBottom: 14 }}>
              柔性维修智能排产系统
            </Title>
            <Title level={4} type="secondary" style={{ marginBottom: 14 }}>Intelligent Production Scheduling</Title>
          </div>
          {/* <Text type="secondary">请登录</Text> */}
          <Button type="primary" size="large" block onClick={handleLogin}>
            登 录
          </Button>
        </Space>
      </Card>
    </div>
  );
}
