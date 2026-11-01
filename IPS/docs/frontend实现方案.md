# IPS Frontend 功能页面实现方案

> 制定日期：2026-07-23
> 基础：上一轮已完成的 backend（`/api/ips/**` 通用 CRUD 代理 + 业务编排端点）、`@ips/shared` 类型常量、`docs/模块和导航.md` 业务模块。
> 规范：`/Volumes/dev/EADAF/frontend/PAGE_LAYOUT_STANDARD.md`（亮色 + ProLayout + 标准组件强制）。
> 决策（已确认）：亮色主题 + ProLayout（仿 EADAF）；本轮做「地基 + 核心 3 模块」；axios 封装请求层；引入 recharts。

---

## 现状

`/frontend` 是仅鉴权骨架：React 19 + antd v6.5 + react-router v7（plain），有 SSO（`auth.ts`/`AuthGate`/`LoginPage`/`AuthCallback`，token 存 `localStorage['ips_token']`）。
**缺失**：无 AppLayout、无数据层（`src/api/` 空）、无 ProComponents、无图表库、无状态管理、暗色主题、`vite proxy` 仅 `/auth/*`。`@/` 别名已就绪。

## 架构决策（已确认）

1. **亮色 + ProLayout**：改 `defaultAlgorithm`，仿 EADAF AppLayout（ProLayout + AnimatedOutlet + route meta 驱动 noContentPadding/menuData）。
2. **地基 + 核心 3 模块**：工作台（Dashboard）、计划排产（令号投产）、工位调度（工卡作业）。其余模块留路由占位。
3. **axios 封装**：`request()` 注入 Bearer、401 跳登录、解 `{code,message,data}` 信封；`apiResponse` 工具。
4. **recharts**：工作台/可视化用图表。

---

## 目标目录结构

```
frontend/
├── package.json               # 改: +@ant-design/pro-components, axios, recharts, dayjs, framer-motion, classnames
├── vite.config.ts             # 改: proxy 加 /api、/ws
├── config/
│   └── defaultSettings.ts     # 新增: ProLayout 默认设置 (navTheme light, layout side, title IPS)
└── src/
    ├── main.tsx               # 改: 引入 global.scss
    ├── App.tsx                # 改: defaultAlgorithm 亮色 + colorPrimary; 包 ProConfigProvider
    ├── routes.tsx             # 改: 接入 AppLayout + lazy 路由
    ├── global.scss            # 新增: .btn-gradient-primary 等 (仿 EADAF)
    ├── overrides.scss         # 新增: .ant-pro-query-filter 查询按钮覆写
    ├── layouts/
    │   └── AppLayout.tsx      # 新增: ProLayout + 菜单 + AnimatedOutlet + routeMeta
    ├── components/            # 新增(从 EADAF 移植, 自包含)
    │   ├── AnimatedOutlet/      # 原样 (index.tsx + index.scss)
    │   ├── PageContainerTitleWithBack/  # 原样
    │   ├── TableActions/        # 原样 (TABLE_ACTION_COLUMN_BASE/TableActions/TableActionButton)
    │   ├── TitleWithHelp/       # 原样
    │   ├── FixHeaderPage/       # 原样 (index.tsx + Context + index.css)
    │   ├── UrlSyncedProTable/   # 原样
    │   └── ScopeDomainTree/     # 改造(内联 buildScopePrefixTree, 去 pages 依赖)
    ├── hooks/
    │   ├── useUrlQueryState.ts        # 原样 (useScopeFromUrl/useTableUrlState)
    │   ├── useProTableSearchCollapse.ts # 原样
    │   └── useUserHabit.ts            # 原样 (改 STORAGE_PREFIX='ips.userHabit.v1')
    ├── utils/
    │   ├── tableUrlHelper.ts   # 原样
    │   ├── userHabit.ts        # 原样 (改 STORAGE_PREFIX)
    │   ├── buildCodePathTree.ts # 新增(从 EADAF 移植, 供 ScopeDomainTree)
    │   ├── request.ts          # 新增: axios 封装 (注入 Bearer, 401 跳登录)
    │   ├── apiResponse.ts      # 新增: isApiSuccess/parseApiListResponse/getApiData (从 EADAF 移植)
    │   └── antdAppApis.ts      # 新增: message/modal 静态桥 (ProLayout 外可用)
    ├── constants/
    │   ├── proTable.ts         # 原样 DEFAULT_PRO_TABLE_OPTIONS
    │   ├── menu.ts             # 新增: 菜单图标映射 + IPS 导航菜单数据
    │   └── enums.ts            # 新增: 工卡状态/优先级等 Select options
    ├── services/               # 新增: 按模块拆分 (仿 EADAF src/services/UAC/api)
    │   ├── workcards.ts        # GET/POST /api/ips/workcards*
    │   ├── orders.ts           # 令号投产 /orders/launch, /orders/:id
    │   ├── wbs.ts              # /wbs/*
    │   ├── workstation.ts      # /workstations
    │   ├── master.ts           # /crud/master/*
    │   └── config.ts           # /config/*, /crud/schedule/*
    ├── store/
    │   └── useUserStore.ts     # 新增: zustand 用户信息
    └── pages/
        ├── Dashboard/          # 工作台 (核心1)
        ├── OrderLaunch/        # 令号投产向导 (核心2) + List
        ├── WorkCards/          # 工卡作业 (核心3) List + Detail
        └── Placeholder/        # 占位页 (WBS/齐套/引擎/可视化/统计)
```

---

## 实现步骤

### 阶段 A — 地基（依赖、布局、数据层、标准组件）

1. **package.json**：加 `@ant-design/pro-components`、`axios`、`recharts`、`dayjs`、`framer-motion`、`classnames`、`zustand`。`pnpm install`。
2. **vite.config.ts**：proxy 加 `/api`（→6081）与 `/ws`（ws 代理）。
3. **全局样式**：新建 `src/global.scss`（`.btn-gradient-primary`、`.ai-btn`）、`src/overrides.scss`（查询按钮覆写、菜单选中色），`main.tsx` 引入。
4. **App.tsx**：改 `defaultAlgorithm` 亮色，`colorPrimary`（`#0476e7`），去掉过大的 `fontSize:20`；包 `ProConfigProvider`。
5. **config/defaultSettings.ts**：ProLayout 默认设置（`navTheme:'light'`、`layout:'side'`、`title:'IPS'`、`siderWidth:208`、`fixedHeader`、`fixSiderbar`）。
6. **移植标准组件（自包含，原样复制）**：`AnimatedOutlet`、`PageContainerTitleWithBack`、`TableActions`、`TitleWithHelp`、`FixHeaderPage`（+Context+css）、`UrlSyncedProTable`、`utils/tableUrlHelper.ts`、`hooks/useUrlQueryState.ts`、`constants/proTable.ts`。
7. **移植 + 改造**：`hooks/useProTableSearchCollapse.ts`+`useUserHabit.ts`+`utils/userHabit.ts`（改 `STORAGE_PREFIX='ips.userHabit.v1'`）；`components/ScopeDomainTree`（内联 `buildScopePrefixTree` 到 `utils/buildCodePathTree.ts`，去 EADAF pages 依赖）。
8. **数据层**：
   - `utils/request.ts`：axios 实例，请求拦截注入 `Authorization: Bearer ${getToken()}`，响应拦截解信封（401→`clearAuth()`+跳登录、非 2xx 抛 `BizError`）。
   - `utils/apiResponse.ts`：从 EADAF 移植 `isApiSuccess/parseApiListResponse/getApiData/getApiErrorMessage`。
   - `utils/antdAppApis.ts`：`message`/`modal` 静态桥（仿 EADAF，解决 ProLayout 外调用）。
9. **AppLayout**：`layouts/AppLayout.tsx`，ProLayout + `menuDataRender`（来自 `constants/menu.ts`）+ `menuItemRender`（Link）+ `<Suspense><AnimatedOutlet/></Suspense>` + routeMeta 驱动 `contentStyle`（noContentPadding→padding:0）。
10. **路由 + 菜单**：
    - `routes/config.ts`：`AppRouteMeta`（path/name/icon/hideInMenu/noContentPadding）+ `appRouteMeta[]` 全量（含占位模块）+ `findRouteMeta`。
    - `routes.tsx`：`/auth/*` 公开；其余包 `<AuthGate><AppLayout><Outlet/></AppLayout></AuthGate>`，子路由用 `lazy()`。
    - `constants/menu.ts`：6 大板块菜单，核心模块可点进、占位模块进占位页。
    - `constants/enums.ts`：从 `@ips/shared` 枚举生成 `{label,value}[]` options 与 valueEnum。
11. **`store/useUserStore.ts`**：zustand，从 `getUserInfo()` 初始化 `{ id,name }`。
12. **HomePage**：改为重定向到 `/dashboard`。

### 阶段 B — 核心模块 1：工作台（Dashboard）

13. `pages/Dashboard/index.tsx`：
    - 关键指标卡（今日待生效/待接受/修理中/挂起/超期）：调 `/api/ips/workcards?status=...` 各取 count；antd `Statistic`+`Card`。
    - 管道负荷速览：调 `/api/ips/load/workstations?days=7`，recharts 环形图/Progress 展示各工位占用率，超容高亮。
    - 风险预警列表：调 `/api/ips/monitor/alerts`，antd `Table`/`List`。
    - 快捷入口：Button 跳令号投产/非例行插单/工卡看板。

### 阶段 C — 核心模块 2：计划排产（令号投产）

14. `pages/OrderLaunch/List/index.tsx`（**模式一列表**）：`UrlSyncedProTable` 列车间令号（`/crud/production/WorkshopOrder`），列：令号/产品/修理方式/状态/计划起止；操作列。schema 独立。
15. `pages/OrderLaunch/Launch/index.tsx`（**FixHeaderPage 向导**）：
    - `title=<PageContainerTitleWithBack title="令号投产"/>`，`extra=<Button type=primary>确认投产</Button>`。
    - ProForm 分步：选工厂令号→选产品/修理方式→匹配已发布 BOP 方案（`/api/ips/bop-schemes`）→填计划起止→预览将生成的工卡。
    - 提交调 `/api/ips/orders/launch`，成功跳令号详情 + message。
16. `pages/OrderLaunch/Detail/index.tsx`（令号总览）：调 `/api/ips/orders/:id`，展示令号信息 + 工卡列表 + BOP 实例。

### 阶段 D — 核心模块 3：工位调度（工卡作业）

17. `pages/WorkCards/List/index.tsx`（**模式一列表**）：`UrlSyncedProTable` 列工卡（`/api/ips/workcards`），筛选 workstationId/status/priority；状态 Tag 着色（valueEnum）；操作列：详情/接受（仅 PENDING_ACCEPT）/挂起/提交。schema 独立。
18. `pages/WorkCards/Detail/index.tsx`：调 `/api/ips/workcards/:id`（聚合 工序/工步/齐套/DAG），antd `Descriptions`+`Tabs`（工步/齐套/DAG）。接受/进度/提交按钮 → 调编排端点 + message。

### 阶段 E — 占位模块 + 验证

19. `pages/Placeholder/index.tsx`：通用「开发中」占位页。
20. 路由 meta 全量登记，占位模块进 Placeholder。
21. **验证**：`pnpm --filter @ips/frontend typecheck` 全绿；`pnpm dev` 启动，SSO 登录后进 AppLayout，菜单可见；工作台指标卡有数据（需 backend 已 seed）；令号投产向导端到端跑通；工卡列表/详情/接受/提交链路通。

---

## 关键约定（落地严格遵守）

- **标准组件强制**（PAGE_LAYOUT_STANDARD §0）：列表用 `UrlSyncedProTable`；操作列用 `TableActions`/`TableActionButton`+`TABLE_ACTION_COLUMN_BASE`+宽度公式；新建/编辑用 `FixHeaderPage`+`PageContainerTitleWithBack`；2 列用 `Splitter`+`ScopeDomainTree`；标题说明用 `TitleWithHelp`；AppLayout 仅用 `AnimatedOutlet`。
- **列表页**：`PageContainer pageHeaderRender={()=> <></>}`；`headerTitle` 必填；`search=useProTableSearchCollapse(pageId)`；`options=DEFAULT_PRO_TABLE_OPTIONS`；工具栏「新建」`btn-gradient-primary`；查询按钮不加渐变。
- **URL 持久化**（§2.3）：scope/page/pageSize reserved；筛选走 `urlFilterKeys`；切换域清 page。Drawer 内表 `syncUrl={false}`。
- **新建/编辑禁止 Drawer**（§1.8）：用 `FixHeaderPage` 新页面；简单配置用 Modal。
- **后端契约对齐**：列表响应 `{code,message,data:{items,page,size,total}}`（`parseApiListResponse` 解包）；写操作编排端点见 backend README；通用代理 `/api/ips/crud/:module/:entity`。
- **token**：`request` 拦截器统一注入 `Authorization: Bearer ${getToken()}`，401→`clearAuth()`+跳 `/auth/login`。
- **主题**：亮色 `defaultAlgorithm`，ProLayout 与 ConfigProvider 的 `colorPrimary` 统一。
- **不碰**：`backend/`、`docs/`、现有 `auth/`（仅 HomePage 改重定向、vite proxy 扩展）。

## 验证

- `pnpm --filter @ips/frontend typecheck` 全绿。
- `pnpm dev`（前端 6082）启动，SSO 登录进入 AppLayout，侧边菜单 6 板块可见。
- 工作台：指标卡数值来自后端（需 `pnpm seed`），管道环形图渲染。
- 令号投产：向导能选工厂令号/产品/BOP 方案，提交 `/orders/launch` 成功后列表出现该令号。
- 工卡作业：列表筛选/分页 URL 持久化、状态 Tag、接受/提交按钮调通编排端点并 message 反馈。
