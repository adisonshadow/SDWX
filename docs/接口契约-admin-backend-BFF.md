# admin/backend BFF 接口契约

> admin/backend 是无数据库的 BFF（Backend-for-Frontend），所有数据存取经 EADAF。本文档定义 BFF 对前端（admin/frontend /OPWeb）与工位客户端（app-workstation-client）暴露的 REST + WebSocket 接口。

---

## 1. 通用约定

### 1.1 Base URL
- 开发：`http://localhost:5180`
- REST API 前缀：`/api/op`
- WebSocket：`ws://localhost:5180/ws/op`

### 1.2 认证（双 token 分离）

| 角色 | token 来源 | 用途 |
|------|-----------|------|
| **用户 token** | SSO 登录后获得（EADAF 颁发） | 前端请求 BFF 时携带，BFF 校验用户身份 |
| **应用 token** | BFF 用 app_id+app_secret 向 EADAF 换取 | BFF 访问 EADAF 数据/采集/存储 API 时使用 |

- 前端所有 `/api/op/*` 请求须带 `Authorization: Bearer {用户token}`
- BFF 校验用户 token（调 EADAF `GET /api/v1/auth/check` 或本地用 JWT salt 校验）
- BFF 访问 EADAF 时自动注入**应用 token**（前端无感知）

### 1.3 响应格式
统一 JSON 封装：
```json
{ "code": 200, "message": "success", "data": {...} }
```
错误：
```json
{ "code": 400, "message": "错误描述", "data": null }
```

### 1.4 鉴权失败
- 未携带/无效 token：`401 { code: 401, message: "未认证" }`
- BFF 访问 EADAF 401：自动刷新应用 token 后重试一次

---

## 2. SSO 认证接口

### 2.1 获取 SSO 配置
```
GET /auth/sso-config
```
**响应 data：**
```json
{
  "eadaf_frontend_url": "http://localhost:9527",
  "application_id": "10000000-0001-4000-8000-000000000006",
  "callback_url": "http://localhost:5180/auth/callback",
  "redirect_mode": "POST_REDIRECT"
}
```
> 前端据此构造 SSO 登录跳转 URL：`{eadaf_frontend_url}/auth/login?app={application_id}`

### 2.2 SSO 回调（POST 跳转模式）
```
POST /auth/callback
Content-Type: application/x-www-form-urlencoded

access_token=xxx&refresh_token=xxx&user_info={...json...}
```
**处理：** 校验 JWT（用 SSO_JWT_SALT），存储用户会话，重定向到前端 `/auth/callback?token=xxx`。

### 2.3 SSO 回调（HEADER 模式）
```
GET /auth/callback?access_token=xxx&refresh_token=xxx&user_info=...&redirect_mode=HEADER_REDIRECT
```
**处理：** 同上，从 URL 参数读取。

### 2.4 检查登录状态
```
GET /auth/check
Authorization: Bearer {用户token}
```
**响应：** 200 = 有效；401 = 无效。代理 EADAF `GET /api/v1/auth/check`。

### 2.5 登出
```
POST /auth/logout
```
**处理：** 清理 BFF 侧用户会话（EADAF 侧登出流程待确认）。

### 2.6 当前用户信息
```
GET /auth/me
Authorization: Bearer {用户token}
```
**响应 data：** SSO 用户信息（user_id, username, name, email, department_id 等）。

---

## 3. 工位接口

### 3.1 工位列表
```
GET /api/op/workstations?type={workstation_type}
```
**响应 data：** `Workstation[]`（按 type 可选过滤）

### 3.2 工位详情
```
GET /api/op/workstations/:code
```

---

## 4. 工卡接口

### 4.1 工卡列表
```
GET /api/op/workcards?workstation_type={type}&status={status}&page=1&size=20
```
**参数：**
- `workstation_type`（可选）：按工位类型过滤（前端用当前工位类型）
- `status`（可选）：`unaccepted`/`pending`/`in_progress`/`completed`

**响应 data：**
```json
{
  "items": [WorkCard],
  "total": 42
}
```

### 4.2 工卡详情
```
GET /api/op/workcards/:id
```
**响应 data：**
```json
{
  "work_card": WorkCard,
  "wbs_node": WbsNode,
  "parts": [WorkCardPart],
  "inspection_items": [InspectionItem],
  "work_steps": [WorkStep]
}
```

### 4.3 接受工卡
```
POST /api/op/workcards/:id/accept
Authorization: Bearer {用户token}
```
**处理：** 状态→`in_progress`，记录 accept_time、operator_id/name（从用户 token 取）。
**响应 data：** 更新后的 WorkCard。

### 4.4 更新进度
```
PATCH /api/op/workcards/:id/progress
Body: { "progress": 65 }
```

### 4.5 提交工卡执行结果
```
POST /api/op/workcards/:id/submit
Authorization: Bearer {用户token}
```
**处理：** 聚合执行结果，状态→`completed`，上报（Mock PCS 记录）。

### 4.6 零部件列表
```
GET /api/op/workcards/:id/parts
```
**响应 data：** `WorkCardPart[]`

### 4.7 更新零部件状态/处置
```
PATCH /api/op/parts/:partId
Body: { "status": "qualified", "disposal_result": "qualified" }
```

---

## 5. 检测接口（故检工位）

### 5.1 检测项列表
```
GET /api/op/inspection/:partId/items
```
**响应 data：** `InspectionItem[]`（含标准值、公差、采集方式、绑定工具）

### 5.2 提交检测结果
```
POST /api/op/inspection/records
Body: {
  "part_id": "...",
  "inspection_item_id": "...",
  "measured_value": 25.03,
  "result": "qualified",
  "collection_type": "auto",
  "auto_judged": true,
  "device_raw": "...",
  "photo_object_id": "..."   // 可选，有拍照时
}
```
**响应 data：** 创建的 InspectionRecord。

### 5.3 设置零件处置
```
POST /api/op/parts/:partId/disposal
Body: { "disposal_result": "repair" }
```

---

## 6. 采集接口（Electron → BFF）

### 6.1 提交采集原始帧
```
POST /api/op/ingest
Authorization: Bearer {用户token}
Content-Type: application/json

Body: CollectFrame {
  "tool_code": "MT-001",
  "workstation_code": "OP02-1",
  "operator_id": "...",
  "work_card_id": "...",
  "part_id": "...",
  "inspection_item_id": "...",
  "raw": "<base64 编码的原始字节>",
  "ts": "2026-07-10T08:30:00.000Z"
}
```
**处理：** BFF 注入应用 token → `POST /api/v1/ingest/fmms/measurementIngest`（EADAF 采集管道）。≤1MB 分批。BFF 同时解析（如 parse_template 可用）并 WS 回显 `collect.frame` 事件。
**响应 data：**
```json
{ "processed": 1, "measured_value": 25.03, "result": "qualified" }
```

---

## 7. 文件存储接口（代理 EADAF storage）

### 7.1 上传
```
POST /api/op/storage/upload
Content-Type: multipart/form-data
Body: file=<二进制>
```
**处理：** BFF 注入应用 token → EADAF `POST /api/v1/storage/objects/upload`。
**响应 data：** `{ "object_id": "...", "url": "..." }`

### 7.2 下载/预览
```
GET /api/op/storage/:objectId/download
GET /api/op/storage/:objectId/preview
```
代理 EADAF 对应接口，流式返回。

---

## 8. 测量工具接口

### 8.1 工具列表
```
GET /api/op/tools?workstation_code={code}
```

### 8.2 注册/更新工具
```
POST /api/op/tools
PATCH /api/op/tools/:id
```

### 8.3 工具状态（在线/离线）
```
GET /api/op/tools/:id/status
```
> 在线状态由 Electron 采集服务维护，经 WS `tool.status` 推送。BFF 内存缓存最近状态。

---

## 9. 异常呼叫接口

### 9.1 发起呼叫
```
POST /api/op/call
Body: {
  "call_type": "tool_fault",
  "callee_type": "technician",
  "description": "三坐标通信中断"
}
```
**处理：** 写 NotificationLog（caller 从用户 token 取，workstation_code 从当前会话/参数取），WS 推送 `call.received`。

### 9.2 呼叫列表
```
GET /api/op/calls?workstation_code={code}&status={status}
```

---

## 10. 修理工位接口

### 10.1 委外管理
```
POST /api/op/outsource          // 创建委外单（拆单）
GET  /api/op/outsource?card_id=...
PATCH /api/op/outsource/:id     // 更新状态（发货/返回）
```

### 10.2 报废登记
```
POST /api/op/scrap
Body: { "work_card_id":"...", "items":[ {"part_id":"...","quantity":1,"scrap_type":"...","reason":"..."} ] }
```

### 10.3 修理记录
```
POST /api/op/disposal/repair
Body: { "part_id":"...", "method":"...", "equipment_id":"...", "process":"...", "conclusion":"..." }
```

---

## 11. 收发工位接口

### 11.1 线边库
```
GET /api/op/inventory              // 库存列表
GET /api/op/inventory/:stockId/items
```

### 11.2 出入库
```
POST /api/op/inventory/transaction
Body: {
  "line_stock_id":"...", "transaction_type":"inbound", "inventory_category":"staging",
  "material_code":"...", "quantity":10, "unit":"件", "related_barcode":"...", "work_card_id":"..."
}
```

### 11.3 委外收发
```
POST /api/op/outsource/ship       // 委外发货
POST /api/op/outsource/return     // 委外返回验收
```

---

## 12. 形迹模版接口（分拣工位，只读）

### 12.1 模版列表
```
GET /api/op/tray-templates?card_id={workCardId}
```

### 12.2 模版详情（含槽位）
```
GET /api/op/tray-templates/:id
```
**响应 data：** `{ template: TrayTemplate, slots: TraySlot[] }`

### 12.3 更新槽位状态（运行时有/无料）
```
PATCH /api/op/tray-slots/:slotId
Body: { "filled": true }
```

---

## 13. WebSocket 接口

### 13.1 连接
```
ws://localhost:5180/ws/op?token={用户token}&workstation_code={code}
```

### 13.2 消息格式
```json
{ "type": "事件名", "payload": {...} }
```

### 13.3 事件

| 事件 | 触发 | payload |
|------|------|---------|
| `workcard.pushed` | 新工卡下发（mockPCS） | `{ work_card: WorkCard }` |
| `workcard.status.changed` | 工卡状态变更 | `{ id, status, operator }` |
| `workcard.progress` | 进度更新 | `{ id, progress }` |
| `part.status.changed` | 零部件状态变更 | `{ id, status, disposal_result }` |
| `call.received` | 异常呼叫 | NotificationLog |
| `call.status.changed` | 呼叫状态变更 | `{ id, status }` |
| `collect.frame` | 采集数据回显 | `{ tool_code, measured_value, result, raw, ts }` |
| `tool.status` | 工具在线状态 | `{ tool_code, online }` |
| `tool.alarm` | 工具报警 | `{ tool_code, alarm, message }` |
| `agv.status` | AGV 任务状态（Mock） | `{ task_id, status }` |

### 13.4 客户端→服务端消息
客户端可发送 `{ "type": "subscribe", "payload": { "workstation_code": "OP01" } }` 订阅特定工位事件。

---

## 14. 状态码

| code | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证 / token 无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 413 | 采集数据超 1MB |
| 500 | 服务器错误 |
| 502 | EADAF 调用失败 |
