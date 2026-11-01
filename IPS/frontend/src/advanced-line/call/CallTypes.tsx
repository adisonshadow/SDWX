/**
 * 呼叫类型配置
 */
import { PlusOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Select, Switch, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { crudCreate, crudDelete, crudList, crudUpdate } from '@/services/crud';
import { request } from '@/utils/request';
import { message } from '@/utils/antdAppApis';

interface CallTypeRow {
  id: string;
  typeCode: string;
  typeName: string;
  enabled?: boolean;
  soundEnabled?: boolean;
  soundKey?: string;
  roleIds?: string;
}

interface RoleOption {
  id: string;
  name: string;
  code?: string;
}

const SOUNDS = [
  { value: 'beep', label: '提示音' },
  { value: 'alarm', label: '警报' },
  { value: 'chime', label: '铃声' },
];

function parseRoles(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function CallTypesPage() {
  const [items, setItems] = useState<CallTypeRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CallTypeRow | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    crudList<CallTypeRow>('service', 'CallType', { pageSize: 100 })
      .then((res) => setItems(res.data.items ?? []))
      .catch((e: Error) => message.error(e.message));
  };

  useEffect(() => {
    load();
    request<{ items: RoleOption[] }>('/api/ips/call-roles')
      .then((res) => setRoles(res.data.items ?? []))
      .catch(() => setRoles([]));
  }, []);

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? id;

  const submit = async () => {
    const values = await form.validateFields();
    const body = {
      typeCode: values.typeCode,
      typeName: values.typeName,
      enabled: values.enabled !== false,
      soundEnabled: values.soundEnabled === true,
      soundKey: values.soundKey || 'beep',
      roleIds: JSON.stringify(values.roleIds ?? []),
    };
    try {
      if (editing) await crudUpdate('service', 'CallType', editing.id, body);
      else await crudCreate('service', 'CallType', body);
      setOpen(false);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <PageContainer extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ enabled: true, soundEnabled: false, soundKey: 'beep', roleIds: [] }); setOpen(true); }}>新建</Button>}>
      <Table
        rowKey="id"
        dataSource={items}
        pagination={false}
        columns={[
          { title: '编码', dataIndex: 'typeCode' },
          { title: '名称', dataIndex: 'typeName' },
          { title: '启用', dataIndex: 'enabled', render: (v: boolean) => (v === false ? '否' : '是') },
          { title: '发声', dataIndex: 'soundEnabled', render: (v: boolean) => (v ? '是' : '否') },
          { title: '声音', dataIndex: 'soundKey', render: (v: string) => SOUNDS.find((s) => s.value === v)?.label ?? v },
          {
            title: '角色',
            dataIndex: 'roleIds',
            render: (v: string) => parseRoles(v).map((id) => <Tag key={id}>{roleName(id)}</Tag>),
          },
          {
            title: '操作',
            render: (_, row) => (
              <>
                <Button type="link" onClick={() => { setEditing(row); form.setFieldsValue({ ...row, roleIds: parseRoles(row.roleIds) }); setOpen(true); }}>编辑</Button>
                <Button type="link" danger onClick={() => crudDelete('service', 'CallType', row.id).then(load).catch((e: Error) => message.error(e.message))}>删除</Button>
              </>
            ),
          },
        ]}
      />
      <Modal title={editing ? '编辑呼叫类型' : '新建呼叫类型'} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="typeCode" label="编码" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="typeName" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="soundEnabled" label="发声" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="soundKey" label="声音"><Select options={SOUNDS} /></Form.Item>
          <Form.Item name="roleIds" label="对应角色">
            <Select mode="multiple" options={roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
