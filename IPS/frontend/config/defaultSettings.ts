import type { ProLayoutProps } from '@ant-design/pro-components';

/**
 * ProLayout 默认配置
 * 顶部 header 高度 56px（antd v6 默认），FixHeaderPage/Splitter 据此 calc(100vh - 56px)。
 */
const Settings: ProLayoutProps & {
  pwa?: boolean;
  logo?: string;
} = {
  navTheme: 'light', // 亮色
  title: 'IPS', // 系统名称
  logo: '/images/sdlogo.svg', // public 下 logo
  colorPrimary: '#0476e7', // 拂晓蓝（与 ConfigProvider 统一）
  siderWidth: 208, // 侧边菜单宽度
  pure: false,
  layout: 'top', // 左侧导航（排产系统多用 side）
  contentWidth: 'Fluid',
  fixedHeader: true,
  fixSiderbar: true,
  colorWeak: false,
  pwa: false,
  iconfontUrl: '',
  token: {},
  menu: {
    locale: false,
  },
};

export default Settings;
