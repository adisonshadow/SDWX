# IPS Backend 完善方案

> 制定日期：2026-07-23
> 背景：基于 EADAF 平台 `apis.json`（152 端点 / 9 模块）、参考项目 `/Volumes/dev/SDQLJ_GJXL/admin/backend`、以及 `docs/` 域模型，系统性完善 `backend`。

---

## 现状判断

`/backend` 当前是**仅鉴权的 BFF 骨架**：`EADAFClient` 只做 token 管理（`authedFetch` 已就绪但无人调用），`app.ts` 只挂了 `/health` + `/auth`，无业务路由、无类型、无常量。`docs/` 定义了 28 个实体 + 15 个枚举；EADAF `apis.json` 暴露 **9 个模块共 152 个统一 CRUD 端点**（routePath `IPS/{module}/{Entity}`，操作 `*Find/*Create/*Update/*Delete`，响应 `{code,message,data}`，列表为 `{items,page,size,total}`）。前端也是仅鉴权骨架（`src/api/` 为空），无业务契约需满足 → 由后端定义契约。

参考项目 GJXL 提供了完整范式（generic `EADAFClient` + `repositories.ts` + `op.routes.ts` + `@fmms/shared` + WS hub + seed）。**关键差异**：IPS 的 EADAF 实体字段是 **camelCase**（GJXL 是 snake_case），EADAF `Update` 返回 `{item,matched}`（GJXL 客户端丢弃返回）。本方案据此适配。

## 架构决策（已与用户确认）

1. **通用代理 + 编排端点**：一个泛型 CRUD 代理覆盖全部 152 实体；另写业务工作流编排端点。
2. **pnpm monorepo + `@ips/shared`**：迁移为 workspace，共享类型/路由表/枚举/WS 事件。
3. **全部 9 模块**。
4. **附加**：WebSocket Hub + Seed 脚本 + zod 校验。

---

## 目标目录结构（迁移后）

```
/Volumes/dev/SDQLJ_GJXL/IPS/
├── pnpm-workspace.yaml          # 新增: packages/*, backend, frontend
├── package.json                  # 新增: monorepo 根 (dev/build/typecheck -r)
├── tsconfig.base.json            # 新增: ES2022/bundler/strict 公共基线
├── .gitignore                    # 微调
├── packages/
│   └── shared/                   # 新增: @ips/shared
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # re-export
│           ├── types.ts          # EadafEnvelope / WsMessage / 28 实体接口 (camelCase) / DTO
│           ├── enums.ts          # 由 docs/enums.ts 改造为纯运行时常量 (剥离 typeorm)
│           ├── routes.ts         # EADAF_ROUTES (IPS/{module}/{Entity}) + EADAF_OPS + INGEST_ROUTE
│           └── ws-events.ts      # WS_EVENTS
├── backend/
│   ├── package.json              # 改: 加 @ips/shared:workspace:* / ws / zod 依赖; scripts 加 seed
│   ├── tsconfig.json             # 改: extends ../tsconfig.base.json, paths @ips/shared
│   ├── .env.example              # 微调: 补 WS 注释
│   └── src/
│       ├── server.ts             # 改: 挂 opHub, 引用 @ips/shared
│       ├── app.ts                # 改: 挂 /api/ips (opRouter) + /api/ips/crud (crudRouter)
│       ├── types.ts              # 改: SsoUserInfo 保留; EadafEnvelope 改从 @ips/shared 引入
│       ├── config/env.ts         # 改: 加 BFF_WS_PATH, 端口默认 6081 保持
│       ├── eadaf/
│       │   ├── EADAFClient.ts    # 升级: 补 find/findFiltered/create/update(返回item)/deleteOne/ingest/upload/download (移植 GJXL + update 返回 {item,matched})
│       │   ├── entities.ts       # 新增: ENTITY→{module,key,camelCodeField?} 注册表 (驱动通用代理)
│       │   └── repositories.ts   # 新增: 领域 repo (order/wbs/workcard/kit/schedule...) → EADAF 适配
│       ├── middleware/
│       │   └── auth.ts           # 改: 引用 @ips/shared SsoUserInfo
│       ├── routes/
│       │   ├── auth.routes.ts    # 不变
│       │   ├── crud.routes.ts    # 新增: 通用代理 /api/ips/crud/:module/:entity [GET,POST,PATCH,DELETE]
│       │   └── op.routes.ts      # 新增: 业务编排端点 (见下)
│       ├── ws/
│       │   └── opHub.ts          # 新增: WS hub (订阅 workstation_code, 广播 WS_EVENTS)
│       ├── lib/
│       │   ├── response.ts       # 新增: ok()/fail() 统一信封 + handleError(res,e)
│       │   └── validate.ts       # 新增: zod schema 工具 (createSchema, parseQuery)
│       └── scripts/
│           └── seed.ts           # 新增: 写 master/process/bom 样例 + 一条令号 + WBS 到 EADAF
├── frontend/  (不动, 本次只做后端)
└── docs/      (不动)
```

---

## 实现步骤

### 阶段 0 — monorepo 化（不动业务逻辑，先保证现有骨架仍可跑）

1. 新建根 `pnpm-workspace.yaml`（`packages: [backend, frontend, packages/*]`）、根 `package.json`（`dev`/`build`/`typecheck` 用 `pnpm -r`）、`tsconfig.base.json`（移植 GJXL 基线）。
2. 新建 `packages/shared/`：`package.json`（name `@ips/shared`, `exports` `./types`、`./constants`、`./enums`、`./routes`）、`tsconfig.json`、`src/index.ts`。
3. `packages/shared/src/types.ts`：`EadafEnvelope<T>`、`FindResult<T>`（`{items,page,size,total}`）、`WsMessage`、28 个实体接口（**camelCase**，`id?` 可选，基础字段 `id/bizNo/name/remark/createdAt/updatedAt`）。
4. `packages/shared/src/enums.ts`：从 `docs/enums.ts` 改造，**剥离 typeorm**，导出运行时常量（`WorkCardStatusEnum` 等，`values`/`items` 结构保留）+ TS 字面量联合类型。
5. `packages/shared/src/routes.ts`：`EADAF_SCOPES`（9 个 `IPS/{module}`）、`EADAF_ROUTES`（28 实体 routePath）、`EADAF_OPS`（FIND/CREATE/UPDATE/DELETE）、`INGEST_ROUTE`。
6. `packages/shared/src/ws-events.ts`：`WS_EVENTS`（workcard.status.changed / pipeline.changed / kit.changed / engine.log / order.launched 等）。
7. `backend/tsconfig.json` 改为 `extends ../tsconfig.base.json`，加 `paths: { "@ips/shared": ["../packages/shared/src"], "@ips/shared/*": ["../packages/shared/src/*"] }`。
8. `backend/package.json` 加 `@ips/shared: "workspace:*"`、`ws`、`zod`、`@types/ws`；`scripts.seed` = `tsx src/scripts/seed.ts`。
9. `pnpm install` 后跑 `pnpm --filter @ips/backend typecheck` 确认骨架迁移无回归（此时业务代码尚未加）。

### 阶段 1 — 数据访问层（EADAFClient + 实体注册表）

10. 升级 `backend/src/eadaf/EADAFClient.ts`：移植 GJXL 的 `find`/`findFiltered`/`create`/`ingest`/`uploadObject`/`downloadObject`；**修改 `update` 返回 `T`**（解析 `data:{item,matched}` 返回 `item`，因 IPS Update 响应含 item）；`deleteOne` 不变。`FindParams` 用 `@ips/shared` 或本地定义。
11. 新建 `backend/src/eadaf/entities.ts`：`ENTITY_REGISTRY: Record<string,{module,entity,codeField?}>` —— 由 `EADAF_ROUTES` 反推，供通用代理把 `:module/:entity` 映射到合法 routePath 并校验。

### 阶段 2 — 通用 CRUD 代理路由（覆盖全部 152 端点）

12. `backend/src/lib/response.ts`：`ok(res,data,message?)`、`fail(res,status,message,data=null)`、`handleError(res,e)`（EadafError→httpStatus、其余→500）。
13. `backend/src/routes/crud.routes.ts`（挂在 `/api/ips/crud`，`authenticate`）：
    - `GET /:module/:entity` → `find`，query 透传 `limit/skip` + 顶层字段过滤；返回 `{items,page,size,total}`。
    - `POST /:module/:entity` → `create`，body 包 `{body}` 透传；返回 item。
    - `PATCH /:module/:entity/:id` → `update`，返回 item。
    - `DELETE /:module/:entity/:id` → `deleteOne`。
    - 对未知 module/entity 返回 404；统一 try/catch + handleError。
    - 注：`scheduling` 模块字段是 snake_case，通用代理透传不感知字段名，无需特判。

### 阶段 3 — 业务编排路由（op.routes.ts，按 docs 模块）

14. `backend/src/eadaf/repositories.ts`：领域 repo —— `factoryOrderRepo`、`workshopOrderRepo`、`workCardRepo`、`workCardTaskRepo`、`wbsNodeRepo`、`kitRequirementRepo`、`outsourcingRepo`、`scheduleConfigRepo`、`workstationCapacityRepo`、`planVersionRepo`、`alertRecordRepo` 等，方法 `list/get/getByCode/create/update`，`findItemById` 兜底（id 过滤被 EADAF 忽略时本地匹配）。`kitCheck(workCardId)` 等跨实体聚合函数。
15. `backend/src/routes/op.routes.ts`（挂在 `/api/ips`，`authenticate`），编排端点（zod 校验写操作）：
    - **令号投产向导**：`POST /orders/launch`（选令号→产品/修理方式→BOP 方案→批量生成 WorkCard PENDING_EFFECTIVE + WorkCardTask + WBS 根/阶段/包/任务节点）。
    - **WBS**：`GET /wbs/trees/:workshopOrderId`（拼装多级树）、`PATCH /wbs/nodes/:id`、`POST /wbs/nodes/:id/postpone`（批量顺延）。
    - **游离工卡池**：`GET /workcards/floating`（status=PENDING_EFFECTIVE + 筛选）、`POST /workcards/:id/effect`（手动生效→PENDING_ACCEPT 推工位，WS 广播）、`POST /workcards/cancel`。
    - **工卡作业**：`GET /workcards`、`GET /workcards/:id`（聚合 工序/工步/齐套/DAG）、`POST /workcards/:id/accept`、`PATCH /workcards/:id/progress`、`POST /workcards/:id/submit`（带 WS 广播）。
    - **齐套管理**：`GET /kit/requirements/:workCardId`、`POST /kit/check/:workCardId`、`POST /workcards/:id/suspend`（KIT_SUSPENDED）、`POST /workcards/:id/resume`。
    - **非例行插单**：`POST /workcards/non-routine`（创建+Insert 到工位管道位置）、`POST /workcards/:id/recall`。
    - **排产引擎**：`POST /engine/run`（触发重算→写 WorkCardPlanSlot，广播 engine.log）、`GET /engine/status`。
    - **排产配置**：`GET|PATCH /config/schedule`、`GET|PATCH /config/workstation-capacity/:id`。
    - **可视化**：`GET /gantt/workshop-order/:id`（工卡条带）、`GET /load/workstations`（未来 N 天负荷）。
    - **统计分析**：`GET /analytics/work-hour-medians`、`GET /analytics/deviation`、`GET /analytics/utilization`。
    - **预警**：`GET /monitor/alerts`。
16. `backend/src/lib/validate.ts`：zod schema（如 `LaunchOrderSchema`、`AcceptWorkCardSchema`、`NonRoutineCardSchema`），路由中 `parseOr400`。

### 阶段 4 — WebSocket Hub + app/server 接线

17. `backend/src/ws/opHub.ts`：移植 GJXL OpHub（path `/ws/ips`，订阅 `workstation_code`，广播 `WsMessage`）。
18. `backend/src/app.ts`：挂 `crudRouter`（`/api/ips/crud`）、`opRouter`（`/api/ips`）；保留 `/health`、`/auth`、404、错误中间件。
19. `backend/src/server.ts`：`opHub.attach(server)`；启动 token 探测（非致命）。

### 阶段 5 — Seed 脚本 + 文档

20. `backend/src/scripts/seed.ts`：`tsx` 脚本，直接 `import { eadafClient }`，写样例：1 产品 + 1 BOP 方案（含 2 工序）+ 1 BOM 方案 + 1 FactoryOrder + 1 WorkshopOrder + 触发若干 WorkCard + 一棵 WBS；幂等（按 code find 后再 create）。
21. `backend/README.md`（新增）：架构说明 + 启动/seed/接线 + EADAF 字段命名约定（camelCase、scheduling 例外）+ 通用代理用法 + 编排端点清单。

---

## 关键约定（落地时严格遵守）

- **字段命名**：`@ips/shared` 实体接口一律 **camelCase**（与 IPS apis.json 一致）；唯独 `scheduling` 模块字段是 snake_case —— 通用代理透传不感知字段名，repository 层对 `scheduling` 实体用 snake_case 接口。
- **响应信封**：全部 `{code:200,message:'success',data}`；列表 `data:{items,page,size,total}`；错误 `data:null`。
- **EADAF 过滤**：`filter` 仅等值；顶层字段优先；`limit≤100`；`id` 过滤被忽略 → `findItemById` 拉一页本地匹配 + code 兜底。
- **鉴权**：`/api/ips/**` 全部走 `authenticate`；操作人字段取 `req.user`。token 仅 BFF 内存，不下发前端。
- **错误处理**：`EadafError` 透传 httpStatus（200→500）；其余 500；每个路由 try/catch + `handleError`。
- **WS**：路径 `/ws/ips`，订阅 `workstation_code`，事件类型集中 `@ips/shared`。
- **不碰**：`docs/`、`frontend/`、现有 `auth.routes.ts`/`middleware/auth.ts`（仅把 SsoUserInfo 引用切到 @ips/shared）。

## 验证

- `pnpm -r typecheck` 全绿。
- `pnpm --filter @ips/backend dev` 启动，`GET /health` 200、`GET /api/ips/crud/wbs/WbsNode`（带 token）返回 `{items,...}`、`POST /api/ips/orders/launch` 端到端跑通投产向导并落 EADAF。
- `pnpm --filter @ips/backend seed` 幂等写入样例数据。
- WS：连 `ws://localhost:6081/ws/ips`，触发 accept 后收到 `workcard.status.changed`。
