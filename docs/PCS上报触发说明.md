# PCS 上报触发说明

> **背景**：FMMS 不再直接对接 PCS（生产控制系统）。所有需要上报 PCS 的业务事件，由 EADAF 的数据变更 Hook 监听 FMMS 的 API 调用后触发。本文档列出哪些 API 调用会触发上报 PCS 及对应的上报内容。

---

## Hook 监听规则

在 EADAF 中为以下 API 配置数据变更 Hook（After Create / After Update），Hook 内调用 PCS 接口完成上报。

---

## 1. 工卡执行结果上报

**触发 API**：`fmms/WorkCardUpdate`（`PATCH /api/v1/data/fmms/WorkCardUpdate/:id`）

**触发条件**：`status` 字段被更新为 `completed`

**上报 PCS 内容**：
```json
{
  "card_code": "工卡编号",
  "status": "completed",
  "complete_time": "完成时间",
  "station_type": "工位类型",
  "qualified_parts": 12,
  "unqualified_parts": 2,
  "inspection_result": { "summary": { "total": 14, "qualified": 12, "unqualified": 2 } }
}
```

---

## 2. 工卡接受上报

**触发 API**：`fmms/WorkCardUpdate`

**触发条件**：`status` 从 `unaccepted` 变为 `processing`（即 `accept_time` 被设置）

**上报 PCS 内容**：工卡已被接受、操作员信息、接受时间。

---

## 3. 零部件处置结果上报

**触发 API**：`fmms/WorkCardPartUpdate`

**触发条件**：`disposal_result` 字段被更新（合格/修理/委外/报废）

**上报 PCS 内容**：零件编号、处置结论。报废时触发缺件申领。

---

## 4. 委外单创建上报

**触发 API**：`fmms/OutsourceOrderCreate`（`POST /api/v1/data/fmms/OutsourceOrderCreate`）

**触发条件**：创建委外单（委外系统物理隔离，PCS 侧记录委外发运信息）

**上报 PCS 内容**：委托单编码、委外方、零件编号列表。

---

## 5. 报废登记上报

**触发 API**：`fmms/ScrapRecordCreate`（`POST /api/v1/data/fmms/ScrapRecordCreate`）

**触发条件**：创建报废记录

**上报 PCS 内容**：报废零件/数量/原因（触发缺件申领）。

---

## 6. 线边出入库上报

**触发 API**：`fmms/InventoryTransactionCreate`（`POST /api/v1/data/fmms/InventoryTransactionCreate`）

**触发条件**：创建出入库流水

**上报 PCS 内容**：物料编码、出入库类型、数量（PCS 侧更新线边库存账）。

---

## 汇总表

| # | 业务事件 | 监听的 EADAF API | 触发条件 | PCS 动作 |
|---|---------|-----------------|---------|---------|
| 1 | 工卡完成 | `fmms/WorkCardUpdate` | status→completed | 上报执行结果 |
| 2 | 工卡接受 | `fmms/WorkCardUpdate` | accept_time 被设置 | 通知 PCS 工卡已开工 |
| 3 | 零件处置 | `fmms/WorkCardPartUpdate` | disposal_result 变更 | 上报处置结论 |
| 4 | 委外创建 | `fmms/OutsourceOrderCreate` | Create | 上报委外发运 |
| 5 | 报废登记 | `fmms/ScrapRecordCreate` | Create | 触发缺件申领 |
| 6 | 出入库 | `fmms/InventoryTransactionCreate` | Create | 更新线边库存账 |

---

> **注意**：Hook 中调用 PCS 接口的协议（TCP/IP 或 HTTP）由 EADAF 侧实现，FMMS 不参与。
