# IPS Backend (BFF)

修理车间智能排产系统 (IPS) 的无状态 BFF（Backend-For-Frontend）。**不持有数据库**，所有业务数据存放于 EADAF 平台；BFF 负责 SSO 鉴权、对 EADAF 数据 API 的适配与编排、实时推送。

## 架构

```
前端 ──(Bearer JWT)──> BFF ──(App Token)──> EADAF 数据 API
                          │
                          └──(WebSocket /ws/ips)──> 前端实时推送
```

分层：`路由 (routes/) → 仓储 (eadaf/repositories.ts) → 通用客户端 (eadaf/EADAFClient.ts) → EADAF`。

- **通用客户端 `EADAFClient`**：与领域无关，按 `routePath` 做 `find/findFiltered/create/update/deleteOne/ingest/upload/download`。token 自动缓存/刷新/401 重试。
- **实体注册表 `entities.ts`**：`module/entity` → routePath，驱动通用代理。
- **仓储 `repositories.ts`**：领域概念 → EADAF 适配，含跨实体聚合（齐套校验、WBS 树、令号总览）。
- **共享类型/常量 `@ips/shared`**：前后端共用的实体接口、枚举、routePath、WS 事件。

## 目录

```
src/
├── server.ts            # 启动入口（HTTP + WS + token 探测）
├── app.ts               # Express 应用（CORS / health / auth / 业务路由 / 错误处理）
├── config/env.ts        # 环境变量 → config
├── eadaf/
│   ├── EADAFClient.ts   # EADAF 通用客户端（token + find/create/update/delete）
│   ├── entities.ts      # 实体注册表（通用代理用）
│   └── repositories.ts  # 领域仓储 + 聚合
├── middleware/auth.ts   # SSO JWT 鉴权
├── routes/
│   ├── auth.routes.ts   # SSO（/auth/*）
│   ├── crud.routes.ts   # 通用 CRUD 代理（/api/ips/crud/*）
│   └── op.routes.ts     # 业务编排（/api/ips/*）
├── ws/opHub.ts          # WebSocket Hub
├── lib/
│   ├── response.ts      # 统一信封 ok/fail/handleError
│   └── validate.ts      # zod 校验
└── scripts/seed.ts      # 演示数据写入
```

## 快速开始

```bash
# 1. 在仓库根目录安装（pnpm workspace）
pnpm install

# 2. 配置环境变量
cp backend/.env.example backend/.env.development
# 填写 IPS_APP_SECRET、SSO_JWT_SALT（从 EADAF 应用管理获取）

# 3. 开发（热重载）
pnpm --filter @ips/backend dev
# 或仓库根：pnpm dev

# 4. 写入演示数据（需 EADAF 已就绪）
pnpm --filter @ips/backend seed

# 5. 投产一张令号（需先用 seed 获取 id，token 取 SSO 登录后的用户 token）
curl -X POST http://localhost:6081/api/ips/orders/launch \
  -H "Authorization: Bearer <SSO_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"factoryOrderId":"<id>","productId":"<id>","repairMethod":"OVERHAUL","bopSchemeId":"<id>"}'
```

## 路由总览

全部业务路由（`/api/ips/**`）经 `authenticate` 中间件保护。

### 通用 CRUD 代理 `/api/ips/crud/:module/:entity`

一套路由覆盖全部 38 个实体（对应 EADAF 152 端点）。透传字段，不感知字段名（故 `scheduling` 模块的 snake_case 无需特判）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/:module/:entity` | 列表（`limit`/`skip`/`page` + 字段过滤 + `status`） |
| POST | `/:module/:entity` | 创建（body 为实体字段） |
| PATCH | `/:module/:entity/:id` | 更新 |
| DELETE | `/:module/:entity/:id` | 删除 |

示例：`GET /api/ips/crud/wbs/WbsNode?workshopOrderId=xxx`、`POST /api/ips/crud/master/Workstation`。

### 业务编排 `/api/ips/*`

按 `docs/模块和导航.md` 的功能模块组织：

| 模块 | 端点 |
|------|------|
| 主数据 | `GET /workstations`、`GET /process-operations/:id`、`GET /bop-schemes/:id` |
| 令号投产 | `POST /orders/launch`、`GET /orders/:workshopOrderId` |
| WBS | `GET /wbs/trees/:workshopOrderId`、`PATCH /wbs/nodes/:id`、`POST /wbs/nodes/postpone` |
| 工卡作业 | `GET /workcards`、`GET /workcards/floating`、`GET /workcards/:id`、`POST /workcards/:id/effect`、`POST /workcards/cancel`、`POST /workcards/:id/accept`、`PATCH /workcards/:id/progress`、`POST /workcards/:id/submit` |
| 齐套管理 | `GET /kit/requirements/:workCardId`、`POST /kit/check/:workCardId`、`POST /workcards/:id/suspend`、`POST /workcards/:id/resume` |
| 非例行插单 | `POST /workcards/non-routine`、`POST /workcards/:id/recall` |
| 排产引擎 | `GET /engine/status`、`POST /engine/run` |
| 排产配置 | `GET|PATCH /config/schedule`、`GET|PUT /config/workstation-capacity` |
| 可视化 | `GET /gantt/workshop-order/:id`、`GET /load/workstations` |
| 统计分析 | `GET /analytics/work-hour-medians`、`GET /analytics/utilization`、`GET /analytics/deviation` |
| 预警 | `GET /monitor/alerts` |

## 响应约定

统一信封 `{ code, message, data }`：

- 成功：`code:200, message:'success', data:<任意>`
- 列表：`data: { items, page?, size?, total }`
- 错误：`data:null`，HTTP 状态码与 `code` 一致

## EADAF 字段命名约定

- 实体字段一律 **camelCase**（如 `workshopOrderId`、`stationNo`），与 IPS `apis.json` 一致。
- **唯一例外**：`scheduling` 模块（`PlanVersion`、`SchedulePlan`）字段为 **snake_case**（如 `plan_code`、`workstation_id`）。通用代理透传不感知字段名；仓储层对 scheduling 实体用 snake_case 接口。
- `id` 过滤被 EADAF Find 忽略，故按 id 取单条采用 `findItemById`（拉一页本地匹配 + 业务编号兜底）。

## WebSocket

- 路径：`/ws/ips`（由 `BFF_WS_PATH` 配置）
- 订阅工位：连接后发送 `{type:'subscribe', payload:{workstation_code:'WS-XXX'}}`
- 事件类型见 `@ips/shared` 的 `WS_EVENTS`（工卡状态/进度、管道、齐套、引擎日志、令号投产、预警）

## 环境变量

见 `.env.example`。关键项：`EADAF_API_BASE_URL`、`IPS_APPLICATION_ID`、`IPS_APP_SECRET`、`SSO_JWT_SALT`、`BFF_PORT`（默认 6081）、`BFF_WS_PATH`（默认 /ws/ips）。

## 类型检查 / 构建

```bash
pnpm --filter @ips/backend typecheck
pnpm --filter @ips/backend build
```
