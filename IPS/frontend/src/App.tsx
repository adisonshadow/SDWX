import { ConfigProvider, App as AntdApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import { ProConfigProvider } from '@ant-design/pro-components';
import { AppRoutes } from './routes';
import StaticApiSetter from '@/components/StaticApiSetter';

const IPS_COLOR_PRIMARY = '#0476e7';

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: IPS_COLOR_PRIMARY,
          borderRadius: 8,
        },
      }}
    >
      <ProConfigProvider token={{ colorPrimary: IPS_COLOR_PRIMARY }}>
        <AntdApp>
          <StaticApiSetter />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AntdApp>
      </ProConfigProvider>
    </ConfigProvider>
  );
}
