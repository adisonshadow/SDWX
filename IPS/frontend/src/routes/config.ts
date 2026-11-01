/**
 * 路由元数据 + 菜单数据
 * appRouteMeta 声明全部路由的展示信息；AppLayout 用 findRouteMeta 决定 noContentPadding 等。
 * 菜单由 buildMenuData 从 appRouteMeta 派生（仿 EADAF）。
 */
import type { MenuDataItem } from '@ant-design/pro-components';

export interface AppRouteMeta {
  path: string;
  name?: string;
  icon?: string;
  hideInMenu?: boolean;
  /** 隐藏左侧菜单（整页） */
  hideMenu?: boolean;
  /** 主内容区无内边距（FixHeaderPage / 2 列） */
  noContentPadding?: boolean;
}

/**
 * 全量路由元数据。path 段对齐 docs/模块和导航.md 的 6 大板块。
 */
export const appRouteMeta: AppRouteMeta[] = [
  // ===== 工作台 =====
  { path: '/dashboard', name: '工作台', icon: 'DashboardOutlined' },

  // ===== 帮助（仅顶栏入口，不进侧栏）=====
  { path: '/help', name: '帮助', hideInMenu: true },

  // ===== 计划排产 =====
  { path: '/plan', name: '计划排产', icon: 'ScheduleOutlined' },
  { path: '/plan/orders', name: '令号投产', icon: 'DeploymentUnitOutlined' },
  { path: '/plan/orders/launch', name: '令号投产向导', hideInMenu: true, noContentPadding: true },
  { path: '/plan/orders/:id', name: '令号详情', hideInMenu: true },
  { path: '/plan/wbs', name: '单台计划(WBS)', icon: 'ApartmentOutlined', noContentPadding: true },
  { path: '/plan/floating', name: '游离工卡池' },

  // ===== 工位调度 =====
  { path: '/dispatch', name: '工位调度', icon: 'ToolOutlined' },
  { path: '/dispatch/workcards', name: '工卡作业', icon: 'ProfileOutlined' },
  { path: '/dispatch/workcards/:id', name: '工卡详情', hideInMenu: true },
  { path: '/dispatch/inspection-records', name: '检验记录', icon: 'AuditOutlined' },
  { path: '/dispatch/pipeline', name: '工位管道', noContentPadding: true },
  { path: '/dispatch/kit', name: '齐套管理' },
  { path: '/dispatch/non-routine', name: '非例行工卡' },
  { path: '/dispatch/non-routine/create', name: '创建非例行工卡', hideInMenu: true, noContentPadding: true },

  // ===== 排产引擎 =====
  { path: '/engine', name: '排产引擎', icon: 'ControlOutlined' },
  { path: '/engine/monitor', name: '引擎运行监控' },
  { path: '/engine/config', name: '排产规则配置' },

  // ===== 排产可视化 =====
  { path: '/viz', name: '排产可视化', icon: 'BarChartOutlined' },
  { path: '/viz/gantt', name: '令号甘特图' },
  { path: '/viz/load', name: '工位负荷图' },

  // ===== 统计分析 =====
  { path: '/analytics', name: '统计分析', icon: 'LineChartOutlined' },
  { path: '/analytics/report', name: '排产效能报告' },

  // ===== 工艺管理 =====
  { path: '/craft', name: '工艺管理', icon: 'ExperimentOutlined' },
  { path: '/craft/bom', name: 'BOM方案', icon: 'ApartmentOutlined' },
  { path: '/craft/bom/:id/edit', name: 'BOM结构编辑', hideInMenu: true, noContentPadding: true },
  { path: '/craft/operations', name: '标准工序库', icon: 'ProfileOutlined' },
  { path: '/craft/operations/:id', name: '工序详情', hideInMenu: true },
  {
    path: '/craft/operations/:operationId/steps/new',
    name: '新建工步',
    hideInMenu: true,
  },
  {
    path: '/craft/operations/:operationId/steps/:stepId',
    name: '编辑工步',
    hideInMenu: true,
  },
  { path: '/craft/bop', name: '维修方案', icon: 'DeploymentUnitOutlined' },
  { path: '/craft/bop/:id/edit', name: 'BOP结构编辑', hideInMenu: true, noContentPadding: true },
  { path: '/craft/troubleshoot', name: '排故临时搭路线', noContentPadding: true },
  { path: '/craft/versions', name: '版本与发布' },

  // ===== 高级产线业务 =====
  { path: '/line', name: '高级产线业务', icon: 'AppstoreOutlined' },
  { path: '/line/sorting-guide', name: '分拣可视化引导管理' },
  { path: '/line/call-types', name: '呼叫类型' },
  { path: '/line/call-logs', name: '呼叫流水' },
  { path: '/line/sorting-guide/:id', name: '编辑分拣示意图', hideInMenu: true },

  // ===== 基础配置 =====
  { path: '/master', name: '基础配置', icon: 'SettingOutlined' },
  { path: '/master/area-types', name: '区站分类' },
  { path: '/master/workstations', name: '工位配置' },
  { path: '/master/measurement-equipment', name: '测量设备', icon: 'ExperimentOutlined' },
];

/** 精确 / 动态 / 最长前缀匹配路由元数据 */
export function findRouteMeta(pathname: string): AppRouteMeta | undefined {
  // 1. 精确
  let meta = appRouteMeta.find((m) => m.path === pathname);
  if (meta) return meta;

  // 2. 动态 :param
  const dynamic = appRouteMeta.filter((m) => m.path.includes(':'));
  for (const m of dynamic) {
    const pattern = m.path;
    const segsP = pattern.split('/').filter(Boolean);
    const segsX = pathname.split('/').filter(Boolean);
    if (segsP.length === segsX.length && segsP.every((s, i) => s.startsWith(':') || s === segsX[i])) {
      return m;
    }
  }

  // 3. 最长静态前缀
  const statics = appRouteMeta
    .filter((m) => !m.path.includes(':'))
    .sort((a, b) => b.path.length - a.path.length);
  meta = statics.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
  return meta;
}

/** 单层 path 段数（不含动态） */
function depth(path: string): number {
  return path.split('/').filter((s) => s && !s.startsWith(':')).length;
}

/**
 * 从 appRouteMeta 构建菜单树（两级：板块 > 功能页）。
 * hideInMenu / 无 name 的不进菜单；动态路由不进菜单。
 */
export function buildMenuData(): MenuDataItem[] {
  const visible = appRouteMeta.filter((m) => m.name && !m.hideInMenu && !m.path.includes(':'));
  const roots = visible.filter((m) => depth(m.path) === 1);
  return roots.map((root) => {
    const children = visible.filter(
      (m) => m !== root && m.path.startsWith(`${root.path}/`) && depth(m.path) === 2,
    );
    return {
      path: root.path,
      name: root.name,
      icon: root.icon,
      children: children.length
        ? children.map((c) => ({ path: c.path, name: c.name, icon: c.icon }))
        : undefined,
    };
  });
}
