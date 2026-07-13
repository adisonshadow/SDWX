# SSO 跳转逻辑修复说明

## 问题描述

当URL不带`app`参数时，登录后错误地跳转到了SSO回调地址（如`http://localhost:3300/sso-callback`），而不是跳转到EADAF自己的管理后台。

## 问题原因

1. **`handleLogin`函数**：当登录响应包含SSO信息时，无论URL是否有`app`参数，都会设置`applicationInfo`并执行SSO回调
2. **`handleLoginSuccess`函数**：只检查`applicationInfo?.sso_enabled`，没有检查URL中是否有`app`参数

## 修复方案

### 1. 修复 `handleLogin` 函数

**修改前**：
```typescript
// 检查是否有SSO信息需要处理
if (msg.data?.sso) {
  // 设置 applicationInfo 并执行 SSO 回调
}
```

**修改后**：
```typescript
// 检查是否有SSO信息需要处理 - 只有在URL中有app参数时才处理SSO
const urlParams = new URL(window.location.href).searchParams;
const appId = urlParams.get('app');

if (msg.data?.sso && appId) {
  // 设置 applicationInfo 并执行 SSO 回调
}
```

### 2. 修复 `handleLoginSuccess` 函数

**修改前**：
```typescript
// 处理 SSO 回调
if (applicationInfo?.sso_enabled && applicationInfo?.sso_config?.redirect_uri) {
  submitSsoCallback(updatedUserInfo, token, refreshToken);
  return;
}
```

**修改后**：
```typescript
// 处理 SSO 回调 - 只有在URL中有app参数时才执行SSO回调
const urlParams = new URL(window.location.href).searchParams;
const appId = urlParams.get('app');

if (appId && applicationInfo?.sso_enabled && applicationInfo?.sso_config?.redirect_uri) {
  submitSsoCallback(updatedUserInfo, token, refreshToken);
  return;
}
```

## 修复后的行为

### 1. URL带`app`参数的情况
- **访问**: `http://localhost:9002/auth/login?app=your-app-id`
- **登录后**: 执行SSO回调，跳转到应用的`redirect_uri`
- **行为**: ✅ 正确

### 2. URL不带`app`参数的情况
- **访问**: `http://localhost:9002/auth/login`
- **登录后**: 跳转到EADAF管理后台（根据`redirect`参数或默认页面）
- **行为**: ✅ 正确

### 3. URL带`redirect`参数的情况
- **访问**: `http://localhost:9002/auth/login?redirect=/admin`
- **登录后**: 跳转到`/admin`页面
- **行为**: ✅ 正确

## 测试步骤

### 测试1：不带app参数的登录
1. 访问 `http://localhost:9002/auth/login`
2. 输入用户名和密码登录
3. 验证登录后跳转到EADAF管理后台，而不是SSO回调地址

### 测试2：带app参数的登录
1. 访问 `http://localhost:9002/auth/login?app=your-app-id`
2. 输入用户名和密码登录
3. 验证登录后执行SSO回调，跳转到应用的`redirect_uri`

### 测试3：带redirect参数的登录
1. 访问 `http://localhost:9002/auth/login?redirect=/admin`
2. 输入用户名和密码登录
3. 验证登录后跳转到`/admin`页面

## 关键逻辑

修复的核心逻辑是：**只有在URL中包含`app`参数时，才执行SSO相关的处理**。

这确保了：
- 普通登录（无app参数）→ 跳转到EADAF管理后台
- SSO登录（有app参数）→ 执行SSO回调跳转
- 重定向登录（有redirect参数）→ 跳转到指定页面
