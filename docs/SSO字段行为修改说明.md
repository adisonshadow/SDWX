# SSO配置界面字段行为修改

## 修改内容

### 1. 客户端ID字段
- **行为**：自动使用应用代码，不可编辑
- **显示**：显示为禁用状态，值为应用代码
- **实现**：`disabled` 属性 + `record.code` 作为默认值

### 2. 客户端密钥字段
- **行为**：不可编辑，点击"生成密钥"按钮生成
- **显示**：禁用输入框 + 右侧"生成密钥"按钮
- **实现**：`disabled` 属性 + `addonAfter` 按钮

### 3. 发行者URL字段
- **行为**：自动使用当前域名，不可编辑
- **显示**：显示为禁用状态，值为当前域名
- **实现**：`disabled` 属性 + `window.location.origin` 作为默认值

## 代码实现

### 前端字段配置
```typescript
// 客户端ID - 使用应用代码，不可编辑
<ProFormText
  name={['sso_config', 'client_id']}
  label="客户端ID"
  placeholder="应用代码"
  tooltip="OIDC客户端标识符，使用应用代码"
  disabled
/>

// 客户端密钥 - 不可编辑，有生成按钮
<ProFormText
  name={['sso_config', 'client_secret']}
  label="客户端密钥"
  placeholder="点击生成密钥按钮生成"
  tooltip="OIDC客户端密钥"
  disabled
  addonAfter={
    <Button 
      type="primary" 
      size="small"
      onClick={handleGenerateSecret}
    >
      生成密钥
    </Button>
  }
/>

// 发行者URL - 使用当前域名，不可编辑
<ProFormText
  name={['sso_config', 'issuer']}
  label="发行者URL"
  placeholder="当前域名"
  tooltip="OIDC发行者URL，使用当前域名"
  disabled
/>
```

### 表单初始化逻辑
```typescript
ssoConfigForm.setFieldsValue({
  sso_enabled: record.sso_enabled,
  sso_config: {
    ...record.sso_config,
    client_id: record.code, // 使用应用代码
    issuer: window.location.origin, // 使用当前域名
    // 其他字段...
  },
});
```

### 生成密钥处理函数
```typescript
const handleGenerateSecret = async () => {
  try {
    if (!currentApplication) return;
    
    const salt = ssoConfigForm.getFieldValue(['sso_config', 'salt']);
    if (!salt) {
      messageApi.error('请先输入签名盐值');
      return;
    }

    const res = await postApplicationsIdGenerateSecret(
      { id: currentApplication.application_id },
      { salt }
    );

    if (res.code === 200 && res.data?.app_secret) {
      ssoConfigForm.setFieldsValue({
        sso_config: {
          ...ssoConfigForm.getFieldValue('sso_config'),
          client_secret: res.data.app_secret,
        },
      });
      messageApi.success('生成客户端密钥成功');
    } else {
      messageApi.error(res.message || '生成失败');
    }
  } catch (e) {
    messageApi.error('生成失败');
  }
};
```

## 测试步骤

1. **访问SSO配置界面**
   - 登录EADAF管理后台
   - 进入"三方应用" → "应用"
   - 点击应用的"SSO"按钮

2. **检查字段行为**
   - **客户端ID**：应该显示为禁用状态，值为应用代码
   - **客户端密钥**：应该显示为禁用状态，右侧有"生成密钥"按钮
   - **发行者URL**：应该显示为禁用状态，值为当前域名

3. **测试生成密钥功能**
   - 输入签名盐值
   - 点击"生成密钥"按钮
   - 检查是否生成密钥并显示在字段中

## 预期结果

- ✅ 客户端ID自动使用应用代码，不可编辑
- ✅ 客户端密钥不可编辑，有生成按钮
- ✅ 发行者URL自动使用当前域名，不可编辑
- ✅ 生成密钥功能正常工作
- ✅ 所有字段都能正确保存
