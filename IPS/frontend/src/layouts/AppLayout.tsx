/**
 * 应用主布局（ProLayout）
 *
 * - 左侧菜单：来自 buildMenuData()（6 大板块）
 * - 路由出口：仅通过 AnimatedOutlet 渲染子页 [规范 §4.1]
 * - routeMeta 驱动 noContentPadding（FixHeaderPage / 2 列页面去内边距）
 * - 顶部右侧：帮助入口 + 用户名
 */
import { ProLayout } from '@ant-design/pro-components';
import type { MenuDataItem } from '@ant-design/pro-components';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Space, Tooltip, Typography } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Suspense } from 'react';
import AnimatedOutlet from '@/components/AnimatedOutlet';
import { buildMenuData, findRouteMeta } from '@/routes/config';
import { resolveMenuIcon } from '@/constants/menu';
import { useUserStore } from '@/store/useUserStore';
import { clearAuth } from '@/auth/auth';
import defaultSettings from '../../config/defaultSettings';

const { Text } = Typography;

/** 递归把 icon 字符串映射为组件 */
function decorateIcons(items: MenuDataItem[]): MenuDataItem[] {
  return items.map((item) => ({
    ...item,
    icon: resolveMenuIcon(item.icon as string | undefined) ?? item.icon,
    children: item.children?.length ? decorateIcons(item.children) : undefined,
  }));
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const routeMeta = findRouteMeta(location.pathname);
  const menuData = decorateIcons(buildMenuData());

  const handleLogout = () => {
    clearAuth();
    navigate('/auth/login', { replace: true });
  };

  return (
    <ProLayout
      {...defaultSettings}
      location={{ pathname: location.pathname }}
      logo={defaultSettings.logo}
      title={defaultSettings.title}
      menuDataRender={() => menuData}
      menuItemRender={(item, dom) => (item.path ? <Link to={item.path}>{dom}</Link> : dom)}
      contentStyle={
        routeMeta?.noContentPadding ? { padding: 0 } : undefined
      }
      actionsRender={() => [
        <Tooltip key="help" title="帮助">
          <QuestionCircleOutlined
            style={{ fontSize: 18, cursor: 'pointer' }}
            onClick={() => navigate('/help')}
          />
        </Tooltip>,
      ]}
      avatarProps={{
        render: () => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <Space size={8} style={{ cursor: 'pointer' }}>
              <Avatar size="small" style={{ backgroundColor: '#0476e7' }}>
                {(user?.name || user?.username || 'U').slice(0, 1)}
              </Avatar>
              <Text>{user?.name || user?.username || '用户'}</Text>
            </Space>
          </Dropdown>
        ),
      }}
    >
      <Suspense fallback={null}>
        <AnimatedOutlet />
      </Suspense>
    </ProLayout>
  );
}
