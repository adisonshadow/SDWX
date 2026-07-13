# EADAF 数据结构设计 — FMMS 故检修理管理系统

> **用途**：本文档定义 FMMS 在 EADAF 平台上的业务数据模型。其中 **§3 已有实体**直接复用；**§4 扩展字段**与 **§5 新建实体**为需在 EADAF 中补充/创建的内容（可用 EADAF AI 建模）。
>
> **应用信息**：code = `FMMS`，application_id = `10000000-0001-4000-8000-000000000006`
> **EADAF 开发地址**：`http://localhost:9527/`
> **API 文档**：`http://localhost:9527/public/applications/FMMS/api-docs`

---

## 1. EADAF API 调用约定

### 1.1 routePath 规则
每个实体自动生成 4 个 routePath，格式为 `{domain}/{Entity}{Operation}`：

| 操作 | Operation 后缀 | HTTP 方法 | 说明 |
|------|---------------|-----------|------|
| 查询 | `Find` | GET | 分页查询，参数 `limit`/`skip`/`filter`/`status` |
| 创建 | `Create` | POST | body 为记录字段 |
| 更新 | `Update` | PATCH | 单字段更新 `{id, field, set}` |
| 删除 | `Delete` | DELETE | 按 `id` 删除 |

> ⚠️ 当前**无 `aggregate` 操作**；统计需 find 后客户端聚合或后续申请。

### 1.2 命名规范
- `production` / `equipment` 域：**snake_case**（如 `created_at`、`work_card_id`）
- `wbs` 域：**camelCase**（如 `wbsCode`、`parentId`）
- **本设计新增实体统一放入 `production` 域，使用 snake_case**，与已有 production 实体保持一致。

### 1.3 调用方式
```
GET  /api/v1/data/{routePath}?limit=20&skip=0&filter={"status":"in_progress"}
POST /api/v1/data/{routePath}          body: { ...字段 }
PATCH /api/v1/data/{routePath}         body: { id, field, set }
DELETE /api/v1/data/{routePath}?id={id}
Header: Authorization: Bearer {application_token}
```

响应统一封装：`{ code: 200, message: "success", data: {...} }`

### 1.4 文件存储
- 上传：`POST /api/v1/storage/objects/upload`（multipart，字段 `bucketId` + `file`）→ 返回 objectId
- 下载：`GET /api/v1/storage/objects/{objectId}/download`
- 预览：`GET /api/v1/storage/objects/{objectId}/preview`
- 实体中以 `*_object_id` 字段存储 objectId（如检测图片、托盘照片）

---

## 2. 实体关系总览

```
Workstation (工位)
  └─ MeasuringTool (测量工具, workstation_code 关联)

WorkCard (工卡)
  ├─ workstation_type (分发依据)
  ├─ wbs_code → WbsNode
  ├─ WorkCardPart (零部件) ──┬─ disposal_result
  │                          ├─ InspectionItem (检测项)
  │                          │    └─ InspectionRecord (实测记录 + 图片)
  │                          ├─ ScrapRecord (报废)
  │                          └─ OutsourceOrder (委外, part_ids 关联)
  └─ WorkStep (工步, 通用工序步骤)

LineStock (线边库)
  ├─ LineStockItem (物料项)
  └─ InventoryTransaction (出入库流水)

TrayTemplate (形迹模版)
  └─ TraySlot (槽位)

NotificationLog (呼叫日志, 独立)
```

---

## 3. 已有实体清单（直接复用，无需新建）

以下 11 个实体已在 EADAF 创建，FMMS 直接消费：

### production 域（snake_case）
| 实体 | routePath 前缀 | 说明 | 关键字段 |
|------|---------------|------|---------|
| WorkCard | `production/WorkCard` | 工卡 | card_no, status, work_order_id |
| WorkStep | `production/WorkStep` | 工步 | work_card_id, step_no, standard_value |
| InspectionRecord | `production/InspectionRecord` | 检验记录 | work_step_id, measuring_tool_id, measured_value |
| MeasuringTool | `production/MeasuringTool` | 测量工具 | code, tool_type, status |
| LineStock | `production/LineStock` | 线边库 | code, name, status |
| LineStockItem | `production/LineStockItem` | 线边库物料项 | line_stock_id, material_code, quantity |

### equipment 域（snake_case）
| 实体 | routePath 前缀 | 说明 |
|------|---------------|------|
| Equipment | `equipment/Equipment` | 设备资料 (修理设备等) |
| Maintenance | `equipment/Maintenance` | 设备维护 |
| RunLog | `equipment/RunLog` | 设备运行状态日志 |

### wbs 域（camelCase）
| 实体 | routePath 前缀 | 说明 |
|------|---------------|------|
| Node | `wbs/Node` | WBS 节点 (L1-L5 层级) |
| DataHistory | `wbs/DataHistory` | WBS 数据历史 (溯源) |

---

## 4. 已有实体扩展字段（请在 EADAF 给已有模型补充字段）

### 4.1 WorkCard（工卡）补充字段

> 工卡当前缺少工位分发依据、操作员绑定、进度等第一阶段必需字段。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `workstation_type` | enum | 是 | — | `sorting` / `inspection_small` / `inspection_large` / `repair` / `receive_send`；工卡分发到工位的依据 |
| `operator_id` | string | 否 | — | 当前绑定操作员 ID |
| `operator_name` | string | 否 | — | 当前操作员姓名 |
| `accept_time` | datetime | 否 | — | 任务接受时间 |
| `progress` | number | 否 | 0 | 进度百分比 0-100 |
| `priority` | number | 否 | 0 | 优先级（数值越大越优先） |
| `source` | enum | 否 | `mock` | `pcs` / `mock`（数据来源） |
| `wbs_code` | string | 否 | — | 关联 WBS L5 节点（→ Node.wbsCode） |

### 4.2 MeasuringTool（测量工具）补充字段

> 当前工具实体只有档案信息，缺少 Electron 连接硬件所需的连接参数。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `protocol` | enum | 否 | — | `serial` / `modbus_rtu` / `modbus_tcp` / `tcp_custom` / `usb_hid` |
| `port` | string | 否 | — | 串口路径，如 `COM3` / `/dev/ttyUSB0` |
| `baud_rate` | number | 否 | 9600 | 波特率 |
| `data_bits` | number | 否 | 8 | 数据位 7/8 |
| `stop_bits` | number | 否 | 1 | 停止位 1/2 |
| `parity` | enum | 否 | `none` | `none` / `even` / `odd` |
| `ip_address` | string | 否 | — | Modbus TCP / TCP 自定义协议 IP |
| `tcp_port` | number | 否 | — | TCP 端口 |
| `slave_id` | number | 否 | — | Modbus 从站地址 |
| `vendor_protocol` | string | 否 | — | 厂商协议标识（驱动加载依据） |
| `workstation_code` | string | 否 | — | 所属工位编号（→ Workstation.code） |
| `parse_template` | JSON | 否 | — | 数据解析模板（字段映射、分隔符等） |

### 4.3 InspectionRecord（检验记录）补充字段

> 当前检验记录缺少与零部件/检测项的关联，以及图片、自动判异标志。

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `part_id` | uuid | 否 | — | → WorkCardPart.id（关联到具体零件） |
| `inspection_item_id` | uuid | 否 | — | → InspectionItem.id（关联到具体检测项） |
| `photo_object_id` | string | 否 | — | EADAF storage 文件 ID（检测照片） |
| `auto_judged` | boolean | 否 | false | 是否系统自动判异 |
| `collection_type` | enum | 否 | `manual` | `auto` / `manual`（采集方式） |
| `device_raw` | string | 否 | — | 设备原始采集数据（留痕） |

---

## 5. 新建实体设计（9 个，请在 EADAF 创建）

> 均放入 `production` 域，snake_case 命名。每个实体 EADAF 自动生成 4 个 routePath。
> 每个实体建议含 `id` (uuid 主键) + `created_at` / `updated_at` 时间戳。

---

### 5.1 Workstation（工位）

**用途**：工位终端配置——工位编号、类型、产线、显示模式。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `code` | string | ✅ | — | 工位编号（如 OP01、OP02-1），唯一 |
| `name` | string | ✅ | — | 工位名称（如"分拣工位"） |
| `workstation_type` | enum | ✅ | — | `sorting` / `inspection_small` / `inspection_large` / `repair` / `receive_send` |
| `production_line` | string | ❌ | — | 产线编号（如 `GJJ-XL-01`） |
| `display_mode` | enum | ❌ | `dual` | `single` / `dual`（是否双屏） |
| `status` | enum | ✅ | `active` | `active` / `inactive` |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | 创建时间 |
| `updated_at` | datetime | ✅ | — | 更新时间 |

**routePath**：`production/Workstation{Find|Create|Update|Delete}`

---

### 5.2 WorkCardPart（工卡零部件）

**用途**：工卡内零部件级任务分解——逐件管理检测/处置状态（技术方案核心实体）。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `work_card_id` | uuid | ✅ | — | → WorkCard.id |
| `part_code` | string | ✅ | — | 零件编码 |
| `part_name` | string | ✅ | — | 零件名称 |
| `category` | string | ❌ | — | 分组类别（如"缸体"、"活塞"） |
| `quantity` | number | ✅ | 1 | 数量 |
| `wbs_code` | string | ❌ | — | → Node.wbsCode |
| `status` | enum | ✅ | `pending` | `pending`(待处理) / `inspecting`(检测中) / `qualified`(合格) / `unqualified`(不合格) / `repaired`(已修复) / `outsourced`(已委外) / `scrapped`(已报废) |
| `disposal_result` | enum | ❌ | — | `qualified`(合格) / `repair`(修理) / `outsource`(委外) / `scrap`(报废) |
| `scan_barcode` | string | ❌ | — | 扫码条码（用于扫码定位） |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**routePath**：`production/WorkCardPart{Find|Create|Update|Delete}`

---

### 5.3 InspectionItem（检测项）

**用途**：驱动故检副屏检测表——定义每个零件/工卡的检测项，含标准值、公差、采集方式、绑定测量工具、是否需拍照。

> **与已有 WorkStep 的区别**：WorkStep 语义偏"工序步骤"（step_no + 标准值/公差），用于修理等通用工步。InspectionItem 是故检专用的完整检测项定义（绑零件、绑工具、采集方式、拍照要求），二者并存不冲突。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `work_card_id` | uuid | ✅ | — | → WorkCard.id |
| `part_id` | uuid | ❌ | — | → WorkCardPart.id（部分检测项不绑具体零件） |
| `item_code` | string | ✅ | — | 检测项编码 |
| `item_name` | string | ✅ | — | 检测项名称（如"内径测量"） |
| `feature` | string | ❌ | — | 检测特征（如"内径"、"外径"、"表面") |
| `nominal_value` | number | ❌ | — | 标准值（规格值） |
| `upper_tolerance` | number | ❌ | — | 上偏差 |
| `lower_tolerance` | number | ❌ | — | 下偏差 |
| `unit` | string | ❌ | — | 计量单位（mm、μm 等） |
| `data_collection_type` | enum | ✅ | — | `auto`(自动采集) / `manual`(手动判定) |
| `inspection_tool_code` | string | ❌ | — | → MeasuringTool.code（`auto` 时必填） |
| `require_photo` | boolean | ❌ | false | 是否需要拍照 |
| `manual_only` | boolean | ❌ | false | 是否仅手动判定 |
| `order_no` | number | ❌ | — | 排序序号 |
| `status` | enum | ✅ | `pending` | `pending` / `inspecting` / `done` |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**判异规则**（前端/BFF 实现）：`nominal_value + lower_tolerance ≤ 实测值 ≤ nominal_value + upper_tolerance` → 合格，否则不合格。

**routePath**：`production/InspectionItem{Find|Create|Update|Delete}`

---

### 5.4 OutsourceOrder（委外单）

**用途**：修理工位委外管理——委外零件按委外方拆单，生成委托单编码，支持打印。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `order_no` | string | ✅ | — | 委托单编码（唯一，系统生成） |
| `source_card_id` | uuid | ❌ | — | → WorkCard.id（来源工卡） |
| `outsource_party` | string | ✅ | — | 委外方名称 |
| `part_ids` | JSON | ❌ | `[]` | 零件 id 数组（string[]） |
| `status` | enum | ✅ | `pending` | `pending`(待发) / `shipped`(已发) / `in_transit`(运输中) / `returned`(已返回) / `accepted`(已验收) |
| `ship_date` | date | ❌ | — | 发货日期 |
| `return_date` | date | ❌ | — | 返回日期 |
| `operator` | string | ❌ | — | 经办人 |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**routePath**：`production/OutsourceOrder{Find|Create|Update|Delete}`

---

### 5.5 ScrapRecord（报废记录）

**用途**：修理工位 + 收发工位的报废登记——批量报废、报废类型、原因、关联线边报废账。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `work_card_id` | uuid | ❌ | — | → WorkCard.id |
| `part_id` | uuid | ❌ | — | → WorkCardPart.id |
| `part_name` | string | ❌ | — | 零件名称（冗余便于查询） |
| `quantity` | number | ✅ | — | 报废数量 |
| `scrap_type` | enum | ❌ | — | `mandatory_replace`(必换件) / `life_issue`(寿命问题) / `inspection_confirmed`(故检确认) / `post_repair`(修后确认) |
| `reason` | string | ❌ | — | 报废原因 |
| `operator` | string | ❌ | — | 操作人 |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**routePath**：`production/ScrapRecord{Find|Create|Update|Delete}`

---

### 5.6 InventoryTransaction（出入库流水）

**用途**：收发工位出入库操作记录。与 LineStock（库存快照）/ LineStockItem（物料项快照）配合：LineStock/Item 是当前余量，InventoryTransaction 是逐笔流水。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `line_stock_id` | uuid | ❌ | — | → LineStock.id |
| `transaction_type` | enum | ✅ | — | `inbound`(入库) / `outbound`(出库) |
| `inventory_category` | enum | ❌ | — | `outsource_cache`(待委外缓存) / `staging`(零件暂存) / `scrap`(报废) |
| `material_code` | string | ✅ | — | 物料编码 |
| `material_name` | string | ❌ | — | 物料名称 |
| `quantity` | number | ✅ | — | 数量 |
| `unit` | string | ✅ | — | 计量单位 |
| `related_barcode` | string | ❌ | — | 关联载具/零件条码 |
| `work_card_id` | uuid | ❌ | — | → WorkCard.id |
| `operator` | string | ❌ | — | 操作人 |
| `transaction_time` | datetime | ✅ | — | 交易时间 |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |

**routePath**：`production/InventoryTransaction{Find|Create|Update|Delete}`

---

### 5.7 NotificationLog（呼叫日志）

**用途**：异常呼叫记录。第一阶段工位端发起呼叫并记录；后续阶段通知接收客户端消费。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `workstation_code` | string | ✅ | — | 呼叫方工位编号 |
| `caller_id` | string | ✅ | — | 呼叫人 ID |
| `call_type` | enum | ✅ | — | `tool_fault`(测量工具故障) / `equipment_fault`(修理设备故障) / `tech_help`(技术求助) / `personnel`(人员异常) / `material`(物料异常) |
| `callee_type` | enum | ❌ | — | `technician`(技术员) / `operator_lead`(操作员组长) |
| `description` | string | ❌ | — | 问题描述 |
| `status` | enum | ✅ | `pending` | `pending`(待处理) / `accepted`(已接受) / `resolved`(已解决) |
| `accepted_at` | datetime | ❌ | — | 接受时间 |
| `resolved_at` | datetime | ❌ | — | 解决时间 |
| `created_at` | datetime | ✅ | — | |

**routePath**：`production/NotificationLog{Find|Create|Update|Delete}`

---

### 5.8 TrayTemplate（形迹托盘模版）

**用途**：分拣工位副屏的形迹可视化模版。第一阶段只读渲染（模版由 EADAF/管理端预制）；Web 编辑器属 `/admin` 管理后台（后续阶段）。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `template_code` | string | ✅ | — | 模版编码（按托盘编码，非实例），唯一 |
| `name` | string | ✅ | — | 模版名称 |
| `tray_photo_object_id` | string | ❌ | — | 托盘照片的 EADAF storage objectId |
| `version` | number | ❌ | 1 | 版本号 |
| `status` | enum | ✅ | `draft` | `draft`(草稿) / `published`(已发布) |
| `remark` | string | ❌ | — | 备注 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**routePath**：`production/TrayTemplate{Find|Create|Update|Delete}`

---

### 5.9 TraySlot（模版槽位）

**用途**：形迹模版上每个槽位的形状定义与物料绑定。运行时 `filled` 字段记录有/无料状态。

| 字段名 | 类型 | 必填 | 默认值 | 枚举/说明 |
|--------|------|------|--------|-----------|
| `id` | uuid | ✅ | — | 主键 |
| `template_id` | uuid | ✅ | — | → TrayTemplate.id |
| `slot_code` | string | ✅ | — | 槽位编码 |
| `material_code` | string | ✅ | — | 物料类型编码（绑定类型，非实例） |
| `material_name` | string | ❌ | — | 物料名称 |
| `shape_type` | enum | ❌ | — | `circle`(圆形) / `square`(方形) / `custom`(自定义) |
| `coordinates` | JSON | ❌ | — | 坐标，如 `{x, y, r}` 或 `{points: [[x,y],...]}` |
| `filled` | boolean | ❌ | false | 运行时有料状态 |
| `order_no` | number | ❌ | — | 排序序号 |
| `created_at` | datetime | ✅ | — | |
| `updated_at` | datetime | ✅ | — | |

**routePath**：`production/TraySlot{Find|Create|Update|Delete}`

---

## 6. 采集管道配置（EADAF 侧非实体配置）

### 6.1 创建采集管道
- **routePath**：`fmms/measurementIngest`（建议命名）
- **用途**：接收 Electron 采集服务转发的测量工具原始数据帧（经 BFF）
- **接入方式**：`POST /api/v1/ingest/fmms/measurementIngest`
- **Content-Type**：`application/octet-stream`（原始字节）或 `application/json`
- **大小限制**：单次 ≤ 1MB（超限 BFF 分批）
- **allowlist**：将应用 id `10000000-0001-4000-8000-000000000006` 加入允许列表

### 6.2 业务 API 访问策略
- 确认 `production/*` 所有服务访问策略为**「无限制」**（否则 application token 调用返回 403）

### 6.3 应用 Token 引导
- 确认 `POST /api/v1/applications/token`（app_id + app_secret 换 JWT）可用方式：
  - 方式 A：该端点已放开（无需已有 token）
  - 方式 B：管理员提供一次性引导 token
- token 默认有效期 24h，BFF 会缓存并在过期前 ~5min 自动刷新

---

## 7. 完整 routePath 速查表

### 已有实体（复用）
| 实体 | Find | Create | Update | Delete |
|------|------|--------|--------|--------|
| WorkCard | `production/WorkCardFind` | `production/WorkCardCreate` | `production/WorkCardUpdate` | `production/WorkCardDelete` |
| WorkStep | `production/WorkStepFind` | ... | ... | ... |
| InspectionRecord | `production/InspectionRecordFind` | ... | ... | ... |
| MeasuringTool | `production/MeasuringToolFind` | ... | ... | ... |
| LineStock | `production/LineStockFind` | ... | ... | ... |
| LineStockItem | `production/LineStockItemFind` | ... | ... | ... |
| Equipment | `equipment/EquipmentFind` | ... | ... | ... |
| Maintenance | `equipment/MaintenanceFind` | ... | ... | ... |
| RunLog | `equipment/RunLogFind` | ... | ... | ... |
| Node | `wbs/NodeFind` | `wbs/NodeCreate` | `wbs/NodeUpdate` | `wbs/NodeDelete` |
| DataHistory | `wbs/DataHistoryFind` | ... | ... | ... |

### 新建实体（待 EADAF 创建）
| 实体 | Find | Create | Update | Delete |
|------|------|--------|--------|--------|
| Workstation | `production/WorkstationFind` | `production/WorkstationCreate` | `production/WorkstationUpdate` | `production/WorkstationDelete` |
| WorkCardPart | `production/WorkCardPartFind` | `production/WorkCardPartCreate` | `production/WorkCardPartUpdate` | `production/WorkCardPartDelete` |
| InspectionItem | `production/InspectionItemFind` | `production/InspectionItemCreate` | `production/InspectionItemUpdate` | `production/InspectionItemDelete` |
| OutsourceOrder | `production/OutsourceOrderFind` | `production/OutsourceOrderCreate` | `production/OutsourceOrderUpdate` | `production/OutsourceOrderDelete` |
| ScrapRecord | `production/ScrapRecordFind` | `production/ScrapRecordCreate` | `production/ScrapRecordUpdate` | `production/ScrapRecordDelete` |
| InventoryTransaction | `production/InventoryTransactionFind` | `production/InventoryTransactionCreate` | `production/InventoryTransactionUpdate` | `production/InventoryTransactionDelete` |
| NotificationLog | `production/NotificationLogFind` | `production/NotificationLogCreate` | `production/NotificationLogUpdate` | `production/NotificationLogDelete` |
| TrayTemplate | `production/TrayTemplateFind` | `production/TrayTemplateCreate` | `production/TrayTemplateUpdate` | `production/TrayTemplateDelete` |
| TraySlot | `production/TraySlotFind` | `production/TraySlotCreate` | `production/TraySlotUpdate` | `production/TraySlotDelete` |

### 采集管道
| 用途 | routePath | 方法 |
|------|-----------|------|
| 测量数据采集 | `fmms/measurementIngest` | POST |

---

## 8. 待确认事项

| # | 事项 | 影响 |
|---|------|------|
| 1 | §4 扩展字段补充后字段名/类型是否与本文一致 | 代码层 repository 适配 |
| 2 | §5 新建实体命名（Workstation/WorkCardPart/InspectionItem 等）是否被 EADAF 接受 | routePath 命名 |
| 3 | `updateOne`/`Update` 操作是否支持单次多字段更新（当前语义为 `{id, field, set}` 单字段） | 批量更新场景需多次调用 |
| 4 | 业务 API 是否支持写操作（create 已确认支持） | 工卡接受/结果上报等写场景 |
| 5 | 采集管道 allowlist 是否已加入 FMMS 应用 | Electron 采集链路 |
| 6 | `production/*` 服务访问策略是否为「无限制」 | application token 调用是否 403 |
| 7 | `/api/v1/applications/token` 引导方式 | BFF 启动取 token |
| 8 | SSO 登出流程（当前 SSO 文档未覆盖） | 登出实现 |
