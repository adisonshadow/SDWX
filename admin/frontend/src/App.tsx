import { ConfigProvider, App as AntdApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import './styles/op-theme.css';

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#6a9fd5',
          colorBgBase: '#0d1117',
          colorTextBase: '#e2e8f0',
          fontSize: 20,
          borderRadius: 10,
          controlHeight: 48,
          controlHeightLG: 56,
        },
        components: {
          Button: {
            controlHeight: 48,
            controlHeightLG: 56,
            paddingInline: 20,
          },
          Input: {
            controlHeight: 48,
          },
          Modal: {
            controlHeight: 48,
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
