/**
 * BOP 结构编辑 / 排故临时搭路线（isTroubleshoot）
 */
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { DagPreview } from '@/components/craft/DagPreview';
import { VersionActions } from '@/components/craft/VersionActions';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';
import { DAG_EDGE_TYPE_OPTIONS, REPAIR_METHOD_OPTIONS } from '@/constants/enums';
import {
  createBopScheme,
  getBopSchemeBundle,
  getProcessOperationBundle,
  listBomSchemes,
  listProcessOperations,
  obsoleteBopScheme,
  publishBopScheme,
  reviseBopScheme,
  saveBopStructure,
} from '@/services/craft';
import { hasDagCycle } from '@/utils/dagCycleCheck';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

type NodeRow = {
  clientKey: string;
  nodeNo: string;
  operationId: string;
  materialId?: string | null;
  sortOrder?: number;
  operationLabel?: string;
};

type EdgeRow = {
  key: string;
  fromClientKey: string;
  toClientKey: string;
  edgeType: string;
};

let seq = 0;
const nk = (p = 'k') => `${p}-${Date.now()}-${++seq}`;

type Props = { isTroubleshoot?: boolean };

export default function BopSchemeEditPage({ isTroubleshoot = false }: Props) {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [id, setId] = useState(routeId || '');
  const [loading, setLoading] = useState(!!routeId);
  const [saving, setSaving] = useState(false);
  const [scheme, setScheme] = useState<Record<string, any> | null>(null);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [opOpts, setOpOpts] = useState<{ label: string; value: string }[]>([]);
  const [bomOpts, setBomOpts] = useState<{ label: string; value: string }[]>([]);
  const [drawerOp, setDrawerOp] = useState<Record<string, any> | null>(null);
  const [form] = Form.useForm();

  const readonly = scheme ? scheme.versionStatus !== 'DRAFT' : false;

  const loadOps = useCallback(async () => {
    const res = await listProcessOperations({ versionStatus: 'PUBLISHED', pageSize: 200 });
    const list = parseApiListResponse(res);
    setOpOpts(
      (list.data || []).map((o: any) => ({
        value: o.id,
        label: `${o.operationNo} v${o.version}`,
      })),
    );
  }, []);

  const load = useCallback(
    async (schemeId: string) => {
      setLoading(true);
      try {
        const res = await getBopSchemeBundle(schemeId);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res) || '加载失败');
          return;
        }
        const data = getApiData<{ scheme: any; nodes: any[]; edges: any[] }>(res);
        setScheme(data?.scheme ?? null);
        form.setFieldsValue({
          productModel: data?.scheme?.productModel,
          repairMethod: data?.scheme?.repairMethod,
          bomSchemeId: data?.scheme?.bomSchemeId,
          batchSerial: data?.scheme?.batchSerial,
        });
        const nodeRows: NodeRow[] = (data?.nodes ?? []).map((n) => ({
          clientKey: n.id,
          nodeNo: n.nodeNo,
          operationId: n.operationId,
          materialId: n.materialId,
          sortOrder: n.sortOrder ?? 0,
        }));
        setNodes(nodeRows);
        setEdges(
          (data?.edges ?? []).map((e: any) => ({
            key: e.id || nk('e'),
            fromClientKey: e.fromNodeId,
            toClientKey: e.toNodeId,
            edgeType: e.edgeType || 'NORMAL',
          })),
        );
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

  useEffect(() => {
    void loadOps();
    void listBomSchemes({ versionStatus: 'PUBLISHED', pageSize: 100 }).then((res) => {
      const list = parseApiListResponse(res);
      setBomOpts(
        (list.data || []).map((b: any) => ({
          value: b.id,
          label: `${b.productModel} v${b.version}`,
        })),
      );
    });
  }, [loadOps]);

  useEffect(() => {
    if (routeId) {
      setId(routeId);
      void load(routeId);
      return;
    }
    // 排故新建：无 id 时先创建空方案
    if (isTroubleshoot && !routeId) {
      const productModel = searchParams.get('productModel') || 'TROUBLESHOOT';
      void (async () => {
        setLoading(true);
        try {
          const res = await createBopScheme({
            productModel,
            repairMethod: 'TROUBLESHOOT',
            bomSchemeId: searchParams.get('bomSchemeId') || null,
          });
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res) || '创建失败');
            return;
          }
          const data = getApiData<{ scheme?: { id?: string } }>(res);
          if (data?.scheme?.id) {
            setId(data.scheme.id);
            navigate(`/craft/bop/${data.scheme.id}/edit?troubleshoot=1`, { replace: true });
          }
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [routeId, isTroubleshoot, searchParams, load, navigate]);

  const nodeOptions = useMemo(
    () => nodes.map((n) => ({ value: n.clientKey, label: n.nodeNo })),
    [nodes],
  );

  const handleSave = async () => {
    if (!id) return;
    if (
      hasDagCycle(
        nodes.map((n) => n.clientKey),
        edges.map((e) => ({ fromId: e.fromClientKey, toId: e.toClientKey })),
      )
    ) {
      message.error('工序网络存在环路');
      return;
    }
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await saveBopStructure(id, {
        scheme: values,
        nodes: nodes.map(({ clientKey, nodeNo, operationId, materialId, sortOrder }) => ({
          clientKey,
          nodeNo,
          operationId,
          materialId,
          sortOrder,
        })),
        edges: edges.map(({ fromClientKey, toClientKey, edgeType }) => ({
          fromClientKey,
          toClientKey,
          edgeType,
        })),
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res) || '保存失败');
        return;
      }
      message.success('已保存');
      await load(id);
    } finally {
      setSaving(false);
    }
  };

  const titlePrefix = isTroubleshoot || scheme?.repairMethod === 'TROUBLESHOOT' ? '排故搭路线' : 'BOP 结构';

  return (
    <FixHeaderPage
      title={
        <PageContainerTitleWithBack
          title={`${titlePrefix} · ${scheme?.productModel ?? ''}`}
          backTo="/craft/bop"
        />
      }
      subTitle={
        <Space>
          <span>v{scheme?.version ?? '-'}</span>
          <VersionStatusTag status={scheme?.versionStatus} />
          {readonly && (
            <Typography.Text type="secondary">只读（须升版后编辑）</Typography.Text>
          )}
        </Space>
      }
      extra={
        <Space>
          {!readonly && id && (
            <Button type="primary" loading={saving || loading} onClick={() => void handleSave()}>
              保存结构
            </Button>
          )}
          {id && (
            <VersionActions
              status={scheme?.versionStatus}
              loading={saving}
              onPublish={async () => {
                const res = await publishBopScheme(id);
                if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
                else {
                  message.success('已发布，可供令号投产选用');
                  await load(id);
                }
              }}
              onObsolete={async () => {
                const res = await obsoleteBopScheme(id);
                if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
                else {
                  message.success('已作废');
                  await load(id);
                }
              }}
              onRevise={async () => {
                const res = await reviseBopScheme(id);
                if (!isApiSuccess(res)) {
                  message.error(getApiErrorMessage(res) || '升版失败');
                  return;
                }
                const data = getApiData<{ scheme?: { id?: string } }>(res);
                message.success('已升版');
                if (data?.scheme?.id) navigate(`/craft/bop/${data.scheme.id}/edit`);
              }}
            />
          )}
        </Space>
      }
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="方案属性" loading={loading}>
          <Form form={form} layout="inline" disabled={readonly}>
            <Form.Item name="productModel" label="装备型号" rules={[{ required: true }]}>
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="repairMethod" label="修理方式" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={REPAIR_METHOD_OPTIONS} />
            </Form.Item>
            <Form.Item name="bomSchemeId" label="关联 BOM">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 220 }}
                options={bomOpts}
              />
            </Form.Item>
            <Form.Item name="batchSerial" label="批架次">
              <Input style={{ width: 120 }} />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="工序节点（引用已发布工序）"
          extra={
            !readonly && (
              <Button
                size="small"
                onClick={() =>
                  setNodes((prev) => [
                    ...prev,
                    {
                      clientKey: nk('n'),
                      nodeNo: `N${String(prev.length + 1).padStart(2, '0')}`,
                      operationId: opOpts[0]?.value || '',
                      sortOrder: prev.length,
                    },
                  ])
                }
              >
                添加工序
              </Button>
            )
          }
        >
          <Table
            rowKey="clientKey"
            size="small"
            pagination={false}
            dataSource={nodes}
            columns={[
              {
                title: '节点号',
                dataIndex: 'nodeNo',
                width: 120,
                render: (v: any, r: any) =>
                  readonly ? (
                    v
                  ) : (
                    <Input
                      value={v}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.clientKey === r.clientKey ? { ...n, nodeNo: e.target.value } : n,
                          ),
                        )
                      }
                    />
                  ),
              },
              {
                title: '工序',
                dataIndex: 'operationId',
                render: (v: any, r: any) =>
                  readonly ? (
                    <Button
                      type="link"
                      onClick={async () => {
                        const res = await getProcessOperationBundle(v);
                        if (isApiSuccess(res)) {
                          setDrawerOp(getApiData<{ operation: any }>(res)?.operation ?? null);
                        }
                      }}
                    >
                      {opOpts.find((o) => o.value === v)?.label ?? v}
                    </Button>
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      showSearch
                      optionFilterProp="label"
                      options={opOpts}
                      value={v || undefined}
                      onChange={(val) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.clientKey === r.clientKey ? { ...n, operationId: val } : n,
                          ),
                        )
                      }
                    />
                  ),
              },
              {
                title: '摘要',
                width: 100,
                render: (_: any, r: any) => (
                  <Button
                    type="link"
                    size="small"
                    onClick={async () => {
                      const res = await getProcessOperationBundle(r.operationId);
                      if (isApiSuccess(res)) {
                        setDrawerOp(getApiData<{ operation: any }>(res)?.operation ?? null);
                      }
                    }}
                  >
                    查看
                  </Button>
                ),
              },
              !readonly
                ? {
                    title: '操作',
                    width: 70,
                    render: (_: any, r: any) => (
                      <Button
                        type="link"
                        danger
                        size="small"
                        onClick={() => {
                          setNodes((prev) => prev.filter((n) => n.clientKey !== r.clientKey));
                          setEdges((prev) =>
                            prev.filter(
                              (e) =>
                                e.fromClientKey !== r.clientKey && e.toClientKey !== r.clientKey,
                            ),
                          );
                        }}
                      >
                        删除
                      </Button>
                    ),
                  }
                : {},
            ].filter((c: any) => c.title) as any}
          />
        </Card>

        <Card
          title="工序级有向边"
          extra={
            !readonly && (
              <Button
                size="small"
                onClick={() =>
                  setEdges((prev) => [
                    ...prev,
                    {
                      key: nk('e'),
                      fromClientKey: nodes[0]?.clientKey || '',
                      toClientKey: nodes[1]?.clientKey || nodes[0]?.clientKey || '',
                      edgeType: 'NORMAL',
                    },
                  ])
                }
              >
                添加边
              </Button>
            )
          }
        >
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={edges}
            columns={[
              {
                title: '从',
                dataIndex: 'fromClientKey',
                render: (v: any, r: any) =>
                  readonly ? (
                    nodeOptions.find((o) => o.value === v)?.label ?? v
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      options={nodeOptions}
                      value={v}
                      onChange={(val) =>
                        setEdges((prev) =>
                          prev.map((e) => (e.key === r.key ? { ...e, fromClientKey: val } : e)),
                        )
                      }
                    />
                  ),
              },
              {
                title: '到',
                dataIndex: 'toClientKey',
                render: (v: any, r: any) =>
                  readonly ? (
                    nodeOptions.find((o) => o.value === v)?.label ?? v
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      options={nodeOptions}
                      value={v}
                      onChange={(val) =>
                        setEdges((prev) =>
                          prev.map((e) => (e.key === r.key ? { ...e, toClientKey: val } : e)),
                        )
                      }
                    />
                  ),
              },
              {
                title: '边类型',
                dataIndex: 'edgeType',
                width: 160,
                render: (v: any, r: any) =>
                  readonly ? (
                    DAG_EDGE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      options={DAG_EDGE_TYPE_OPTIONS}
                      value={v}
                      onChange={(val) =>
                        setEdges((prev) =>
                          prev.map((e) => (e.key === r.key ? { ...e, edgeType: val } : e)),
                        )
                      }
                    />
                  ),
              },
              !readonly
                ? {
                    title: '操作',
                    width: 70,
                    render: (_: any, r: any) => (
                      <Button
                        type="link"
                        danger
                        size="small"
                        onClick={() => setEdges((prev) => prev.filter((e) => e.key !== r.key))}
                      >
                        删除
                      </Button>
                    ),
                  }
                : {},
            ].filter((c: any) => c.title) as any}
          />
        </Card>

        <DagPreview
          title="工序级拓扑预览"
          nodes={nodes.map((n) => ({ id: n.clientKey, label: n.nodeNo }))}
          edges={edges.map((e) => ({
            fromId: e.fromClientKey,
            toId: e.toClientKey,
            edgeType: e.edgeType,
          }))}
        />
      </div>

      <Drawer
        title="工序摘要"
        open={!!drawerOp}
        onClose={() => setDrawerOp(null)}
        width={400}
      >
        {drawerOp && (
          <Space direction="vertical">
            <div>编码：{drawerOp.operationNo}</div>
            <div>标准工时：{drawerOp.standardHours}</div>
            <div>齐套：{drawerOp.kitRequired ? '是' : '否'}</div>
            <div>工位：{drawerOp.defaultWorkstationId || '—'}</div>
            <Link to={`/craft/operations/${drawerOp.id}`}>打开工序详情升版</Link>
          </Space>
        )}
      </Drawer>
    </FixHeaderPage>
  );
}
