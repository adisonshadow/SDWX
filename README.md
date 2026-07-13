# 故检修理线系统 (FMMS)

Execution-layer management system for the fault inspection & repair production line (航空 MRO 故检修理线执行层管理系统).

## 项目结构

```
SDQLJ_GJXL/
├── admin/
│   ├── backend/            # Express BFF (无数据库，数据存 EADAF)
│   └── frontend/           # React + antd + Vite，含 /OPWeb (工位作业页面) + /auth (SSO)
├── app-workstation-client/ # Electron 工位客户端 (双屏 webview + 本地配置页 + 采集转发)
├── app-dashboard/          # 产线监控大屏 (后续阶段)
├── app-notification-reciver/ # 通知接收客户端 (后续阶段)
├── packages/
│   └── shared/             # @fmms/shared 共享类型与常量
└── docs/                   # 技术方案、EADAF 集成、功能拆解、接口契约等文档
```

## 技术栈

- **admin/frontend**：React 19 + antd 6 + React Router 7 + Vite 8 + TypeScript 5
- **admin/backend**：Node.js + Express 4 + TypeScript 5 + ws (WebSocket)，无数据库
- **app-workstation-client**：Electron + Vite + React + TypeScript 5
- **数据底座**：EADAF 平台 (业务数据 API / 采集管道 / 文件存储 / SSO)

## 快速开始

### 前置条件
- Node.js >= 20
- pnpm >= 10
- EADAF 开发环境运行中 (`http://localhost:9527`)

### 安装
```bash
pnpm install
```

### 开发 (并行启动所有服务)
```bash
pnpm dev
```

各服务独立启动见各子包 README。

### 环境变量
复制 `.env.example` 为 `.env`，填写 EADAF 应用密钥与 SSO 盐值。

## 文档导航

| 文档 | 说明 |
|------|------|
| `docs/故检修理线系统技术方案v0.4.md` | 原始技术方案 |
| `docs/external-app-integration-guide.md` | EADAF 外部应用接入指南 |
| `docs/SSO接入指南.md` | SSO 单点登录接入指南 |
| `docs/WBS.md` | WBS 五层结构参考 |
| `docs/功能清单-FMMS功能拆解.md` | 功能清单与开发拆解 |
| `docs/EADAF数据结构设计-FMMS.md` | EADAF 数据模型设计 (含新增实体) |
| `docs/接口契约-admin-backend-BFF.md` | BFF REST + WebSocket 接口契约 |
| `docs/工位客户端架构说明.md` | Electron 工位客户端架构 |
| `docs/部署与联调手册.md` | 部署与联调 |
| `docs/plans/第一阶段实施计划.md` | 第一阶段实施计划 |
