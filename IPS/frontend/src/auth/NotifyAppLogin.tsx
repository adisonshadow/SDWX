/**
 * 通知程序登录成功页。
 * 浏览器里完成 SSO 后，点「打开通知APP」把令牌交给本机托盘程序。
 */
import { Button, Card, Space, Typography } from 'antd';
import { buildSsoLoginUrl, clearAuth, getToken, getUserInfo, saveAuthReturnPath } from './auth';

const { Title, Paragraph, Text } = Typography;

function accountLabel(): string {
  const info = getUserInfo<Record<string, unknown>>();
  if (!info || typeof info !== 'object') return '';
  for (const key of ['name', 'username', 'user_name']) {
    const value = info[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const pageStyle = {
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
} as const;

export default function NotifyAppLogin() {
  const token = getToken();
  const name = accountLabel();

  const startLogin = () => {
    saveAuthReturnPath('/auth/notify-app');
    window.location.href = buildSsoLoginUrl();
  };

  const openApp = () => {
    if (!token) return;
    const url = `notify-receiver://login?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
    window.location.href = url;
  };

  const switchAccount = () => {
    clearAuth();
    startLogin();
  };

  return (
    <div style={pageStyle}>
      <Card
        style={{
          width: 520,
          textAlign: 'center',
          padding: '40px',
          backgroundImage: 'linear-gradient(135deg, rgb(197 220 239) 0%, rgb(182 195 231) 100%)',
        }}
        variant="borderless"
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <img
              src="/images/sdlogo.svg"
              alt="SD Logo"
              style={{ display: 'block', width: 180, maxWidth: '100%', margin: '0 auto 16px' }}
            />
            <Title level={2} style={{ marginBottom: 8 }}>
              {token ? '登录成功' : '通知程序登录'}
            </Title>
            {token ? (
              <Paragraph style={{ marginBottom: 0 }}>
                {name ? <Text>当前账号：{name}</Text> : <Text>登录已完成</Text>}
              </Paragraph>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                登录后点「打开通知APP」，把身份交给本机托盘程序。
              </Paragraph>
            )}
          </div>
          {token ? (
            <>
              <Button type="primary" size="large" block onClick={openApp}>
                打开通知APP
              </Button>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                浏览器如果询问是否打开异常呼叫，请允许。程序会留在系统托盘里。
              </Paragraph>
              <Button type="link" onClick={switchAccount}>
                换个账号登录
              </Button>
            </>
          ) : (
            <Button type="primary" size="large" block onClick={startLogin}>
              登 录
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
}
