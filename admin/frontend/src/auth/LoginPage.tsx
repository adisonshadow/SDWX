/**
 * LoginPage — SSO 登录入口
 * 点击跳转到 EADAF 登录页
 */
import { useLocation } from 'react-router-dom';
import { Button, Card, Typography, Space } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { buildSsoLoginUrl, saveAuthReturnPath } from './auth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const location = useLocation();

  const handleLogin = () => {
    const returnTo = (location.state as { from?: string } | null)?.from;
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
          'url(/images/waves-animation_dark2.svg), linear-gradient(135deg, #1677ff 0%,rgb(36, 64, 139) 100%)',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundPosition: 'bottom center, center',
        backgroundSize: '100% auto, cover',
      }}
    >
      <Card style={{ width: 520, textAlign: 'center', padding: '40px', backgroundImage: 'linear-gradient(135deg,rgb(12, 45, 93) 0%,rgb(20, 46, 115) 100%)' }} variant="borderless">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <img
              src="/images/sdlogo.svg"
              alt="SD Logo"
              style={{ display: 'block', width: 180, maxWidth: '100%', margin: '0 auto 16px' }}
            />
            <Title level={3} style={{ marginBottom: 14 }}>
              故检修理产线管理系统
            </Title>
            <Text type="secondary" style={{ marginBottom: 14 }}>Fault maintenance production line</Text>
          </div>
          {/* <Text type="secondary">请登录</Text> */}
          <Button type="primary" size="large" icon={<LoginOutlined />} block onClick={handleLogin}>
            登 录
          </Button>
        </Space>
      </Card>
    </div>
  );
}
