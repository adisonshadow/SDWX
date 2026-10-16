---
name: eadaf-api
version: 1.2.0
description: >-
  如何正确调用 EADAF 平台 API：鉴权换 token、业务数据 API 的 routePath/CRUD 路由规则、
  Find 的 filter 与顶层字段参数（含优先级）、limit≤100 上限、OpenAPI/api-catalog 发现。
  在对接 EADAF、编写 EADAFClient/调用脚本、解析 apis.json、排查 400/403 时使用本 Skill。
---

# EADAF API 调用 Skill

> **版本**：`1.1.0`（见 frontmatter `version`）
> **适用对象**：外部应用后端（如 FMMS BFF）、AI Agent、集成脚本
> **人类长文**：仓库内 `docs/external-app-integration-guide.md`

---

## 1. 快速认知

| 概念 | 说明 |
|------|------|
| **应用（Application）** | 在 EADAF 注册的外部系统，拥有 `application_id` + `app_secret` |
| **访问令牌（JWT）** | 用 `app_secret` 换取，默认 24h，请求头 `Authorization: Bearer {token}` |
| **routePath** | 业务数据 API 的路由，格式 `fmms/{scope}/{Entity}`（见 §3） |
| **内置 API** | 用户/组织/角色等平台 API，路径 `/api/v1/users` 等 |
| **apis.json** | 机器可读契约（**纯 OpenAPI 3.0.3 对象**，无 `{code,data}` 外壳） |
| **api-catalog** | 结构化目录（含 services/operations 的 schema 与 mock 样本） |

`{key}` 可为应用 **code**（如 `FMMS`）或 **application_id**（UUID）。

---

## 2. 鉴权（必须遵守）

### 2.1 换取 Token（公开接口，无需已有 Token）

```http
POST {base_url}/api/v1/applications/token
Content-Type: application/json

{
  "application_id": "<UUID>",
  "app_secret": "<64位十六进制>"
}
```

成功：响应 `data.token` 为 JWT。失败常见：`401 无效的 app_secret`、`404 应用不存在`。

### 2.2 调用任意受保护 API

```http
Authorization: Bearer {token}
```

**安全**：`app_secret` 仅保存在调用方服务端，禁止写入前端代码、Git、日志或 URL 参数。

### 2.3 Token 管理

- 默认 24h 有效，建议缓存并在过期前主动刷新（如提前 5 分钟）。
- 遇 `401` 刷新后重试一次；并发刷新需去重（同一时刻只换一次）。

---

## 3. 业务数据 API — routePath 与 CRUD

### 3.1 路由规则（关键）

每个实体自动生成 4 个路径，routePath 格式为 **`fmms/{scope}/{Entity}`**，operation 后缀直接拼在路径里：

| 操作 | 后缀 | HTTP | 路径 | 请求体 |
|------|------|------|------|--------|
| 查询 | `Find` | GET | `/api/v1/data/fmms/{scope}/{Entity}Find` | 无（参数在 query） |
| 创建 | `Create` | POST | `/api/v1/data/fmms/{scope}/{Entity}Create` | `{ body: { ...字段 } }` |
| 更新 | `Update` | PATCH | `/api/v1/data/fmms/{scope}/{Entity}Update/:id` | `{ id, body: { ...字段 } }` |
| 删除 | `Delete` | DELETE | `/api/v1/data/fmms/{scope}/{Entity}Delete/:id` | **无 body**（`id` 在 path） |

- `scope` 为域分类（如 `production`、`tooling`、`quality`、`service`、`logistics`）。
- 例：`fmms/production/WorkCard` → 派生 `WorkCardFind` / `WorkCardCreate` / `WorkCardUpdate/:id` / `WorkCardDelete/:id`。
- **没有** `?operation=find` 这种 query 参数——operation 已编码进 URL 路径。
- `operationId` 命名规则：`{domain}:{Entity}{Operation}_{verb}`（如 `fmms:production:WorkCardFind_find`）。
- Update 还支持单字段语法 `{ id, field, set }`（如 `{ id, field: "status", set: "completed" }`），与多字段 `{ id, body: {...} }` 并存。

### 3.2 响应外壳

所有业务 API 统一封装：

```json
{ "code": 200, "message": "调用成功", "data": { ... } }
```

**Find 的 `data` 是执行报告对象**，业务记录在 `data.preview.items`，总数在 `data.preview.count`：

```json
{
  "code": 200, "message": "调用成功",
  "data": {
    "preview": { "count": 6, "items": [ { "id": "...", ... } ] },
    "operation": "find", "httpMethod": "GET", ...
  }
}
```

> 客户端应兼容三种 Find 结果形态：执行报告 `{ preview: { items, count } }` / `{ items, total }` / 裸数组。

**Create 的 `data` 包裹在 `data.item`**（所有实体统一）：

```json
{ "code": 200, "message": "调用成功", "data": { "item": { ...创建的记录 } } }
```

### 3.3 示例

```http
# 查询（顶层字段过滤）
GET {base_url}/api/v1/data/fmms/production/WorkCardFind?limit=10&status=completed&station_type=sorting
Authorization: Bearer {token}
```

```http
# 创建
POST {base_url}/api/v1/data/fmms/production/WorkCardCreate
Authorization: Bearer {token}
Content-Type: application/json

{ "body": { "card_code": "WC-2026-0002", "status": "unaccepted", "station_type": "repair" } }
```

```http
# 更新（多字段）
PATCH {base_url}/api/v1/data/fmms/production/WorkCardUpdate/:id
Authorization: Bearer {token}

{ "id": ":id", "body": { "status": "processing", "progress": 50 } }
```

```http
# 删除（无 body）
DELETE {base_url}/api/v1/data/fmms/production/WorkCardDelete/:id
Authorization: Bearer {token}
```

---

## 4. Find 的过滤与分页（重要）

### 4.1 两种过滤方式（等价，顶层优先）

| 方式 | 示例 | 说明 |
|------|------|------|
| **顶层字段级参数** | `?status=completed&station_type=sorting` | **推荐**，简洁、URL 可读 |
| `filter` 对象 | `?filter={"status":"pending"}` | 也支持，可多字段 `{"status":"x","station_type":"y"}` |

**优先级规则**：若同时传顶层 `status` 与 `filter.status`，**以顶层 `status` 为准**（filter 内同名字段被忽略）。

> 如无必要尽量使用顶层参数。

### 4.2 分页

| 参数 | 说明 |
|------|------|
| `limit` | 每页条数，默认 20，**上限 100**（超过返回 400 `limit: Too big`） |
| `skip` | 分页起始位置，默认 0 |

`limit`/`skip` 是分页字段，**不要**放进 `filter`。

### 4.3 只下发有值的字段，省略即「全部」（关键）

**不参与过滤的字段不要传**——省略即代表查询全部。部分字段（如 `status`）有枚举校验，传空串会被拒：

```
400 status: Invalid option: expected one of "pending"|"cancelled"|"completed"|"in_progress"
```

正确：只下发实际要过滤的字段：

```
# 只过滤 station_type，status 省略（=全部状态）
?limit=10&station_type=sorting

# 只过滤 status
?limit=10&status=completed

# 多字段同时过滤
?limit=10&status=completed&station_type=sorting
```

> ❌ 错误：`?status=&station_type=sorting`（status 空串触发枚举校验失败）
> ✅ 正确：`?station_type=sorting`（省略 status = 全部）

仅用 `limit`/`skip` 调用即可拉取全部记录，需要过滤时按字段下发顶层参数。

### 4.4 常见错误速查

| 报错 | 原因 | 解决 |
|------|------|------|
| `status: Invalid option: expected one of ...` | 枚举字段传了空串或非法值 | 省略该字段（=全部），或传合法枚举值 |
| `filter: Invalid input: expected record, received string` | filter JSON 字符串未被解析为对象（部分服务尚未支持） | 改用顶层字段参数 |
| `limit: Too big: expected number to be <=100` | limit 超过 100 | 钳制到 ≤100 |
| `403 API 服务未发布` | 目标服务未在 EADAF 发布 | 联系 EADAF 管理员发布该服务 |
| `403 无权访问该 API 服务` | 应用令牌受角色/组织策略限制 | 管理员将服务访问策略改为「无限制」 |

---

## 5. SSE 流式（只读）

```http
GET {base_url}/api/v1/stream/data/fmms/{scope}/{Entity}Find?status=open
Accept: text/event-stream
Authorization: Bearer {token}
```

仅支持读类操作，事件流：`meta` → `item`（多条）→ `done`。适合大数据量查询。

---

## 6. API 发现（给 AI 用）

按优先级读取：

1. **apis.json（OpenAPI 3.0.3）** — 机器可读契约，**纯 OpenAPI 对象**，无 `{code,data}` 外壳
   ```http
   GET {base_url}/api/v1/applications-public/{key}/apis.json
   ```
   顶层：`openapi` / `info` / `paths` / `tags` / `exceptionResponses`。从 `paths` 的 keys 即可枚举所有可用 routePath。

2. **api-catalog（结构化目录）** — 含 `services[].operations[]` 的 `parametersSchema`、`mockParameters`（请求 Example）、`responseInterface`
   ```http
   GET {base_url}/api/v1/applications-public/{key}/api-catalog
   ```

3. **在线文档（Swagger UI）**
   ```
   {frontend}/public/applications/{key}/api-docs
   ```

发现后以 **operation 的 `parametersSchema`** 为准构造请求，以 **`mockParameters`** 为样本参考，不臆造字段名。

---

## 7. 内置 API

```http
GET {base_url}/api/v1/users?page=1&size=20
GET {base_url}/api/v1/departments/tree
GET {base_url}/api/v1/departments/:department_id/users
```

须在应用「可访问内置 API」中授权对应 `permission code`（如 `user:account:list`）。应用令牌仅检查 code 是否在授权范围，不受角色/组织限制。

---

## 8. 采集管道与文件存储

| 能力 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 采集管道 | POST | `/api/v1/ingest/{routePath}` | body 为原始字节（非 JSON），≤1MB |
| 文件上传 | POST | `/api/v1/storage/objects/upload` | multipart，字段 `bucketId` + `file` |
| 文件列表 | GET | `/api/v1/storage/objects` | 新增 |
| 文件下载 | GET | `/api/v1/storage/objects/{objectId}/download` | |
| 文件预览 | GET | `/api/v1/storage/objects/{objectId}/preview` | |
| Bucket 管理 | GET/POST/PUT/DELETE | `/api/v1/storage/buckets[/:id]` | 新增 |

---

## 9. AI 调用检查清单

- [ ] 已用 `application_id` + `app_secret` 换取 Token，缓存并支持 401 重试
- [ ] routePath 用 `fmms/{scope}/{Entity}`，operation 拼进路径（`{Entity}Find` 等），无 `?operation=`
- [ ] 过滤优先用顶层字段参数；`filter` 也支持但顶层优先级更高
- [ ] **只下发有值的字段参数，省略即「全部」**——枚举字段传空串会 400
- [ ] `limit` ≤ 100
- [ ] Find 响应解析 `data.preview.items`，Create 响应解包 `data.item`
- [ ] Delete 无 body，`id` 在 path
- [ ] 需要契约时拉取 `apis.json`（纯 OpenAPI），对照 `parametersSchema` 不臆造字段

---

## 10. 版本记录

| 版本 | 说明 |
|------|------|
| **1.2.0** | 过滤行为修正：只下发有值的字段，省略即「全部」（枚举字段空串会 400）；移除「字段参数须全量补空串」的过时说明 |
| **1.1.0** | 修正 routePath 为 `fmms/{scope}/{Entity}{Op}`（无 operation 参数）；过滤规则改为顶层优先 + filter 支持；补充 limit≤100、Create `data.item`、Delete 无 body、Find 执行报告形态 |
| **1.0.0** | 首版（鉴权、业务 API、filter 语义、API 发现） |

升级 Skill 时请递增 `version`。
