# admin 接入新版 EADAF —— 计划与整改

> **2026-11-01 后续变更：** 工位数据已并入 IPS，不再复制工卡。目录 `admin` 改为 `web`。现行实体、路径和状态枚举以 `docs/EADAF数据结构设计-FMMS.md` 第 1 节为准。本文 §7 已按这个决定改写；前面各节是 2026-10-31 接入新版 EADAF 时的记录，其中的 `fmms` 路径不要再当作现行接口。
>
> 本文替代原来的"已做修改"清单：补上待办与验收，并把 2026-10-31 确认的决策、实测到的问题一并写进来。
> 核对基准：代码 + 运行中的 EADAF（`localhost:29526`）。所有写探测的测试数据已删除，改过的行已还原。
> 目录：`/Volumes/dev/EADAF`（平台）、`/Volumes/dev/SDQLJ_IPS`（排产/生产管理）、`/Volumes/dev/SDQLJ_GJXL`（本项目，工位作业）。

## 0. 结论

骨架（端口、routePath、应用令牌、Find 解包）是对的。**写入链路断的原因是两类问题**：

1. **客户端多发字段**：`EADAFClient.create()` 默认给所有实体补 `created_at/updated_at`，而这两个字段在 EADAF 是系统托管字段（`extendType: adb-created-at/adb-updated-at`），写 body 里一律被拒（18 个实体实测全 400）。→ **本项目侧改一行**。
2. **模型与物化表漂移**：模型里有、表里没有列（`OutsourceOrder.workCardId`、`TraySlot.slotStatus` 等 6 处）。→ **在 EADAF 重新物化**（已执行 2 处）。

## 1. 系统边界与已确认决策

| 系统 | 位置 | 职责 |
|---|---|---|
| EADAF | `/Volumes/dev/EADAF`，API `29526` / 管理台 `29527` | 唯一数据模型来源：实体、字段、物化表、采集管道、SSO |
| IPS | `/Volumes/dev/SDQLJ_IPS`，EADAF 应用 `IPS`（`…0005`） | 生产线管理：排产、创建工卡/派工 |
| 本项目 FMMS | `/Volumes/dev/SDQLJ_GJXL`，EADAF 应用 `FMMS`（`…0006`） | 工位侧：接收工卡、作业、检测、处置、收发 |

已确认的 4 条决策：

1. **数据模型只在 EADAF 上对齐**：字段缺失/类型不一致/枚举不对，改 EADAF 实体并物化；不在 BFF 加字段、不用 `remark` 装 JSON、不做兼容兜底。
2. **委外单全部落库，并且与工卡绑定**（模型里已有 `workCardId`，靠物化补列，已做）。
3. **采集不在本项目做**：测量由 VC 的"测量 adapt EXE"完成，测完回调 EADAF 采集管道；采集细节下一阶段，本阶段只对齐路由与管道状态。
   **回调接口不做认证——这是客户明确要求**。EXE 侧保持裸 POST，不收令牌、不加 Authorization；由接收回调的服务自己持有 EADAF 令牌去转发。
4. **创建工卡不放在本项目**：工卡在 IPS 创建，本项目只接收 + 执行，不提供创建入口。

## 2. EADAF 模型怎么改（已跑通的 API）

EADAF 自身提供了 bizdata 内置 API，不用开控制台也能改模型。实测可用的调用链：

```bash
# 1) 换用户令牌（管理台同源；dev 默认 admin/123456）
POST http://localhost:29526/api/v1/auth/login
{"username":"admin","password":"123456","dev":true}      → data.token

# 2) 看模型
GET  /api/v1/business-data/schema                        → { entities, enums, relations }
GET  /api/v1/business-data/entities?codePrefix=fmms:
GET  /api/v1/business-data/database-connections

# 3) 改字段（整组覆盖式保存，version+1）
PUT  /api/v1/business-data/entities/{entityId}/fields
{"fields":[{"fieldKey":"workCardId","label":"关联工卡ID","type":"varchar","length":64}]}

# 4) 物化（先预览再执行；纯 additive：CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS）
POST /api/v1/business-data/materialization/preview
POST /api/v1/business-data/materialization/execute
{"entityIds":["<uuid>"],"connectionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createTargetIfMissing":true}
```

关键事实：

- 物化连接：`本地 PostgreSQL（应用库）` → `localhost:35432/fyMOM`，目标 schema `bizdata_mat`，connectionId `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`。
- **FMMS 应用令牌不能调 bizdata**：`builtinApis` 只授权了 storage / user / organization 共 24 项，没有 `bizdata:*`；用 app token 调 `/business-data/schema` 返回 `401 TOKEN_INVALID`，必须用管理员用户令牌。
- 写模型需要的权限码：`bizdata:entity:save_fields`、`bizdata:materialization:execute`。

**今天已执行（2026-10-31）**：对 `fmms:service:OutsourceOrder`、`fmms:logistics:TraySlot` 执行了物化，新增 `workCardId`、`slotStatus` 两列。验证：建委外单带 `workCardId` 200，按 `workCardId` 查得到；`slotStatus=occupied` 200。

## 3. 原文中需要更正的说法

| 原文 | 实测 | 更正 |
|---|---|---|
| 修理…已写回处置 | 委外单创建 400（表缺列 + 多发时间戳） | 模型列已补，时间戳待客户端改 |
| 种子 `source` 从 mock 改 seed | 现存 39 张工卡里仍有 **21 张 `source=mock`** | 补数据清理任务 |
| 去掉 `SSO_JWT_SALT`/`POST_REDIRECT` | `web/backend/.env.production:12-13` 仍在 | 一并清掉 |
| 列表是 `data.items` + `data.pagination` | 部分服务如此；`WorkCardFind` 是 `data.data.{total,page,size,items}` 双层壳 | 写清两种形态 |
| 范围只含 admin | 客户端采集器读 `localStorage.fmms_token`，迁移后已无此 token | 采集按决策 3 重做 |

成立的：81 个服务、routePath 与 `constants.ts` 一一对应、应用令牌可换、Find 全可用、`29526/29527` 分工正确。

## 4. 问题清单

### P0 —— 直接不可用

1. **所有 Create 都 400（客户端）**
   `EADAFClient.ts:176-180` 默认 `withTimestamps=true`。实测 18 个实体全部
   `400 body 含未建模字段: created_at, updated_at`——**即使列已物化也照拒**，因为它们是系统托管字段。
   → 本项目侧：`create()` 不再注入时间戳（默认 false），`seed.ts` 里手写的也删掉。
   （顺带：EADAF 这条报错文案写的是"未建模字段"，容易误导，建议平台改成"系统字段不可写入"。）

2. **委外单**：模型有 `workCardId`、表原来没有 → **已物化修复**。剩客户端时间戳问题。
   `GET /api/op/outsource?card_id=` 用的 `workCardId` 过滤现在也能用。

3. **形迹槽位**：`slotStatus` 列已补；但 `op.routes.ts:510` 仍把 `filled:true` 映射成 `'filled'`，枚举是 `empty|occupied|reserved` → 仍会 400。改值。

4. **采集管道（下一阶段）**：`constants.ts:154` 的 `fmms/measurementIngest` 不存在；真正的管道是 **`fmms/digital_measure`**（目标 `InspectionRecord`，协议 modbus_tcp），当前 **403「采集管道未发布」**。

5. **故检处置不写回**：`InspectionDisposal.tsx:278-297` 只改本地 rows，不调 `updatePart/createOutsource/createScrap`。

6. **故检工位无法结卡**：`InspectionBoard.tsx:146` 的 `onSubmit` 只保存检测结果，不调 `submitWorkCard`；副屏在线时主屏提交按钮又被移除（`WorkCardDetail.tsx:128-133`）。

7. **收发库存不落库**：`ReceiveBoard.tsx:175-181` 不带 `stock_id`、`transaction_type` 用 `inbound/outbound`（线上是 `stock_in/stock_out/transfer`）；BFF 把 `stock_type` 拼进 `remark`；`lineStockItemRepo` 没有 update → 库存数量永不变。

8. **故检板空白**：检测项挂在 `wbs_node_id`，但 `repositories.ts:119-150` 只按 `work_step_id`/`part_code` 汇总；`seed.ts:186` 也只写 `wbs_node_id`。

### P1 —— 稳定性与一致性

9. **会话没有生命周期**：`expiresAt`/`refreshToken`/`deleteSessionsBySid`/`createdAt` 只写不读；会话 7 天不过期、token 15 分钟失效无人刷新、EADAF 登出不同步；`/auth/me` 不验签却回 `verified_locally:true`。
10. **WS 无鉴权 + 重连粗暴**：握手不校验、`token` 当 userId；`useOpWs` 断线 5 秒 `location.reload()`；`InspectionBoard` 把 `cardId` 当 `workstation_code` 订阅。
11. **失败被吞成"空数据"**：`WorkCardList.tsx:57`、`StationSelect.tsx:36`、`SortingBoard.tsx:154-158`、`ReceiveBoard.tsx:124`、`op.routes.ts:72-83`、`repositories.ts:133-144`。
12. **分页假的**：前端传 `page/size`，BFF 只读 `station_type/status`，固定 `limit:100`，前端丢 `total`；`skip` 实测不生效、排序不稳定。
13. **库里的词汇脏**：工卡 `status` 有 `processing`/`unaccepted`；`station_type` 有 `receiving_dispatch`；零件 `status` 有 `in_process/completed/pending_outsource`；`progress` 有 string；21 张 mock 卡未清。
    另：EADAF 枚举**只有部分接口校验**（`TraySlot.slotStatus` 严格；`WorkCard.status`、`WorkCardPart.status`、`OutsourceOrder.outsource_status`、`NotificationLog.call_type`、`Bop.status` 写任意值都能过），所以是持续产生脏数据。

### P2 —— 清理

- 拍照未接（`InspectionBoard.tsx:270` 只弹 toast）；`PhotoPreview.tsx` 无引用。
- 前端声明但从不调用：`fetchTools/fetchOutsource/fetchWorkSteps/fetchTray*/updateTraySlot/uploadFile/fetchSsoConfig/fetchMe/fetchAgvTasks`。
- 后端有前端不用：`GET /calls`、`GET /work-steps`、tray 三接口、`GET /agv`、storage 下载/预览。
- 写死：`ReceiveBoard.tsx:763` 的 `'OP04-2'`、`SortingBoard.tsx:18` 的 `TRAY_CELL_COUNT=6`、`useOpWs.ts:19` 的 `/ws/op`、`FLOW-*` 条码。
- `/auth/callback` 前端页是旧 `POST_REDIRECT` 残留；死依赖 `jsonwebtoken`；多个 repository 方法无调用。
- 单号用 `Date.now()` 同毫秒会撞；所有 `fetch` 无超时；`server.ts` 启动 `await getToken()` 会阻塞 listen。
- `env.ts` 的 `required(key,fallback)` 永不抛错；`FRONTEND_URL` 在生产 env 缺失 → 登录后 302 回 localhost。
- 文档端口已改为 29526/29527：`docs/README.md`、`docs/部署与联调手册.md`、`docs/EADAF数据结构设计-FMMS.md`、`docs/接口契约-admin-backend-BFF.md`、`docs/工位客户端架构说明.md`、`docs/plans/第一阶段实施计划.md`。
- `docs/EADAF数据结构设计-FMMS.md` 的 `OutsourceOrder` 字段与实际不一致。

## 5. 模型漂移清单（模型字段 vs 物理列）

| 实体 | 差异 | 处理 |
|---|---|---|
| `fmms:service:OutsourceOrder` | 模型有 `workCardId`，表没有 | ✅ 已物化 |
| `fmms:logistics:TraySlot` | 模型有 `slotStatus`，表没有 | ✅ 已物化 |
| `fmms:logistics:TrayTemplate` | 模型有 `trayPhotoObjectId`，表没有 | ✅ 已物化 |
| `fmms:tooling:MeasuringTool` | 模型有 `parseTemplate`，表没有 | ✅ 已物化 |
| `fmms:production:Bop` | 表有 `id/created_at/updated_at`，模型没有 | 不改；客户端本来就不传 |
| `fmms:service:AgvTask` | 同上 | 不改 |

> 建议把"模型 vs 物化表"的对比做成 EADAF 的一个巡检脚本，CI 里跑，避免以后再漂。
> 2026-10-31：6 处漂移已全部消除（OutsourceOrder / TraySlot / TrayTemplate / MeasuringTool 已物化；Bop、AgvTask 是表里多列，不影响写入）。

### 5.1 平台侧代码改动（EADAF，未提交）

`backend/src/services/apiService/operationParameterSchemas.js`：

- 新增 `SYSTEM_MANAGED_FIELD_KEYS`（`created_at/updated_at/createdAt/updatedAt`）与 `isSystemManagedFieldKey()`；
- `getEntityWritableFieldKeys()` 改用它（原来硬编码同一份清单）；
- `buildEntityBodySchema()` 的 `required` 与 `buildEntityBodyZod()` 的 `.optional()` 都跳过系统字段。

原因：写校验把系统字段排除在可写之外，body 结构又按 `nullable === false` 把它们列成必填，导致「传了报未建模、不传报必填」。改完两边用同一份清单。EADAF 是独立仓库，这处改动没有提交，需要按它的 Issue→分支→PR 流程走。

另新增巡检脚本 `backend/scripts/check-materialization-drift.js`（纯新增，不改运行时）：比对实体模型字段与物化表列，有漂移退出码 1，可挂 CI。

## 6. 任务总表（按紧急度）

> 紧急度：**T0** = 阻塞主流程，不做就演示不了；**T1** = 稳定性和数据质量；**T2** = 体验、清理、下一阶段。
> 状态：`待做` / `进行中` / `已完成` / `待确认`。备注一列双方都可以改。

| 编号 | 紧急度 | 任务 | 位置 | 状态 | 备注 |
|---|---|---|---|---|---|
| T0-01 | T0 | 停掉 `create()` 的时间戳注入；`seed.ts` 里手写的 `created_at/updated_at` 一并删 | `web/backend/src/eadaf/EADAFClient.ts`、`web/backend/src/scripts/seed.ts` | 已完成 | 18 实体建→删烟雾 **18/18** 通过 |
| T0-02 | T0 | 故检结卡：`handleSave` 之后补 `submitWorkCard` | `InspectionBoard.tsx` | 已完成 | 悬浮按钮改为「保存结果」；header「提交结果」= 保存 + 结卡 |
| T0-03 | T0 | 故检处置写回：`updatePart(disposal_result)` + 委外/报废 | `InspectionDisposal.tsx` | 已完成 | 写回零件、委外单、报废记录；缺件写入物料呼叫；流转条码走浏览器打印 |
| T0-04 | T0 | 委外单：`outsource_status` 改 `created`；`GET /outsource` 改 `workCardId` 过滤 | `op.routes.ts`、`repositories.ts` | 已完成 | 去掉伪造的 `send_date`；按工卡查询已可用 |
| T0-05 | T0 | 收发库存：补 `stock_id`、类型用 `stock_in/out`、同步 `LineStockItem.quantity` | `ReceiveBoard.tsx`、`op.routes.ts`、`repositories.ts` | 已完成 | 流水 + 库存数量同一次请求落库；T0-09 修好后“库存行不存在则补建”也通了 |
| T0-06 | T0 | 检测项挂接：种子写 `work_step_id`/`part_code`；`listByWorkCard` 加 `wbs_node_id` 兜底 | `seed.ts`、`repositories.ts` | 已完成 | 已加按 `wbs_node_id` 的兜底查询，历史种子数据也能显示 |
| T0-07 | T0 | 槽位 `filled→occupied`；分拣板接 `TrayTemplate.workstation_type` | `op.routes.ts`、`SortingBoard.tsx` | 已完成 | 后端加枚举白名单；分拣板读模版槽位，模版没配槽位时退回 6 格 |
| T0-08 | T0 | 写 parse/store 脚本并发布 `fmms/digital_measure` 采集管道 | EADAF 采集管道（配置） | 已完成 | 用管道管理 API 写入脚本并发布；BFF 回调实测 200，`InspectionRecord` 32→34（测试行已删）。映射假设：`context.workCardId` 为 uuid 才落 `work_card_id`，否则留空 |
| T0-09 | T0 | 修 Create 校验自相矛盾（`created_at` 必填又拒写） | EADAF `operationParameterSchemas.js` | 已完成 | **改的是平台代码，不是改模型绕过**：新增系统字段清单，body 结构生成时不再把它们列为必填（见 §5.1）。4 个实体的 `nullable` 已改回 `false`，实测 18/18。附带：`LineStock` 还需 `stock_type` ∈ `part_temp/pending_outsource/scrap` 且 `is_active` 必填 → 词表差异归 T1-05 |
| T1-01 | T1 | 会话生命周期：过期检查 + refresh + 登出同步 + `pendingLogins` TTL + 生产 Cookie `Secure` + `/auth/me` 真验签 | `auth/*`、`auth.routes.ts` | 已完成 | 提前 60s 续期；登出验 `logout_token`。会话写入 `web/backend/data/sessions.json`，重启可续 |
| T1-02 | T1 | WS 握手鉴权、心跳、指数退避重连、按 `station_code` 订阅 | `ws/opHub.ts`、`hooks/useOpWs.ts` | 已完成 | 未登录直接 4401（实测）；30s ping/pong；1s→30s 退避重连，不再 `location.reload`；故检板改用工位号订阅 |
| T1-03 | T1 | 错误不再吞成空数据；401 跳登录；列表/看板显示错误态 | 各页面、`api/request.ts` | 已完成 | 401 统一跳登录（5s 防抖）；工卡列表/工位选择/分拣/收发/工卡状态都改成显示"加载失败：原因" |
| T1-04 | T1 | 分页透传 `page/size`，或用 `total` 分页 | `op.routes.ts`、`WorkCardList.tsx` | 已完成 | 工卡列表按页拼接，最多 5 页。`skip` 若被忽略、下一页与上一页相同则停止 |
| T1-05 | T1 | 数据治理：清 mock 工卡、状态/工位类型归一、progress 转 number、`stock_type` 词表统一 | EADAF 数据 + 常量 | 已完成 | 删 21 张 `source=mock`（连带 98 个零件、2 条检测记录）；`processing→in_progress`、`unaccepted→pending`、`receiving_dispatch→receive_send`；`progress` 在 BFF 出口转 number；`fmms:StockType` 枚举统一为 `outsource_cache/staging/scrap` 并迁移存量 2 行 |
| T1-06 | T1 | 种子改幂等 | `seed.ts` | 已完成 | 按业务编号判重（工位/工步/工卡/检测项/工具/线边库），零件与检测记录按工卡判重；连跑两次实体计数不变 |
| T1-07 | T1 | 物化巡检：模型 vs 物理列对比脚本 | EADAF `scripts/check-materialization-drift.js` | 已完成 | 新增脚本，`node scripts/check-materialization-drift.js fmms:` → 无漂移退出 0，有漂移退出 1 并列缺列 |
| T2-01 | T2 | 拍照上传接 EADAF storage | `InspectionBoard.tsx` | 已完成 | 不合格项拍照上传，object id 随检测结果保存，可预览 |
| T2-02 | T2 | 死代码/死依赖清理（未调用的 api、`jsonwebtoken`） | 多处 | 已完成 | 去掉未调用的前端查询函数和 `jsonwebtoken`。托盘、存储、AGV 路由仍在用，未删。`PhotoPreview` 改为拍照预览 |
| T2-03 | T2 | 文档里的 9527 全量替换；`EADAF数据结构设计-FMMS.md` 的 `OutsourceOrder` 段重写 | `docs/*` | 已完成 | 6 个文件已改为 29526/29527；委外单字段按现模型改写 |
| T2-04 | T2 | IPS → FMMS 工卡交接方式 | IPS `WorkCard` | 已完成 | 不再复制工卡。工位直接读写 IPS 工卡 |
| T2-05 | T2 | 采集字段映射（`results[].code` ↔ 检测项 `item_code`） | `collect.routes.ts` | 已完成 | 数字写入测量值。图片先上传存储，再把 object id 记到检测记录 |
| T2-06 | T2 | 工位客户端采集器旧逻辑下线（`localStorage.fmms_token`） | `app-workstation-client/electron/collector/` | 已完成 | 不再读旧 token，不再向 `/api/op/ingest` 推帧 |
| D-01 | — | 物化 `OutsourceOrder.workCardId` | EADAF | 已完成 | 建单可带工卡、可按工卡查 |
| D-02 | — | 物化 `TraySlot.slotStatus` | EADAF | 已完成 | `occupied/empty` 可写 |
| D-03 | — | BFF 采集回调 `POST /api/collect/measurement` + `GET /api/collect/ping` | `web/backend/src/routes/collect.routes.ts` | 已完成 | 无认证；上游失败如实返回 502 |
| D-04 | — | `INGEST_ROUTE` 改为 `IPS/digital_measure` | `packages/shared/src/constants.ts` | 已完成 | 管道写入 IPS 检验记录 |
| D-05 | — | 本文档重写为"计划 + 整改" | `docs/plans/admin接入新版EADAF.md` | 已完成 | — |

## 7. IPS 工卡

工位和排产共用 `IPS:production:WorkCard`。执行字段（进度、合格件数、不合格件数、接受人、工位类型）补在这张工卡上。BFF 对页面仍用原来的字段名，写入前换成 camelCase。不再有工卡复制钩子。

## 8. 采集回调（BFF 转发，已完成）

**决策：不改 EADAF 平台。** 在 FMMS 的 BFF 里加一个不做认证的回调接口，收下适配程序的裸 JSON，再用 BFF 自己的应用令牌转发给 EADAF 采集管道。

已实现：

- `POST /api/collect/measurement`（无认证）——`web/backend/src/routes/collect.routes.ts`
  - 校验：JSON 对象 + `taskId` + `status`；
  - 来源：`COLLECT_ALLOWED_IPS` 白名单，留空则全部拒绝；
  - 转发：`eadafClient.ingest('IPS/digital_measure', JSON, 'text/plain; charset=utf-8')`；
  - 上游失败返回 **502**（适配程序据此保留任务、面板提示"未送达"），不吞成 200。
- `GET /api/collect/ping` 探活。
- `INGEST_ROUTE` 为 `IPS/digital_measure`，写入 IPS 检验记录。

实测（本地起 BFF 5180）：

| 请求 | 结果 |
|---|---|
| `GET /api/collect/ping` | 200 |
| `POST` 缺 `taskId/status` | 400 |
| `POST` 正常体 | 管道已发布时应为 200；未发布时为 502。与任务表「已写入检测记录」不能同时当真，以当次响应为准 |

来源 IP：`COLLECT_ALLOWED_IPS` 留空则全部拒绝，不再默认放行。

适配程序侧：`callback.json` 的 `callbackUrl` 填 `http://<BFF 主机>:5180/api/collect/measurement`。

为什么不在 EADAF 上放开认证：它的采集入口三处硬编码要求应用令牌（路由 `authRequired`、控制器强制 `authContext.kind === 'application'`、服务层 `assertApplicationAllowed`），要放开就得改平台代码；按决定本阶段不动 EADAF。

下一阶段：确认管道发布后本接口稳定返回 200，并补失败重试与原始报文留存。字段映射已在 BFF 完成。

## 9. 待确认

1. 工位应用令牌需要能调用 `IPS` 前缀的数据服务。FMMS 应用的数据范围已包含域 `IPS`。
2. **`IPS/digital_measure` 是否已发布**以当场 `POST /api/collect/measurement` 为准：200 已发布，502 未发布。
