/**
 * 菜单图标映射：把 appRouteMeta 中的 icon 字符串映射为 antd 图标组件。
 */
import React from 'react';
import {
  DashboardOutlined,
  ScheduleOutlined,
  DeploymentUnitOutlined,
  ApartmentOutlined,
  ToolOutlined,
  ProfileOutlined,
  ControlOutlined,
  BarChartOutlined,
  LineChartOutlined,
  SettingOutlined,
  ExperimentOutlined,
  AuditOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  ScheduleOutlined: <ScheduleOutlined />,
  DeploymentUnitOutlined: <DeploymentUnitOutlined />,
  ApartmentOutlined: <ApartmentOutlined />,
  ToolOutlined: <ToolOutlined />,
  ProfileOutlined: <ProfileOutlined />,
  ControlOutlined: <ControlOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  LineChartOutlined: <LineChartOutlined />,
  SettingOutlined: <SettingOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  AuditOutlined: <AuditOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
};

/** 取图标组件；未注册返回 undefined（ProLayout 会留空） */
export function resolveMenuIcon(iconName?: string): React.ReactNode | undefined {
  if (!iconName) return undefined;
  return ICON_MAP[iconName];
}
