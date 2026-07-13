# SSO字段名称优化总结

## 修改内容

### 1. 字段名称优化

| 原字段名 | 新字段名 | 说明 |
|----------|----------|------|
| **SSO系统URL** | **EADAF系统URL** | 更准确地描述统一鉴权系统 |
| **前端应用URL** | **业务系统URL** | 更准确地描述业务系统 |

### 2. 字段说明优化

#### EADAF系统URL
- **原说明**：统一鉴权系统的基础URL
- **新说明**：统一鉴权系统(EADAF)的访问地址，业务系统重定向用户登录的地址
- **占位符**：`https://iam.company.com`

#### 业务系统URL  
- **原说明**：前端应用的访问URL
- **新说明**：业务系统的访问地址，SSO登录成功后重定向回此地址
- **占位符**：`https://my-app.com`

### 3. 文档更新

#### SSO登录流程说明
```
1. 用户访问业务系统 → https://my-app.com
2. 业务系统重定向到EADAF系统 → https://iam.company.com/auth/login?app=my-app
3. 用户在EADAF系统登录
4. EADAF系统重定向回业务系统 → https://my-app.com/auth/callback
```

#### 字段作用说明
- **EADAF系统URL**：第2步中业务系统重定向的地址
- **业务系统URL**：第4步中EADAF系统重定向回的地址
- **重定向URI**：具体的回调地址，通常是业务系统URL + `/auth/callback`

### 4. 代码示例更新

#### 前端代码
```typescript
// 重定向到EADAF系统登录页面
const redirectToIamLogin = (appId: string) => {
  const iamLoginUrl = `https://iam.company.com/auth/login?app=${appId}`;
  window.location.href = iamLoginUrl;
};
```

#### SSO管理类
```typescript
// 执行SSO登录
login() {
  if (!this.ssoConfig) {
    throw new Error('SSO config not initialized');
  }
  
  const iamLoginUrl = `${this.ssoConfig.base_url}/auth/login?app=${this.appId}`;
  window.location.href = iamLoginUrl;
}
```

## 优化效果

### 1. 更清晰的字段含义
- ✅ **EADAF系统URL**：明确指向统一鉴权系统
- ✅ **业务系统URL**：明确指向业务应用系统
- ✅ **重定向URI**：具体的回调地址

### 2. 更准确的工具提示
- ✅ 每个字段都有详细的用途说明
- ✅ 占位符文本更贴近实际使用场景
- ✅ 避免了"SSO系统"和"业务系统"的混淆

### 3. 更完整的文档说明
- ✅ 添加了SSO登录流程图
- ✅ 详细说明了每个字段在登录流程中的作用
- ✅ 更新了所有代码示例中的字段名称

## 测试建议

1. **检查字段显示**：确认新字段名称和说明正确显示
2. **验证工具提示**：鼠标悬停查看详细的字段说明
3. **测试配置保存**：确保字段名称修改不影响数据保存
4. **检查文档一致性**：确认文档和界面字段名称一致

现在SSO配置界面的字段含义更加清晰，用户不会再混淆"SSO系统URL"和"业务系统URL"的区别了！
