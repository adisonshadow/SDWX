/**
 * ConfigPage — 内置配置页
 *
 * 配置 admin/frontend (OPWeb) 地址、EADAF 前端地址、SSO 应用 ID、双屏模式。
 * 保存后主进程重启到 OPWeb。支持测试连接。
 */
import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Switch, Space, Typography, App, Tag } from 'antd';

const { Title, Text } = Typography;

// electron preload 注入的 API
interface ElectronAPI {
  getLocal: () => Promise<{ config: Record<string, unknown> }>;
  saveConfig: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  testConnection: (baseUrl: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
}
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export default function ConfigPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    window.electronAPI?.getLocal().then(({ config }) => {
      form.setFieldsValue(config);
    });
  }, [form]);

  const handleTest = async () => {
    const baseUrl = form.getFieldValue('op_base_url');
    if (!baseUrl) {
      message.warning('请先填写服务器地址');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI!.testConnection(baseUrl);
      setTestResult({
        ok: result.ok,
        msg: result.ok ? `连接成功 (${result.status})` : result.error ?? `失败 (${result.status})`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await window.electronAPI!.saveConfig(values);
      message.success('配置已保存，正在打开作业界面...');
    } catch (e) {
      if (!(e as { errorFields?: unknown }).errorFields) {
        message.error((e as Error).message);
      }
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 16 }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              工位客户端配置
            </Title>
            <Text type="secondary">首次启动需配置服务器地址，保存后自动打开作业界面</Text>
          </div>

          <Form form={form} layout="vertical" initialValues={{ dual_screen: true }}>
            <Form.Item
              name="op_base_url"
              label="服务器地址 (OPWeb)"
              rules={[{ required: true, message: '请填写服务器地址' }]}
              extra="admin/frontend 地址，如 http://localhost:5181"
            >
              <Input placeholder="http://localhost:5181" />
            </Form.Item>

            <Space style={{ marginBottom: 16 }}>
              <Button loading={testing} onClick={handleTest}>
                测试连接
              </Button>
              {testResult && (
                <Tag color={testResult.ok ? 'success' : 'error'}>{testResult.msg}</Tag>
              )}
            </Space>

            <Form.Item name="eadaf_frontend_url" label="EADAF 前端地址 (SSO)">
              <Input placeholder="http://localhost:9527" />
            </Form.Item>

            <Form.Item name="sso_application_id" label="SSO 应用 ID">
              <Input placeholder="10000000-0001-4000-8000-000000000006" />
            </Form.Item>

            <Form.Item name="dual_screen" label="双屏模式" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>

            <Button type="primary" size="large" block onClick={handleSave}>
              保存并打开作业界面
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
