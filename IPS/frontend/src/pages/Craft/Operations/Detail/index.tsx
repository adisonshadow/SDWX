/**
 * 工序详情：属性 / 工步DAG / 物料 / 引用
 */
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { DagPreview } from '@/components/craft/DagPreview';
import { VersionActions } from '@/components/craft/VersionActions';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';
import {
  DAG_EDGE_TYPE_OPTIONS,
  OPERATION_CATEGORY_OPTIONS,
} from '@/constants/enums';
import {
  cloneProcessOperation,
  deleteProcessStep,
  getProcessOperationBundle,
  listBopByOperation,
  obsoleteProcessOperation,
  publishProcessOperation,
  reviseProcessOperation,
  saveProcessOperationStructure,
} from '@/services/craft';
import { listInspectionItems, deleteInspectionItem } from '@/services/inspection';
import { listMaterials } from '@/services/master';
import { listWorkstationsCrud } from '@/services/workstation';
import { hasDagCycle } from '@/utils/dagCycleCheck';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';

type StepRow = {
  /** 已落库 id；新建未保存时为空 */
  id?: string;
  clientKey: string;
  stepNo: string;
  name?: string | null;
  remark?: string | null;
  sortOrder?: number;
  isInspectionPoint?: boolean;
  isMandatoryInspection?: boolean;
  inspectionSpec?: string | null;
  standardHours?: string | number | null;
};

type EdgeRow = {
  key: string;
  fromClientKey: string;
  toClientKey: string;
  edgeType: string;
};

type MatRow = {
  key: string;
  materialId: string;
  quantity?: number;
  isCollaboration?: boolean;
  kitCheck?: boolean;
};

let seq = 0;
const nk = (p = 'k') => `${p}-${Date.now()}-${++seq}`;

export default function ProcessOperationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operation, setOperation] = useState<Record<string, any> | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [materials, setMaterials] = useState<MatRow[]>([]);
  const [refs, setRefs] = useState<Record<string, any>[]>([]);
  const [stations, setStations] = useState<{ label: string; value: string }[]>([]);
  const [matOpts, setMatOpts] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  const readonly = operation?.versionStatus !== 'DRAFT';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProcessOperationBundle(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res) || '加载失败');
        return;
      }
      const data = getApiData<{
        operation: any;
        steps: any[];
        stepEdges: any[];
        materials: any[];
      }>(res);
      setOperation(data?.operation ?? null);
      form.setFieldsValue({
        category: data?.operation?.category,
        standardHours: data?.operation?.standardHours,
        prepareHours: data?.operation?.prepareHours,
        assistHours: data?.operation?.assistHours,
        kitRequired: data?.operation?.kitRequired,
        defaultWorkstationId: data?.operation?.defaultWorkstationId,
      });
      const stepRows: StepRow[] = (data?.steps ?? []).map((s) => ({
        id: s.id,
        clientKey: s.id,
        stepNo: s.stepNo,
        name: s.name,
        remark: s.remark,
        sortOrder: s.sortOrder ?? 0,
        isInspectionPoint: !!s.isInspectionPoint,
        isMandatoryInspection: !!s.isMandatoryInspection,
        inspectionSpec: s.inspectionSpec,
        standardHours: s.standardHours,
      }));
      setSteps(stepRows);
      const keyById = new Map(stepRows.map((s) => [s.clientKey, s.clientKey]));
      setEdges(
        (data?.stepEdges ?? []).map((e: any) => ({
          key: e.id || nk('e'),
          fromClientKey: keyById.get(e.fromStepId) || e.fromStepId,
          toClientKey: keyById.get(e.toStepId) || e.toStepId,
          edgeType: e.edgeType || 'NORMAL',
        })),
      );
      setMaterials(
        (data?.materials ?? []).map((m: any) => ({
          key: m.id || nk('m'),
          materialId: m.materialId,
          quantity: m.quantity != null ? Number(m.quantity) : 1,
          isCollaboration: !!m.isCollaboration,
          kitCheck: !!m.kitCheck,
        })),
      );

      const nodeRes = await listBopByOperation(id);
      const nodes = parseApiListResponse(nodeRes).data || [];
      const schemeIds = [...new Set(nodes.map((n: any) => n.bopSchemeId).filter(Boolean))];
      setRefs(schemeIds.map((sid) => ({ id: sid })));
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    void load();
    void listWorkstationsCrud({ pageSize: 200 }).then((res) => {
      const list = parseApiListResponse(res);
      setStations(
        (list.data || []).map((s: any) => ({
          value: s.id,
          label: `${s.stationNo || ''} ${s.name || ''}`.trim(),
        })),
      );
    });
    void listMaterials({ pageSize: 200 }).then((res) => {
      const list = parseApiListResponse(res);
      setMatOpts(
        (list.data || []).map((m: any) => ({
          value: m.id,
          label: `${m.materialNo || ''} ${m.name || ''}`.trim() || m.id,
        })),
      );
    });
  }, [load]);

  const stepOptions = useMemo(
    () =>
      steps.map((s) => ({
        value: s.clientKey,
        label: s.name ? `${s.stepNo} ${s.name}` : s.stepNo,
      })),
    [steps],
  );

  const handleSave = async () => {
    if (
      hasDagCycle(
        steps.map((s) => s.clientKey),
        edges.map((e) => ({ fromId: e.fromClientKey, toId: e.toClientKey })),
      )
    ) {
      message.error('工步网络存在环路');
      return;
    }
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await saveProcessOperationStructure(id, {
        operation: values,
        steps: steps.map((s) => ({
          id: s.id,
          clientKey: s.clientKey,
          stepNo: s.stepNo,
          name: s.name,
          remark: s.remark,
          sortOrder: s.sortOrder,
          isInspectionPoint: s.isInspectionPoint,
          isMandatoryInspection: s.isMandatoryInspection,
          inspectionSpec: s.inspectionSpec,
          standardHours: s.standardHours,
        })),
        edges: edges.map(({ fromClientKey, toClientKey, edgeType }) => ({
          fromClientKey,
          toClientKey,
          edgeType,
        })),
        materials: materials.map(({ materialId, quantity, isCollaboration, kitCheck }) => ({
          materialId,
          quantity,
          isCollaboration,
          kitCheck,
        })),
      });
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
    <PageContainer
      loading={loading}
      title={
        <PageContainerTitleWithBack
          title={`工序 · ${operation?.operationNo ?? ''}`}
          backTo="/craft/operations"
        />
      }
      subTitle={
        <Space>
          <span>v{operation?.version ?? '-'}</span>
          <VersionStatusTag status={operation?.versionStatus} />
        </Space>
      }
      extra={
        <Space>
          {!readonly && (
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          )}
          <Button
            onClick={async () => {
              const res = await cloneProcessOperation(id);
              if (!isApiSuccess(res)) {
                message.error(getApiErrorMessage(res) || '克隆失败');
                return;
              }
              const data = getApiData<{ operation?: { id?: string } }>(res);
              if (data?.operation?.id) navigate(`/craft/operations/${data.operation.id}`);
            }}
          >
            克隆
          </Button>
          <VersionActions
            status={operation?.versionStatus}
            loading={saving}
            onPublish={async () => {
              const res = await publishProcessOperation(id);
              if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
              else {
                message.success('已发布');
                await load();
              }
            }}
            onObsolete={async () => {
              const res = await obsoleteProcessOperation(id);
              if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
              else {
                message.success('已作废');
                await load();
              }
            }}
            onRevise={async () => {
              const res = await reviseProcessOperation(id);
              if (!isApiSuccess(res)) {
                message.error(getApiErrorMessage(res) || '升版失败');
                return;
              }
              const data = getApiData<{ operation?: { id?: string } }>(res);
              message.success('已升版');
              if (data?.operation?.id) navigate(`/craft/operations/${data.operation.id}`);
            }}
          />
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'base',
            label: '基本属性',
            children: (
              <Card>
                <Form form={form} layout="vertical" disabled={readonly} style={{ maxWidth: 480 }}>
                  <Form.Item name="category" label="类别">
                    <Select options={OPERATION_CATEGORY_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="standardHours" label="标准工时" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="prepareHours" label="准备工时">
                    <Input />
                  </Form.Item>
                  <Form.Item name="assistHours" label="辅助工时">
                    <Input />
                  </Form.Item>
                  <Form.Item name="defaultWorkstationId" label="目标工位" rules={[{ required: true }]}>
                    <Select allowClear showSearch optionFilterProp="label" options={stations} />
                  </Form.Item>
                  <Form.Item name="kitRequired" label="齐套性" valuePropName="checked">
                    <Switch checkedChildren="齐套" unCheckedChildren="非齐套" />
                  </Form.Item>
                </Form>
                <p style={{ color: '#666' }}>
                  工序完工条件：末端工步完成且强制检验点均合格后方可报完工（执行层规则）。
                </p>
              </Card>
            ),
          },
          {
            key: 'steps',
            label: '工步与 DAG',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Card
                  title="工步"
                  extra={
                    !readonly && (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => navigate(`/craft/operations/${id}/steps/new`)}
                      >
                        新建工步
                      </Button>
                    )
                  }
                >
                  <Table
                    rowKey="clientKey"
                    size="small"
                    pagination={false}
                    dataSource={steps}
                    columns={[
                      { title: '工步号', dataIndex: 'stepNo', width: 100 },
                      {
                        title: '名称',
                        dataIndex: 'name',
                        width: 160,
                        render: (v: string) => v || '—',
                      },
                      {
                        title: '标准工时',
                        dataIndex: 'standardHours',
                        width: 100,
                        render: (v: any) => v ?? '—',
                      },
                      {
                        title: '检验点',
                        dataIndex: 'isInspectionPoint',
                        width: 90,
                        render: (v: boolean) =>
                          v ? <Tag color="orange">是</Tag> : <Tag>否</Tag>,
                      },
                      {
                        title: '强制',
                        dataIndex: 'isMandatoryInspection',
                        width: 80,
                        render: (v: boolean, r: StepRow) =>
                          r.isInspectionPoint ? (v ? <Tag color="red">强制</Tag> : '可选') : '—',
                      },
                      {
                        title: '检验摘要',
                        dataIndex: 'inspectionSpec',
                        ellipsis: true,
                        render: (v: string) => v || '—',
                      },
                      {
                        title: '备注',
                        dataIndex: 'remark',
                        ellipsis: true,
                        render: (v: string) => v || '—',
                      },
                      {
                        title: '操作',
                        width: readonly ? 80 : 140,
                        fixed: 'right' as const,
                        render: (_: any, r: StepRow) => (
                          <Space size={0}>
                            {r.id ? (
                              <Button
                                type="link"
                                size="small"
                                onClick={() =>
                                  navigate(`/craft/operations/${id}/steps/${r.id}`)
                                }
                              >
                                {readonly ? '查看' : '编辑'}
                              </Button>
                            ) : null}
                            {!readonly && r.id ? (
                              <Button
                                type="link"
                                danger
                                size="small"
                                onClick={() => {
                                  modal.confirm({
                                    title: '确认删除该工步？',
                                    content:
                                      '将同时删除其检验项定义，并从本工序 DAG 中移除相关边。保存工序结构后生效的边关系也会同步。',
                                    okButtonProps: { danger: true },
                                    onOk: async () => {
                                      if (!r.id) return;
                                      const itemsRes = await listInspectionItems({
                                        processStepId: r.id,
                                        pageSize: 200,
                                      });
                                      const items = (parseApiListResponse(itemsRes).data ||
                                        []) as Record<string, any>[];
                                      for (const it of items) {
                                        if (it.id) await deleteInspectionItem(it.id);
                                      }
                                      const delRes = await deleteProcessStep(r.id);
                                      if (!isApiSuccess(delRes)) {
                                        message.error(getApiErrorMessage(delRes, '删除失败'));
                                        return;
                                      }
                                      setSteps((prev) =>
                                        prev.filter((s) => s.clientKey !== r.clientKey),
                                      );
                                      setEdges((prev) =>
                                        prev.filter(
                                          (e) =>
                                            e.fromClientKey !== r.clientKey &&
                                            e.toClientKey !== r.clientKey,
                                        ),
                                      );
                                      message.success('已删除工步');
                                    },
                                  });
                                }}
                              >
                                删除
                              </Button>
                            ) : null}
                          </Space>
                        ),
                      },
                    ]}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: '暂无工步，请点击「新建工步」' }}
                  />
                </Card>
                <Card
                  title="有向边"
                  extra={
                    !readonly && (
                      <Button
                        size="small"
                        onClick={() =>
                          setEdges((prev) => [
                            ...prev,
                            {
                              key: nk('e'),
                              fromClientKey: steps[0]?.clientKey || '',
                              toClientKey: steps[1]?.clientKey || steps[0]?.clientKey || '',
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
                            stepOptions.find((o) => o.value === v)?.label ?? v
                          ) : (
                            <Select
                              style={{ width: '100%' }}
                              options={stepOptions}
                              value={v}
                              onChange={(val) =>
                                setEdges((prev) =>
                                  prev.map((e) =>
                                    e.key === r.key ? { ...e, fromClientKey: val } : e,
                                  ),
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
                            stepOptions.find((o) => o.value === v)?.label ?? v
                          ) : (
                            <Select
                              style={{ width: '100%' }}
                              options={stepOptions}
                              value={v}
                              onChange={(val) =>
                                setEdges((prev) =>
                                  prev.map((e) =>
                                    e.key === r.key ? { ...e, toClientKey: val } : e,
                                  ),
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
                                  prev.map((e) =>
                                    e.key === r.key ? { ...e, edgeType: val } : e,
                                  ),
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
                                onClick={() =>
                                  setEdges((prev) => prev.filter((e) => e.key !== r.key))
                                }
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
                  nodes={steps.map((s) => ({
                    id: s.clientKey,
                    label: s.name ? `${s.stepNo} ${s.name}` : s.stepNo,
                  }))}
                  edges={edges.map((e) => ({
                    fromId: e.fromClientKey,
                    toId: e.toClientKey,
                    edgeType: e.edgeType,
                  }))}
                />
              </Space>
            ),
          },
          {
            key: 'mats',
            label: '物料挂载',
            children: (
              <Card
                extra={
                  !readonly && (
                    <Button
                      size="small"
                      onClick={() =>
                        setMaterials((prev) => [
                          ...prev,
                          { key: nk('m'), materialId: '', quantity: 1 },
                        ])
                      }
                    >
                      添加物料
                    </Button>
                  )
                }
              >
                <Table
                  rowKey="key"
                  size="small"
                  pagination={false}
                  dataSource={materials}
                  columns={[
                    {
                      title: '物料',
                      dataIndex: 'materialId',
                      render: (v: any, r: any) =>
                        readonly ? (
                          matOpts.find((o) => o.value === v)?.label ?? v
                        ) : (
                          <Select
                            style={{ width: '100%' }}
                            showSearch
                            optionFilterProp="label"
                            options={matOpts}
                            value={v || undefined}
                            onChange={(val) =>
                              setMaterials((prev) =>
                                prev.map((m) =>
                                  m.key === r.key ? { ...m, materialId: val } : m,
                                ),
                              )
                            }
                          />
                        ),
                    },
                    {
                      title: '数量',
                      dataIndex: 'quantity',
                      width: 100,
                      render: (v: any, r: any) =>
                        readonly ? (
                          v
                        ) : (
                          <InputNumber
                            min={0}
                            value={v}
                            onChange={(val) =>
                              setMaterials((prev) =>
                                prev.map((m) =>
                                  m.key === r.key ? { ...m, quantity: Number(val) || 0 } : m,
                                ),
                              )
                            }
                          />
                        ),
                    },
                    {
                      title: '协作件',
                      dataIndex: 'isCollaboration',
                      width: 90,
                      render: (v: any, r: any) => (
                        <Switch
                          disabled={readonly}
                          checked={!!v}
                          onChange={(c) =>
                            setMaterials((prev) =>
                              prev.map((m) =>
                                m.key === r.key ? { ...m, isCollaboration: c } : m,
                              ),
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
                              onClick={() =>
                                setMaterials((prev) => prev.filter((m) => m.key !== r.key))
                              }
                            >
                              删除
                            </Button>
                          ),
                        }
                      : {},
                  ].filter((c: any) => c.title) as any}
                />
              </Card>
            ),
          },
          {
            key: 'refs',
            label: '被 BOP 引用',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={refs}
                  pagination={false}
                  columns={[
                    {
                      title: 'BOP 方案 ID',
                      dataIndex: 'id',
                      render: (v) => <Link to={`/craft/bop/${v}/edit`}>{v}</Link>,
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
