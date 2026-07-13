# EADAF 补充实体设计 — FMMS

> **用途**：EADAF 当前已有 6 个实体（WorkCard / Workstation / WbsNode / InspectionItem / MeasuringTool / LineStock）。以下补充实体供你在 EADAF 中创建。
>
> **命名规则**：域前缀 `fmms/`，字段 snake_case，与已有 6 实体风格一致。每个实体自动生成 4 个 routePath：`fmms/{Entity}{Create|Find|Update|Delete}`。

---

## 1. WorkCardPart（工卡零部件）

> 零部件级任务分解——每个零件的检测/处置状态。

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `card_id` | string(uuid) | 是 | → WorkCard.id |
| `part_code` | string | 是 | 零件编号 |
| `part_name` | string | 是 | 零件名称 |
| `quantity` | number | 是 | 数量，默认1 |
| `category` | string | 否 | 分组类别（如"缸体"、"活塞"） |
| `status` | string | 是 | `pending`(待处理) / `checking`(检测中) / `done`(检测完成) |
| `pass_count` | number | 否 | 合格数 |
| `fail_count` | number | 否 | 不合格数 |
| `disposal_result` | string | 否 | `qualified`(合格) / `repair`(修理) / `outsource`(委外) / `scrap`(报废) |
| `scan_barcode` | string | 否 | 扫码条码 |
| `wbs_node_id` | string(uuid) | 否 | → WbsNode.id |
| `remark` | string | 否 | 备注 |
| `created_at` | string(date-time) | 是 | |
| `updated_at` | string(date-time) | 是 | |

**routePath**：`fmms/WorkCardPart{Create|Find|Update|Delete}`

---

## 2. OutsourceOrder（委外单）

> 修理工位委外管理——按委外方拆单、生成委托单编码。

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `order_no` | string | 是 | 委托单编码（唯一，系统生成） |
| `source_card_id` | string(uuid) | 否 | 来源工卡 → WorkCard.id |
| `outsource_party` | string | 是 | 委外方名称 |
| `part_codes` | JSON | 否 | 零件编号数组 string[] |
| `status` | string | 否 | `pending`(待发) / `shipped`(已发) / `returned`(已返回) / `accepted`(已验收) |
| `ship_date` | string(date) | 否 | 发货日期 |
| `return_date` | string(date) | 否 | 返回日期 |
| `operator` | string | 否 | 经办人 |
| `remark` | string | 否 | 备注 |
| `created_at` | string(date-time) | 是 | |
| `updated_at` | string(date-time) | 是 | |

**routePath**：`fmms/OutsourceOrder{Create|Find|Update|Delete}`

---

## 3. ScrapRecord（报废记录）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `card_id` | string(uuid) | 否 | 来源工卡 |
| `part_code` | string | 否 | 零件编号 |
| `part_name` | string | 否 | 零件名称（冗余便于查询） |
| `quantity` | number | 是 | 报废数量 |
| `scrap_type` | string | 否 | `mandatory_replace`(必换件) / `life_issue`(寿命) / `inspection_confirmed`(故检确认) |
| `reason` | string | 否 | 报废原因 |
| `operator` | string | 否 | 操作人 |
| `remark` | string | 否 | 备注 |
| `created_at` | string(date-time) | 是 | |

**routePath**：`fmms/ScrapRecord{Create|Find|Update|Delete}`

---

## 4. InventoryTransaction（出入库流水）

> LineStock 是库存快照，本实体记录逐笔出入库流水。

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `stock_id` | string(uuid) | 否 | → LineStock.id |
| `transaction_type` | string | 是 | `inbound`(入库) / `outbound`(出库) |
| `stock_type` | string | 否 | `outsource_cache` / `staging` / `scrap` |
| `material_code` | string | 是 | 物料编码 |
| `material_name` | string | 否 | 物料名称 |
| `quantity` | number | 是 | 数量 |
| `unit` | string | 是 | 计量单位 |
| `related_barcode` | string | 否 | 关联载具/零件条码 |
| `card_id` | string(uuid) | 否 | 关联工卡 |
| `operator` | string | 否 | 操作人 |
| `transaction_time` | string(date-time) | 是 | 交易时间 |
| `remark` | string | 否 | 备注 |
| `created_at` | string(date-time) | 是 | |

**routePath**：`fmms/InventoryTransaction{Create|Find|Update|Delete}`

---

## 5. NotificationLog（呼叫日志）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `station_code` | string | 是 | 呼叫方工位编号 |
| `caller_id` | string | 是 | 呼叫人ID |
| `call_type` | string | 是 | `tool_fault`(设备故障) / `tech_help`(技术求助) / `personnel`(人员异常) / `material`(物料异常) |
| `callee_type` | string | 否 | `engineer`(工程师) / `manager`(管理人员) |
| `description` | string | 否 | 问题描述 |
| `status` | string | 是 | `pending`(待处理) / `accepted`(已接受) / `resolved`(已解决) |
| `accepted_at` | string(date-time) | 否 | 接受时间 |
| `resolved_at` | string(date-time) | 否 | 解决时间 |
| `created_at` | string(date-time) | 是 | |

**routePath**：`fmms/NotificationLog{Create|Find|Update|Delete}`

---

## 6. TrayTemplate（形迹托盘模版）

> 分拣工位副屏的形迹可视化模版。第一阶段只读渲染。

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `template_code` | string | 是 | 模版编码（按托盘编码），唯一 |
| `name` | string | 是 | 模版名称 |
| `tray_photo_object_id` | string | 否 | 托盘照片 EADAF storage objectId |
| `version` | number | 否 | 版本号，默认1 |
| `status` | string | 否 | `draft` / `published` |
| `remark` | string | 否 | |
| `created_at` | string(date-time) | 是 | |
| `updated_at` | string(date-time) | 是 | |

**routePath**：`fmms/TrayTemplate{Create|Find|Update|Delete}`

---

## 7. TraySlot（形迹槽位）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `template_id` | string(uuid) | 是 | → TrayTemplate.id |
| `slot_code` | string | 是 | 槽位编码 |
| `material_code` | string | 是 | 物料类型编码（绑类型非实例） |
| `material_name` | string | 否 | 物料名称 |
| `shape_type` | string | 否 | `circle` / `square` / `custom` |
| `coordinates` | JSON | 否 | 坐标 `{x, y, r?}` 或 `{points: [[x,y],...]}` |
| `filled` | boolean | 否 | 运行时有料状态，默认 false |
| `sort_order` | number | 否 | 排序序号 |
| `created_at` | string(date-time) | 是 | |
| `updated_at` | string(date-time) | 是 | |

**routePath**：`fmms/TraySlot{Create|Find|Update|Delete}`

---

## 8. WorkCard 补充字段

> WorkCard 实体需增加检测结果 JSON 字段（用户决定：检测结果存 WorkCard）。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `inspection_result` | JSON | 检测结果数据，结构：`{ items: [{item_code, measured_value, result, photo_object_ids, collected_at, collected_by}], summary: {total, qualified, unqualified, pending} }` |

---

## routePath 速查（补充实体）

| 实体 | Create | Find | Update | Delete |
|------|--------|------|--------|--------|
| WorkCardPart | `fmms/WorkCardPartCreate` | `fmms/WorkCardPartFind` | `fmms/WorkCardPartUpdate/:id` | `fmms/WorkCardPartDelete/:id` |
| OutsourceOrder | `fmms/OutsourceOrderCreate` | `fmms/OutsourceOrderFind` | `fmms/OutsourceOrderUpdate/:id` | `fmms/OutsourceOrderDelete/:id` |
| ScrapRecord | `fmms/ScrapRecordCreate` | `fmms/ScrapRecordFind` | `fmms/ScrapRecordUpdate/:id` | `fmms/ScrapRecordDelete/:id` |
| InventoryTransaction | `fmms/InventoryTransactionCreate` | `fmms/InventoryTransactionFind` | `fmms/InventoryTransactionUpdate/:id` | `fmms/InventoryTransactionDelete/:id` |
| NotificationLog | `fmms/NotificationLogCreate` | `fmms/NotificationLogFind` | `fmms/NotificationLogUpdate/:id` | `fmms/NotificationLogDelete/:id` |
| TrayTemplate | `fmms/TrayTemplateCreate` | `fmms/TrayTemplateFind` | `fmms/TrayTemplateUpdate/:id` | `fmms/TrayTemplateDelete/:id` |
| TraySlot | `fmms/TraySlotCreate` | `fmms/TraySlotFind` | `fmms/TraySlotUpdate/:id` | `fmms/TraySlotDelete/:id` |
