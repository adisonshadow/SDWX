# 故检修理线系统 (FMMS)

Execution-layer management system for the fault inspection & repair production line (航空 MRO 故检修理线执行层管理系统).

## 项目结构

```
SDQLJ_GJXL/
├── web/
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

- **web/frontend**：React 19 + antd 6 + React Router 7 + Vite 8 + TypeScript 5
- **web/backend**：Node.js + Express 4 + TypeScript 5 + ws (WebSocket)，无数据库
- **app-workstation-client**：Electron + Vite + React + TypeScript 5
- **数据底座**：EADAF 平台 (业务数据 API / 采集管道 / 文件存储 / SSO)。工位执行和排产共用 IPS 模型；FMMS、IPS 仍是两个应用

## 2026-11-01 变更

- 数据模型和已发布 API 只留 IPS。工位缺的执行字段补在 IPS 实体上，不再维护一套 `fmms` 工卡。
- 工位 BFF 直接读写 IPS。页面字段名不变，写入前由 BFF 换成 camelCase。工卡复制钩子已删除。
- 目录 `admin` 改为 `web`。包名 `@fmms/web-bff`、`@fmms/web`。端口仍是 5180 / 5181。
- 细节见 `docs/EADAF数据结构设计-FMMS.md` 第 1 节。

## 快速开始

### 前置条件
- Node.js >= 20
- pnpm >= 10
- EADAF 开发环境运行中（API `http://localhost:29526`，管理台 `http://localhost:29527`）

### 安装
```bash
pnpm install
```

### 开发
```bash
cd web && pnpm dev
```
只启动 BFF（5180）和工位页（5181）。Electron 在 `app-workstation-client` 里执行 `pnpm dev`。

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
| `docs/EADAF数据结构设计-FMMS.md` | 现行 IPS 实体与路径；后半是已停用的 fmms 草案 |
| `docs/EADAF补充实体设计.md` | 补充实体的旧草案，现行路径见上一篇第 1 节 |
| `docs/PCS上报触发说明.md` | PCS 钩子应监听的 IPS API |
| `docs/接口契约-admin-backend-BFF.md` | BFF REST + WebSocket 接口契约（目录已是 web） |
| `docs/工位客户端架构说明.md` | Electron 工位客户端架构 |
| `docs/部署与联调手册.md` | 部署与联调 |
| `docs/plans/第一阶段实施计划.md` | 第一阶段实施计划 |
| `docs/异常呼叫.md` | 呼叫类型、流水、工位喇叭；接收端留到下一阶段 |
