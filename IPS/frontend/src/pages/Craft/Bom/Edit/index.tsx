/**
 * BOM 结构编辑 — FixHeaderPage + Tree
 */
import { Button, Card, Form, InputNumber, Select, Space, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { VersionActions } from '@/components/craft/VersionActions';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';
import { MATERIAL_NODE_TYPE_OPTIONS } from '@/constants/enums';
import { listMaterials } from '@/services/master';
import {
  getBomScheme,
  obsoleteBomScheme,
  publishBomScheme,
  reviseBomScheme,
  saveBomTree,
} from '@/services/craft';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

type TreeNode = {
  clientKey: string;
  parentClientKey?: string | null;
  materialId?: string | null;
  nodeType: string;
  quantity?: number;
  title?: string;
};

function buildAntdTree(nodes: TreeNode[]): DataNode[] {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const p = n.parentClientKey ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(n);
  }
  const walk = (parent: string | null): DataNode[] =>
    (byParent.get(parent) ?? []).map((n) => ({
      key: n.clientKey,
      title: `${MATERIAL_NODE_TYPE_OPTIONS.find((o) => o.value === n.nodeType)?.label ?? n.nodeType} · ${n.title || n.materialId || n.clientKey}`,
      children: walk(n.clientKey),
    }));
  return walk(null);
}

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `n-${Date.now()}-${keySeq}`;
}

export default function BomSchemeEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheme, setScheme] = useState<Record<string, any> | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [materials, setMaterials] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  const readonly = scheme?.versionStatus !== 'DRAFT';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBomScheme(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res) || '加载失败');
        return;
      }
      const data = getApiData<{ scheme: any; nodes: any[] }>(res);
      setScheme(data?.scheme ?? null);
      const mapped: TreeNode[] = (data?.nodes ?? []).map((n) => ({
        clientKey: n.id,
        parentClientKey: n.parentId ?? null,
        materialId: n.materialId,
        nodeType: n.nodeType,
        quantity: n.quantity != null ? Number(n.quantity) : 1,
        title: n.materialId,
      }));
      setNodes(mapped);
      if (mapped[0]) setSelectedKey(mapped[0].clientKey);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    void listMaterials({ pageSize: 200 }).then((res) => {
      const list = parseApiListResponse(res);
      setMaterials(
        (list.data || []).map((m: any) => ({
          value: m.id,
          label: `${m.materialNo || ''} ${m.name || ''}`.trim() || m.id,
        })),
      );
    });
  }, [load]);

  useEffect(() => {
    const n = nodes.find((x) => x.clientKey === selectedKey);
    if (n) {
      form.setFieldsValue({
        nodeType: n.nodeType,
        materialId: n.materialId,
        quantity: n.quantity ?? 1,
      });
    }
  }, [selectedKey, nodes, form]);

  const treeData = useMemo(() => buildAntdTree(nodes), [nodes]);
  const selected = nodes.find((n) => n.clientKey === selectedKey);

  const applyNodeFields = () => {
    if (!selectedKey || readonly) return;
    const values = form.getFieldsValue();
    setNodes((prev) =>
      prev.map((n) =>
        n.clientKey === selectedKey
          ? {
              ...n,
              nodeType: values.nodeType,
              materialId: values.materialId,
              quantity: values.quantity,
              title: materials.find((m) => m.value === values.materialId)?.label,
            }
          : n,
      ),
    );
  };

  const addChild = () => {
    if (readonly) return;
    const parent = selectedKey;
    const parentNode = nodes.find((n) => n.clientKey === parent);
    if (parentNode?.nodeType === 'LANDING_GEAR') {
      // 默认加大部件
    }
    const key = newKey();
    setNodes((prev) => [
      ...prev,
      {
        clientKey: key,
        parentClientKey: parent,
        nodeType: parentNode?.nodeType === 'LANDING_GEAR' ? 'MAJOR_ASSEMBLY' : 'PART_LARGE',
        quantity: 1,
      },
    ]);
    setSelectedKey(key);
  };

  const addRoot = () => {
    if (readonly) return;
    if (nodes.some((n) => !n.parentClientKey)) {
      message.warning('已有根节点');
      return;
    }
    const key = newKey();
    setNodes([{ clientKey: key, parentClientKey: null, nodeType: 'LANDING_GEAR', quantity: 1 }]);
    setSelectedKey(key);
  };

  const removeNode = () => {
    if (!selectedKey || readonly) return;
    const kill = new Set<string>();
    const collect = (k: string) => {
      kill.add(k);
      nodes.filter((n) => n.parentClientKey === k).forEach((c) => collect(c.clientKey));
    };
    collect(selectedKey);
    setNodes((prev) => prev.filter((n) => !kill.has(n.clientKey)));
    setSelectedKey(null);
  };

  const handleSave = async () => {
    applyNodeFields();
    const snapshot = nodes.map((n) => {
      if (n.clientKey !== selectedKey) return n;
      const values = form.getFieldsValue();
      return {
        ...n,
        nodeType: values.nodeType ?? n.nodeType,
        materialId: values.materialId,
        quantity: values.quantity ?? 1,
      };
    });
    for (const n of snapshot) {
      if (!n.parentClientKey) continue;
      const parent = snapshot.find((p) => p.clientKey === n.parentClientKey);
      if (
        parent?.nodeType === 'LANDING_GEAR' &&
        (n.nodeType === 'PART_LARGE' || n.nodeType === 'PART_SMALL')
      ) {
        message.error('零件不得直接挂在起落架根下');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await saveBomTree(
        id,
        snapshot.map((n) => ({
          clientKey: n.clientKey,
          parentClientKey: n.parentClientKey ?? null,
          materialId: n.materialId ?? null,
          nodeType: n.nodeType,
          quantity: n.quantity ?? 1,
        })),
      );
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res) || '保存失败');
        return;
      }
      message.success('已保存');
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <FixHeaderPage
      title={
        <PageContainerTitleWithBack
          title={`BOM 结构 · ${scheme?.productModel ?? ''}`}
          backTo="/craft/bom"
        />
      }
      subTitle={
        <Space>
          <span>v{scheme?.version ?? '-'}</span>
          <VersionStatusTag status={scheme?.versionStatus} />
          {readonly && <Typography.Text type="secondary">只读（已发布/作废须升版后编辑）</Typography.Text>}
        </Space>
      }
      extra={
        <Space>
          {!readonly && (
            <Button type="primary" loading={saving || loading} onClick={() => void handleSave()}>
              保存结构
            </Button>
          )}
          <VersionActions
            status={scheme?.versionStatus}
            loading={saving}
            onPublish={async () => {
              const res = await publishBomScheme(id);
              if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
              else {
                message.success('已发布');
                await load();
              }
            }}
            onObsolete={async () => {
              const res = await obsoleteBomScheme(id);
              if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
              else {
                message.success('已作废');
                await load();
              }
            }}
            onRevise={async () => {
              const res = await reviseBomScheme(id);
              if (!isApiSuccess(res)) {
                message.error(getApiErrorMessage(res) || '升版失败');
                return;
              }
              const data = getApiData<{ scheme?: { id?: string } }>(res);
              message.success('已升版');
              if (data?.scheme?.id) navigate(`/craft/bom/${data.scheme.id}/edit`);
            }}
          />
        </Space>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, padding: 16 }}>
        <Card
          title="产品结构树"
          loading={loading}
          extra={
            !readonly && (
              <Space>
                <Button size="small" onClick={addRoot}>
                  添加根
                </Button>
                <Button size="small" disabled={!selectedKey} onClick={addChild}>
                  添加子节点
                </Button>
                <Button size="small" danger disabled={!selectedKey} onClick={removeNode}>
                  删除
                </Button>
              </Space>
            )
          }
        >
          {treeData.length ? (
            <Tree
              treeData={treeData}
              selectedKeys={selectedKey ? [selectedKey] : []}
              onSelect={(keys) => setSelectedKey((keys[0] as string) || null)}
              defaultExpandAll
            />
          ) : (
            <Typography.Text type="secondary">暂无节点，请添加根节点</Typography.Text>
          )}
        </Card>
        <Card title="节点属性" loading={loading}>
          {selected ? (
            <Form form={form} layout="vertical" onValuesChange={() => applyNodeFields()} disabled={readonly}>
              <Form.Item name="nodeType" label="节点类型" rules={[{ required: true }]}>
                <Select options={MATERIAL_NODE_TYPE_OPTIONS} />
              </Form.Item>
              <Form.Item name="materialId" label="物料">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={materials}
                />
              </Form.Item>
              <Form.Item name="quantity" label="数量">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          ) : (
            <Typography.Text type="secondary">请选择左侧节点</Typography.Text>
          )}
        </Card>
      </div>
    </FixHeaderPage>
  );
}
