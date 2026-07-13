# FMMS 功能清单与开发拆解

> **用途**：本文档拆解故检修理线系统全部功能，按模块→功能项→优先级（P1 第一阶段 / P2 后续）逐项列出，并标注每项涉及的 EADAF 实体、BFF 接口、前端页面、验收标准。
>
> **优先级说明**：P1 = 第一阶段实现；P2 = 后续阶段（含占位）。

---

## 总览

| 工位 | 副屏业务 | 阶段 |
|------|---------|------|
| 分拣 (sorting) | 形迹码盘 + 齐套校验 | P1 |
| 故检1 小件 (inspection_small) | 检测表 + 自动采集/判异 + 拍照 | P1 |
| 故检2 大/小件 (inspection_large) | 同故检1（大件不合格不走本系统修理） | P1 |
| 修理 (repair) | 修理记录 / 委外拆单 / 报废登记 | P1 |
| 收发 (receive_send) | 线边库 / 出入库 / 委外收发 | P1 |

---

## 模块 0：通用工位基础（5 工位共享）

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 0.1 | 工位配置（选择/切换/持久化） | P1 | Workstation | `GET /api/op/workstations` | StationSelect | 选工位后页面按类型过滤工卡与功能菜单，选择持久化到 Electron 本地 |
| 0.2 | 员工登录（SSO） | P1 | (EADAF SSO) | `/auth/*` | LoginPage / AuthCallback | 跳转 EADAF 登录后回调获得 token，用户信息展示，路由受 AuthGate 保护 |
| 0.3 | 工卡列表（状态色标） | P1 | WorkCard | `GET /api/op/workcards` | WorkCardList | 按当前工位类型过滤；状态色标（未接受灰/待处理蓝/处理中橙/已完成绿） |
| 0.4 | 工卡详情 | P1 | WorkCard + WbsNode + WorkStep | `GET /api/op/workcards/:id` | WorkCardDetail | 展示工艺内容、检测项、公差；工艺文件/视频可点击，视频客户端内播放 |
| 0.5 | 任务接受 | P1 | WorkCard | `POST /api/op/workcards/:id/accept` | WorkCardDetail | 一键接受，记录 accept_time + operator，状态→pending/in_progress |
| 0.6 | 进度跟踪 | P1 | WorkCard.progress | WS `workcard.progress` | WorkCardDetail | 实时进度百分比，按工序/零件更新 |
| 0.7 | 零部件清单（分组） | P1 | WorkCardPart | `GET /api/op/workcards/:id/parts` | PartBoard | 按类别分组（如缸体×1），逐件显示检测/处置状态 |
| 0.8 | 零部件状态标识 | P1 | WorkCardPart.status | (同上) | PartBoard | 合格绿/不合格红/待处理灰；检测完成统计（N合格、M不合格） |
| 0.9 | 扫码定位零件 | P1 | WorkCardPart.scan_barcode | (前端+扫码枪) | PartBoard | 扫码/输入条码自动定位高亮匹配零件 |
| 0.10 | 测量工具注册管理 | P1 | MeasuringTool | `GET/POST /api/op/tools` | ToolStatus | 工具档案：编号/类型/协议/连接参数；新工具可注册 |
| 0.11 | 多协议支持 | P1 | MeasuringTool.protocol | Electron collector | (采集服务) | serial / USB HID（P1）；Modbus RTU/TCP、TCP 自定义（预留） |
| 0.12 | 自动数据采集 | P1 | InspectionRecord + ingest | `/api/op/ingest` + WS | InspectionBoard | 自动匹配工具，实时读取实测值填入检测表 |
| 0.13 | 自动判异 | P1 | InspectionRecord.result | (BFF/前端计算) | InspectionBoard | `nominal+lower ≤ 实测 ≤ nominal+upper` → 合格，否则不合格高亮 |
| 0.14 | 手动输入/覆盖 | P1 | InspectionRecord | `POST /api/op/inspection` | InspectionBoard | 无工具/重测/特殊场景手动输入与判异覆盖 |
| 0.15 | 检测图片管理 | P1 | InspectionRecord.photo_object_id | `/api/op/storage/upload` | InspectionBoard | 拍照绑定检测项/零件，预览重拍，随工卡归档 |
| 0.16 | 工具在线状态监控 | P1 | (Electron 内存 + WS) | WS `tool.status` | ToolStatus | 连续监控在线/离线/通信健康 |
| 0.17 | 工具异常报警 | P1 | (WS) | WS `tool.alarm` | ToolStatus | 断连/超时/异常数据弹窗报警，点名故障工具 |
| 0.18 | 异常呼叫 | P1 | NotificationLog | `POST /api/op/call` | CallModal | 选被叫人(技术员/组长) + 呼叫类型(4种) + 问题描述 |
| 0.19 | AGV 呼进呼出 | P2 | (Mock 占位) | `POST /api/op/agv` | WorkCardDetail | 一键转运申请（Mock：写记录，定时回填状态） |

---

## 模块 1：分拣工位（sorting）

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 1.1 | 模版联动切换 | P1 | TrayTemplate + TraySlot | `GET /api/op/tray-templates?card=...` | SortingBoard | 主屏选工卡→副屏自动加载匹配形迹模版（照片+槽位） |
| 1.2 | 可视化码盘 | P1 | TraySlot | (WS 同步) | SortingBoard | 槽位半透明形状（圆/方/自定义），点击切换有/无料，有料高亮 |
| 1.3 | 齐套校验 | P1 | WorkCardPart + TraySlot | (前端比对) | SortingBoard | 实时比对工卡物料清单 vs 槽位状态；齐套弹完成提示，缺料显示缺项 |
| 1.4 | 齐套结果上报 | P1 | WorkCard | `POST /api/op/workcards/:id/submit` | SortingBoard | 确认齐套→提交分拣执行结果→上报（Mock PCS） |

---

## 模块 2：故检1/故检2 工位（inspection_small / inspection_large）

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 2.1 | 双模式检测 | P1 | InspectionItem + InspectionRecord | `GET /api/op/inspection/:partId/items` | InspectionBoard | 数显项自动采集+判异；难测项手动判合格/不合格 |
| 2.2 | 拍照留痕 | P1 | InspectionRecord.photo_object_id | `/api/op/storage/upload` | InspectionBoard | 需拍照项显示拍照标记，脚踏/按钮触发，预览重拍，绑定项/件 |
| 2.3 | 不合格分类打码 | P1 | WorkCardPart.disposal_result | `POST /api/op/parts/:id/disposal` | InspectionBoard | 系统按物料属性建议处置(委外/修理/报废)，确认后生成分类条码+标签打印 |
| 2.4 | 结果统一上报 | P1 | WorkCard | `POST /api/op/workcards/:id/submit` | InspectionBoard | 全部零件检测完→提交故检执行结果→上报（Mock PCS） |

> 故检2（大件）差异：大件不合格**不走本系统修理**，仅做委外登记+打印委外单，AGV 转收发。前端按 workstation_type 区分分支。

---

## 模块 3：修理工位（repair）

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 3.1 | 修理执行记录 | P1 | WorkStep + InspectionRecord | `POST /api/op/disposal/repair` | RepairBoard | 选修理方法、修理设备/工装，填修理过程与结论 |
| 3.2 | 委外操作管理 | P1 | OutsourceOrder | `POST /api/op/outsource` | RepairBoard | 按物料属性自动识别委外件，可手动增删；提交生成委托单编码，按委外方拆多单，打印预览/批量打印 |
| 3.3 | 报废登记 | P1 | ScrapRecord | `POST /api/op/scrap` | RepairBoard | 多选批量报废，可选原因/备注，关联线边报废账 |
| 3.4 | 处置完成校验 | P1 | WorkCard | `POST /api/op/workcards/:id/submit` | RepairBoard | 全部零件有结果（修理/委外/报废）后"处置完成"按钮启用；提交→上报（Mock PCS 生成复检工卡） |

---

## 模块 4：收发工位（receive_send）

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 4.1 | 线边库分类管理 | P1 | LineStock + LineStockItem | `GET /api/op/inventory` | ReceiveBoard | 三类库存：待委外缓存/零件暂存/报废，分开记账统计 |
| 4.2 | 出入库操作 | P1 | InventoryTransaction + LineStockItem | `POST /api/op/inventory/transaction` | ReceiveBoard | 扫载具/零件条码，选库存类型/库位，确认数量→出入库记账 |
| 4.3 | 委外收发登记 | P1 | OutsourceOrder + InventoryTransaction | `POST /api/op/outsource/ship` `/return` | ReceiveBoard | 委外件发货+返回验收均在此登记；可暂存待复检或入立库 |
| 4.4 | 立库交接 | P2 | (流程 P1，真实对接 P2) | — | ReceiveBoard | 合格件/委外完成件验收入立库缓存（P1 记账，真实立库对接 P2） |
| 4.5 | 执行结果上报 | P1 | WorkCard | `POST /api/op/workcards/:id/submit` | ReceiveBoard | 收发工卡执行结果上报（Mock PCS）；线边出入库流水内部记录 |

---

## 模块 5：通用支撑功能

| # | 功能项 | P | EADAF 实体 | BFF 接口 | 前端页面 | 验收标准 |
|---|--------|---|-----------|---------|---------|---------|
| 5.1 | 工艺视频客户端内播放 | P1 | WbsNode (processResources.url) | `/api/op/storage/preview` 或直链 | VideoPlayer | 视频 MP4(H.264) 在客户端内播放，不跳浏览器 |
| 5.2 | 标签打印 | P1 | — | (前端打印) | PrintLabel | 分类条码/委外单标签打印（P1 用 webview window.print + HTML 模板） |
| 5.3 | 双屏主副同步 | P1 | — | BroadcastChannel | OPShell | 主屏选工卡→副屏同步渲染对应工作台 |
| 5.4 | 本地配置（服务器地址） | P1 | — | — | Electron ConfigPage | 配置 admin/frontend 地址、SSO 参数，热更新 webview |
| 5.5 | 工位选择/习惯持久化 | P1 | — | — | Electron store | 工位选择、用户操作习惯存本地（electron-store） |

---

## 后续阶段（P2，仅列名，第一阶段不实现）

| 模块 | 说明 |
|------|------|
| 通知接收客户端 | 技术员/组长办公 PC 上的 Electron 托盘应用，接收异常呼叫弹窗 |
| 产线监控大屏 | Web 全屏 WebSocket 近实时监控（工位/工卡负载/工具状态/库存水位/质量统计） |
| `/admin` 管理后台 | 形迹模版 Web 编辑器、用户角色管理、测量工具配置、系统参数 |
| 真实 PCS TCP 对接 | 工卡推送/执行结果上报/AGV 调度的 TCP/IP 双向对接 |
| 真实 AGV 调度 | 经 PCS-AGV 模块调用，状态回填 |
| 真设立库对接 | 收发工位合格件入立库 |
| 测量工具校准/故障统计 | 校准历史、MTBF/故障率统计 |
| Modbus / TCP 自定义协议驱动 | 补全测量工具协议覆盖 |

---

## 数据来源说明（第一阶段）

- **PCS 工卡**：Mock。种子数据写入 EADAF WorkCard（source=`mock`），BFF mockPCS 服务定时"分发"到各工位。
- **WBS/检测项/零部件**：Mock 种子数据写入 EADAF 对应实体。
- **检测数据**：真实采集链路（Electron→BFF→EADAF ingest）。
- **测量工具**：真实注册（扫描发现）或种子档案。
- **文件/图片**：EADAF storage 真实存储。
