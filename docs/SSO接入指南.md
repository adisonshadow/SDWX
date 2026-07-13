# SSO 单点登录配置与接入指南

## 一、应用 - SSO配置

### 1.1 配置步骤

1. 登录EADAF管理后台
2. 进入"三方应用" → "应用"
3. 点击应用的"SSO"按钮
4. 开启"启用 SSO"开关
5. 填写SSO配置信息
6. 点击"保存"

### 1.2 字段说明

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| **启用 SSO** | 开关 | 是 | 是否启用SSO单点登录 | ✅ 开启 |
| **签名盐值** | 文本 | 是 | 用于JWT签名的盐值，请妥善保管 | `my-app-salt-2024` |
| **重定向 URI** | 文本 | 是 | SSO登录成功后的回调地址 | `https://my-app.com/auth/callback` |
| **跳转模式** | 下拉 | 否 | JWT信息传递方式 | `POST 跳转` / `302 重定向 + URL参数` |
| **EADAF系统URL** | 文本 | 否 | 统一鉴权系统(EADAF)的访问地址，自动使用当前域名，不可编辑 | `https://iam.company.com` |
| **客户端ID** | 文本 | 否 | OIDC客户端标识符，自动使用应用代码，不可编辑，支持复制 | `my-app-client` |
| **客户端密钥** | 文本 | 否 | OIDC客户端密钥，不可编辑，点击"生成密钥"按钮生成 | `generated-secret-key` |
| **发行者URL** | 文本 | 否 | OIDC发行者URL，自动使用当前域名，不可编辑，支持复制 | `https://iam.company.com` |
| **业务系统URL** | 文本 | 否 | 业务系统的访问地址，SSO登录成功后重定向回此地址 | `https://my-app.com` |
| **额外参数** | JSON | 否 | 其他SSO协议特定的参数 | `{"scope": "openid profile email"}` |

### 1.3 跳转模式说明

#### POST 跳转模式（推荐）
- JWT信息在请求体中传递
- 安全性高，适合Web应用
- 需要后端处理POST请求

#### 302 重定向 + URL参数模式
- JWT信息在URL参数中传递
- 简单直接，适合移动端
- 需要注意URL长度限制

## 二、业务系统接入

### 2.1 SSO登录流程说明

```
1. 用户访问业务系统 → https://my-app.com
2. 业务系统重定向到EADAF系统 → https://iam.company.com/auth/login?app=my-app
3. 用户在EADAF系统登录
4. EADAF系统重定向回业务系统 → https://my-app.com/auth/callback
```

**字段作用说明：**
- **EADAF系统URL**：第2步中业务系统重定向的地址
- **业务系统URL**：第4步中EADAF系统重定向回的地址
- **重定向URI**：具体的回调地址，通常是业务系统URL + `/auth/callback`

### 2.1 获取应用配置

首先需要获取应用的SSO配置信息：

```typescript
// 获取应用SSO配置
const getAppSsoConfig = async (appId: string) => {
  const response = await fetch(`/api/v1/applications-sso/${appId}`);
  const data = await response.json();
  return data.data;
};
```

### 2.2 前端接入代码

#### 2.2.1 检查登录状态

```typescript
// 检查用户是否已登录
const checkLoginStatus = async () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    
    const response = await fetch('/api/v1/auth/check', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
};
```

#### 2.2.2 重定向到SSO登录

```typescript
// 重定向到EADAF系统登录页面
const redirectToIamLogin = (appId: string) => {
  const iamLoginUrl = `https://iam.company.com/auth/login?app=${appId}`;
  window.location.href = iamLoginUrl;
};
```

#### 2.2.3 处理SSO回调

```typescript
// 处理SSO回调
const handleSsoCallback = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // POST跳转模式：从请求体获取数据
  if (urlParams.get('redirect_mode') === 'POST_REDIRECT') {
    const formData = new FormData();
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    const userInfo = JSON.parse(urlParams.get('user_info') || '{}');
    
    // 保存token
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user_info', JSON.stringify(userInfo));
    
    // 跳转到应用首页
    window.location.href = '/dashboard';
  }
  
  // 302重定向模式：从URL参数获取数据
  else if (urlParams.get('redirect_mode') === 'HEADER_REDIRECT') {
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    const userInfo = JSON.parse(urlParams.get('user_info') || '{}');
    
    // 保存token
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user_info', JSON.stringify(userInfo));
    
    // 跳转到应用首页
    window.location.href = '/dashboard';
  }
};
```

### 2.3 后端接入代码

#### 2.3.1 验证JWT Token

```typescript
// 验证JWT Token
const verifyJwtToken = (token: string, secret: string) => {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    throw new Error('Invalid token');
  }
};
```

#### 2.3.2 处理SSO回调

```typescript
// Express.js 处理SSO回调
app.post('/auth/callback', (req, res) => {
  const { access_token, refresh_token, user_info, verify } = req.body;
  
  try {
    // 验证token
    const decoded = verifyJwtToken(access_token, process.env.JWT_SECRET);
    
    // 保存用户信息到session
    req.session.user = JSON.parse(user_info);
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    
    // 跳转到应用首页
    res.redirect('/dashboard');
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
});
```

### 2.4 完整接入示例

#### 2.4.1 前端完整示例

```typescript
// SSO登录管理类
class SsoManager {
  private appId: string;
  private ssoConfig: any;
  
  constructor(appId: string) {
    this.appId = appId;
  }
  
  // 初始化SSO配置
  async init() {
    this.ssoConfig = await getAppSsoConfig(this.appId);
  }
  
  // 检查登录状态
  async isLoggedIn(): Promise<boolean> {
    return await checkLoginStatus();
  }
  
  // 执行SSO登录
  login() {
    if (!this.ssoConfig) {
      throw new Error('SSO config not initialized');
    }
    
    const iamLoginUrl = `${this.ssoConfig.base_url}/auth/login?app=${this.appId}`;
    window.location.href = iamLoginUrl;
  }
  
  // 处理SSO回调
  handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectMode = urlParams.get('redirect_mode') || 'POST_REDIRECT';
    
    if (redirectMode === 'POST_REDIRECT') {
      this.handlePostRedirect(urlParams);
    } else {
      this.handleHeaderRedirect(urlParams);
    }
  }
  
  private handlePostRedirect(params: URLSearchParams) {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const userInfo = JSON.parse(params.get('user_info') || '{}');
    
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user_info', JSON.stringify(userInfo));
    
    window.location.href = '/dashboard';
  }
  
  private handleHeaderRedirect(params: URLSearchParams) {
    // 302重定向模式的处理逻辑
    this.handlePostRedirect(params);
  }
}

// 使用示例
const ssoManager = new SsoManager('your-app-id');
await ssoManager.init();

// 检查登录状态
if (!(await ssoManager.isLoggedIn())) {
  ssoManager.login();
} else {
  // 已登录，跳转到应用首页
  window.location.href = '/dashboard';
}
```

#### 2.4.2 后端完整示例

```typescript
// Express.js 后端SSO处理
import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();

// SSO回调处理
app.post('/auth/callback', async (req, res) => {
  try {
    const { access_token, refresh_token, user_info, verify } = req.body;
    
    // 验证JWT token
    const decoded = jwt.verify(access_token, process.env.JWT_SECRET);
    
    // 保存用户信息
    req.session.user = JSON.parse(user_info);
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    
    res.redirect('/dashboard');
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// 验证用户身份中间件
const authenticateUser = (req: any, res: any, next: any) => {
  const token = req.session.access_token;
  
  if (!token) {
    return res.redirect('/login');
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.redirect('/login');
  }
};

// 受保护的路由
app.get('/dashboard', authenticateUser, (req, res) => {
  res.render('dashboard', { user: req.user });
});
```

## 三、常见问题

### 3.1 登录后跳转错误
**问题**：登录后跳转到错误的页面
**解决**：检查`重定向 URI`配置是否正确

### 3.2 Token验证失败
**问题**：JWT token验证失败
**解决**：检查`签名盐值`是否与SSO系统一致

### 3.3 字段不显示
**问题**：SSO配置界面中某些字段不显示
**解决**：清除浏览器缓存，强制刷新页面

### 3.4 跨域问题
**问题**：前端无法访问SSO系统
**解决**：配置CORS允许跨域访问

## 四、安全注意事项

1. **签名盐值保密**：不要在前端代码中暴露签名盐值
2. **HTTPS传输**：生产环境必须使用HTTPS
3. **Token过期处理**：定期检查和刷新JWT token
4. **URL验证**：确保重定向URI的域名正确
5. **敏感信息**：不要在URL参数中传递敏感信息
