# PCS 上报触发说明

> **2026-11-01：** 工位执行写入 IPS，不再写 `fmms` 工卡。需要上报 PCS 的事件，改为监听下面这些 IPS API。BFF 对页面仍用 `pending` / `completed` 这类词，写入前换成 IPS 枚举。
>
> FMMS 不直接对接 PCS。由 EADAF 的数据变更 Hook 在这些 API 调用之后通知 PCS。

---

## 1. 工卡执行结果上报

**触发 API**：`IPS/production/WorkCardUpdate`（`PATCH /api/v1/data/IPS/production/WorkCardUpdate/:id`）

**触发条件**：`status` 被更新为 `REPAIR_DONE`（页面对应 `completed`）

**上报 PCS 时建议带上**：`workCardNo`、`status`、`repairFinishedAt`、`stationType`、`qualifiedCount`、`unqualifiedCount`。

---

## 2. 工卡接受上报

**触发 API**：`IPS/production/WorkCardUpdate`

**触发条件**：`status` 变为 `REPAIRING`，同时写入 `acceptedAt`、`repairStartedAt`、`acceptOperatorName`（页面对应接受工卡、`in_progress`）。

---

## 3. 零部件处置结果上报

**触发 API**：`IPS/production/WorkCardPartUpdate`

**触发条件**：`disposalResult` 变更（合格 / 修理 / 委外 / 报废）。

---

## 4. 委外单创建上报

**触发 API**：`IPS/production/WorkCardOutsourcingCreate`（`POST /api/v1/data/IPS/production/WorkCardOutsourcingCreate`）

**触发条件**：创建委外记录。状态写入 `ISSUED`（页面对应 `created`）。

**上报 PCS 时建议带上**：`orderNo`、`partCode`、`quantity`、`workCardId`。

---

## 5. 报废登记上报

**触发 API**：`IPS/production/ScrapRecordCreate`

**触发条件**：创建报废记录。

---

## 6. 线边出入库上报

**触发 API**：`IPS/logistics/InventoryTransactionCreate`

**触发条件**：创建出入库流水。

---

## 汇总表

| # | 业务事件 | 监听的 EADAF API | 触发条件 | PCS 动作 |
|---|---------|-----------------|---------|---------|
| 1 | 工卡完成 | `IPS/production/WorkCardUpdate` | `status` → `REPAIR_DONE` | 上报执行结果 |
| 2 | 工卡接受 | `IPS/production/WorkCardUpdate` | `status` → `REPAIRING`，并写入 `acceptedAt` | 通知 PCS 工卡已开工 |
| 3 | 零件处置 | `IPS/production/WorkCardPartUpdate` | `disposalResult` 变更 | 上报处置结论 |
| 4 | 委外创建 | `IPS/production/WorkCardOutsourcingCreate` | Create，`status` = `ISSUED` | 上报委外发运 |
| 5 | 报废登记 | `IPS/production/ScrapRecordCreate` | Create | 触发缺件申领 |
| 6 | 出入库 | `IPS/logistics/InventoryTransactionCreate` | Create | 更新线边库存账 |

---

Hook 里调用 PCS 的协议由 EADAF 侧实现。不要再监听 `fmms/WorkCardUpdate`、`fmms/OutsourceOrderCreate` 这些旧路径。
