/**
 * 工卡详情 — 聚合视图（工序/工步/齐套/DAG）+ 操作按钮 + 检验录入
 *
 * 调 /api/ips/workcards/:id 取聚合数据；按状态显示接受/挂起/提交。
 */
import { PageContainer, ProDescriptions } from '@ant-design/pro-components';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Alert,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  DAG_EDGE_TYPE_OPTIONS,
  DAG_EDGE_TYPE_VALUE_ENUM,
  INSPECTION_RESULT_OPTIONS,
  INSPECTION_RESULT_VALUE_ENUM,
  INSPECTION_TYPE_OPTIONS,
  KIT_DIMENSION_OPTIONS,
  OUTSOURCING_STATUS_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import {
  createInspectionRecord,
  listInspectionItems,
  listInspectionRecords,
  updateInspectionRecord,
  updateStepInstance,
} from '@/services/inspection';
import { listMeasurementEquipment } from '@/services/measurementEquipment';
import {
  acceptWorkCard,
  effectWorkCard,
  getWorkCard,
  submitWorkCard,
  suspendWorkCard,
} from '@/services/workcards';
import { useUserStore } from '@/store/useUserStore';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

interface WorkCardDetail {
  workCard?: Record<string, any>;
  operationInstance?: Record<string, any> | null;
  workstationName?: string | null;
  steps?: Record<string, any>[];
  kitRequirements?: Record<string, any>[];
  outsourcing?: Record<string, any>[];
  outEdges?: Record<string, any>[];
  inEdges?: Record<string, any>[];
  kit?: { satisfied: boolean; total: number; satisfiedCount: number; missing: number } | null;
}

type ItemRow = {
  item: Record<string, any>;
  record?: Record<string, any>;
  measuredValue?: number | null;
  result?: string;
  defectDescription?: string;
  equipmentId?: string;
  inspector?: string;
  inspectedAt?: dayjs.Dayjs | null;
  imageUrlsText?: string;
  hint?: string | null;
};

function toleranceHint(
  item: Record<string, any>,
  measured: number | null | undefined,
): string | null {
  if (item.inspectionType !== 'tolerance' || measured == null || Number.isNaN(Number(measured))) {
    return null;
  }
  const nominal = Number(item.nominalValue);
  const upper = Number(item.upperTolerance);
  const lower = Number(item.lowerTolerance);
  if ([nominal, upper, lower].some((n) => Number.isNaN(n))) return null;
  const min = nominal + lower;
  const max = nominal + upper;
  const ok = measured >= min && measured <= max;
  return ok
    ? `在公差内 [${min}, ${max}]`
    : `超出公差 [${min}, ${max}]`;
}

export default function WorkCardDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkCardDetail>({});
  const [acting, setActing] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<Record<string, any> | null>(null);
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [equipOpts, setEquipOpts] = useState<{ label: string; value: string }[]>([]);
  const [inspLoading, setInspLoading] = useState(false);
  const [inspSaving, setInspSaving] = useState(false);

  const load = () => {
    if (!id) return;
    let active = true;
    setLoading(true);
    getWorkCard(id)
      .then((res) => {
        if (!active) return;
        if (isApiSuccess(res)) setData(getApiData<WorkCardDetail>(res) ?? {});
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void listMeasurementEquipment({ pageSize: 200, status: 'ACTIVE' }).then((res) => {
      const list = parseApiListResponse(res).data || [];
      setEquipOpts(
        list.map((e: any) => ({
          value: e.id,
          label: `${e.name || ''}${e.serialNo ? ` (${e.serialNo})` : ''}`.trim() || e.id,
        })),
      );
    });
  }, []);

  const card = data.workCard ?? {};
  const status = card.status as string | undefined;

  const act = async (fn: (id: string) => Promise<any>, okMsg: string) => {
    if (!id) return;
    setActing(true);
    try {
      const res = await fn(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '操作失败'));
        return;
      }
      message.success(okMsg);
      load();
    } finally {
      setActing(false);
    }
  };

  const openInspection = async (step: Record<string, any>) => {
    if (!step.id) {
      message.error('工步实例缺少 id');
      return;
    }
    if (!step.processStepId) {
      message.warning('工步实例未关联模板工步（processStepId），无法加载检验项');
      return;
    }
    setActiveStep(step);
    setDrawerOpen(true);
    setInspLoading(true);
    try {
      const [itemsRes, recordsRes] = await Promise.all([
        listInspectionItems({ processStepId: step.processStepId, pageSize: 200 }),
        listInspectionRecords({ stepInstanceId: step.id, pageSize: 200 }),
      ]);
      const items = (
        (parseApiListResponse(itemsRes).data || []) as Record<string, any>[]
      ).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
      const records = (parseApiListResponse(recordsRes).data || []) as Record<string, any>[];
      const byItem = new Map<string, Record<string, any>>();
      for (const r of records) {
        if (r.inspectionItemId) byItem.set(r.inspectionItemId, r);
      }
      setItemRows(
        items.map((item) => {
          const record = item.id ? byItem.get(item.id) : undefined;
          const urls = Array.isArray(record?.imageUrls)
            ? record!.imageUrls.join('\n')
            : typeof record?.imageUrls === 'string'
              ? record.imageUrls
              : '';
          const measured =
            record?.measuredValue != null ? Number(record.measuredValue) : undefined;
          return {
            item,
            record,
            measuredValue: measured,
            result: record?.result || 'PENDING',
            defectDescription: record?.defectDescription || '',
            equipmentId: record?.equipmentId,
            inspector: record?.inspector || user?.name || user?.username || '',
            inspectedAt: record?.inspectedAt ? dayjs(record.inspectedAt) : dayjs(),
            imageUrlsText: urls,
            hint: toleranceHint(item, measured),
          };
        }),
      );
    } finally {
      setInspLoading(false);
    }
  };

  const patchRow = (index: number, patch: Partial<ItemRow>) => {
    setItemRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], ...patch };
      if ('measuredValue' in patch) {
        row.hint = toleranceHint(row.item, row.measuredValue ?? null);
        if (
          row.item.inspectionType === 'tolerance' &&
          row.measuredValue != null &&
          row.hint
        ) {
          if (row.hint.startsWith('在公差内') && (!row.result || row.result === 'PENDING')) {
            row.result = 'PASS';
          } else if (row.hint.startsWith('超出') && row.result !== 'FAIL') {
            row.result = 'FAIL';
          }
        }
      }
      next[index] = row;
      return next;
    });
  };

  const saveInspection = async () => {
    if (!activeStep?.id) return;
    setInspSaving(true);
    try {
      const results: string[] = [];
      for (const row of itemRows) {
        if (!row.item.id) continue;
        const urls = String(row.imageUrlsText || '')
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const body: Record<string, unknown> = {
          stepInstanceId: activeStep.id,
          inspectionItemId: row.item.id,
          measuredValue: row.measuredValue ?? null,
          result: row.result || 'PENDING',
          defectDescription: row.defectDescription || null,
          equipmentId: row.equipmentId || null,
          inspector: row.inspector || null,
          inspectedAt: row.inspectedAt ? row.inspectedAt.toISOString() : null,
          imageUrls: urls,
        };
        const res = row.record?.id
          ? await updateInspectionRecord(row.record.id, body)
          : await createInspectionRecord(body);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, `检验项「${row.item.name}」保存失败`));
          return;
        }
        results.push(String(row.result || 'PENDING'));
      }

      let stepResult = 'PENDING';
      if (results.length > 0) {
        if (results.some((r) => r === 'FAIL')) stepResult = 'FAIL';
        else if (results.every((r) => r === 'PASS')) stepResult = 'PASS';
        else stepResult = 'PENDING';
      }
      const upd = await updateStepInstance(activeStep.id, { inspectionResult: stepResult });
      if (!isApiSuccess(upd)) {
        message.warning('检验记录已保存，但更新工步实例结果失败');
      } else {
        message.success('检验记录已保存');
      }
      setDrawerOpen(false);
      load();
    } finally {
      setInspSaving(false);
    }
  };

  const statusEnum = status ? WORK_CARD_STATUS_VALUE_ENUM[status] : undefined;
  const canInspect = status === 'REPAIRING' || status === 'PENDING_REPAIR';

  return (
    <PageContainer
      pageHeaderRender={() => <></>}
      title={
        <PageContainerTitleWithBack
          title={`工卡详情 · ${card.workCardNo ?? ''}`}
          backTo="/dispatch/workcards"
        />
      }
      extra={
        <Space>
          {status === 'PENDING_EFFECTIVE' && (
            <Button type="primary" loading={acting} onClick={() => act(effectWorkCard, '已生效')}>
              生效工卡
            </Button>
          )}
          {status === 'PENDING_ACCEPT' && (
            <Button type="primary" loading={acting} onClick={() => act(acceptWorkCard, '已接受')}>
              接受工卡
            </Button>
          )}
          {status === 'REPAIRING' && (
            <>
              <Button loading={acting} danger onClick={() => act(suspendWorkCard, '已挂起')}>
                齐套挂起
              </Button>
              <Button type="primary" loading={acting} onClick={() => act(submitWorkCard, '已提交')}>
                提交工卡
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Card style={{ marginBottom: 16 }}>
          <ProDescriptions column={3} dataSource={card}>
            <ProDescriptions.Item label="工卡号" dataIndex="workCardNo" />
            <ProDescriptions.Item label="状态" dataIndex="status">
              {statusEnum ? (
                <Tag
                  color={
                    statusEnum.status === 'Success'
                      ? 'green'
                      : statusEnum.status === 'Error'
                        ? 'red'
                        : statusEnum.status === 'Warning'
                          ? 'gold'
                          : 'blue'
                  }
                >
                  {statusEnum.text}
                </Tag>
              ) : (
                status
              )}
            </ProDescriptions.Item>
            <ProDescriptions.Item label="优先级" dataIndex="priority" />
            <ProDescriptions.Item label="工序">
              {data.operationInstance?.name ||
                card.name ||
                data.operationInstance?.sourceNodeNo ||
                '-'}
            </ProDescriptions.Item>
            <ProDescriptions.Item label="工位">
              {data.workstationName || card.workstationId || '-'}
            </ProDescriptions.Item>
            <ProDescriptions.Item label="计划日期" dataIndex="plannedDate" />
            <ProDescriptions.Item label="标准工时" dataIndex="standardHours" />
            <ProDescriptions.Item label="选用工时" dataIndex="selectedHours" />
            <ProDescriptions.Item label="实际工时" dataIndex="actualHours" />
          </ProDescriptions>
        </Card>

        <Card>
          <Tabs
            defaultActiveKey="steps"
            items={[
              {
                key: 'steps',
                label: `工步 (${data.steps?.length ?? 0})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={data.steps ?? []}
                    locale={{ emptyText: <Empty description="暂无工步" /> }}
                    columns={[
                      { title: '工步号', dataIndex: 'stepNo', width: 120 },
                      {
                        title: '检验点',
                        dataIndex: 'isInspectionPoint',
                        width: 90,
                        render: (v) => (v ? <Tag color="orange">是</Tag> : '-'),
                      },
                      {
                        title: '执行状态',
                        dataIndex: 'status',
                        width: 110,
                        render: (v: string) => v ?? '-',
                      },
                      {
                        title: '检验结果',
                        dataIndex: 'inspectionResult',
                        width: 110,
                        render: (v: string) => {
                          if (!v) return '-';
                          const e = INSPECTION_RESULT_VALUE_ENUM[v];
                          return e ? (
                            <Tag
                              color={
                                e.status === 'Success'
                                  ? 'green'
                                  : e.status === 'Error'
                                    ? 'red'
                                    : 'default'
                              }
                            >
                              {e.text}
                            </Tag>
                          ) : (
                            v
                          );
                        },
                      },
                      {
                        title: '操作',
                        width: 100,
                        render: (_: any, r: Record<string, any>) =>
                          r.isInspectionPoint ? (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => void openInspection(r)}
                            >
                              {canInspect ? '检验' : '查看检验'}
                            </Button>
                          ) : (
                            '-'
                          ),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'kit',
                label: `齐套 (${data.kitRequirements?.length ?? 0})`,
                children: (
                  <>
                    {data.kit && (
                      <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
                        <Descriptions.Item label="齐套状态">
                          <Badge
                            status={data.kit.satisfied ? 'success' : 'warning'}
                            text={data.kit.satisfied ? '已齐套' : '未齐套'}
                          />
                        </Descriptions.Item>
                        <Descriptions.Item label="满足/总数">
                          {data.kit.satisfiedCount} / {data.kit.total}
                        </Descriptions.Item>
                        <Descriptions.Item label="缺项">{data.kit.missing}</Descriptions.Item>
                      </Descriptions>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={data.kitRequirements ?? []}
                      locale={{ emptyText: <Empty description="暂无齐套需求" /> }}
                      columns={[
                        {
                          title: '维度',
                          dataIndex: 'dimension',
                          width: 120,
                          render: (v: string) =>
                            KIT_DIMENSION_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '-',
                        },
                        {
                          title: '物料',
                          dataIndex: 'materialLabel',
                          ellipsis: true,
                          render: (_: unknown, r: Record<string, any>) =>
                            r.materialLabel || r.name || r.materialId || '-',
                        },
                        {
                          title: '是否满足',
                          dataIndex: 'satisfied',
                          width: 100,
                          render: (v) => (
                            <Tag color={v ? 'green' : 'red'}>{v ? '满足' : '未满足'}</Tag>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'outsourcing',
                label: `委外 (${data.outsourcing?.length ?? 0})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={data.outsourcing ?? []}
                    locale={{ emptyText: <Empty description="暂无委外" /> }}
                    columns={[
                      {
                        title: '物料',
                        dataIndex: 'materialLabel',
                        ellipsis: true,
                        render: (_: unknown, r: Record<string, any>) =>
                          r.materialLabel || r.name || r.materialId || '-',
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        width: 120,
                        render: (v: string) =>
                          OUTSOURCING_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '-',
                      },
                      {
                        title: '发出时间',
                        dataIndex: 'issuedAt',
                        width: 180,
                        render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
                      },
                      {
                        title: '返回时间',
                        dataIndex: 'returnedAt',
                        width: 180,
                        render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'dag',
                label: `工艺先后 (${(data.inEdges?.length ?? 0) + (data.outEdges?.length ?? 0)})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={[...(data.inEdges ?? []), ...(data.outEdges ?? [])]}
                    locale={{ emptyText: <Empty description="暂无先后依赖" /> }}
                    columns={[
                      {
                        title: '前置工卡',
                        dataIndex: 'fromWorkCardLabel',
                        ellipsis: true,
                        render: (_: unknown, r: Record<string, any>) =>
                          r.fromWorkCardLabel || r.fromWorkCardId || '-',
                      },
                      {
                        title: '后置工卡',
                        dataIndex: 'toWorkCardLabel',
                        ellipsis: true,
                        render: (_: unknown, r: Record<string, any>) =>
                          r.toWorkCardLabel || r.toWorkCardId || '-',
                      },
                      {
                        title: '边类型',
                        dataIndex: 'edgeType',
                        width: 140,
                        render: (v: string) =>
                          DAG_EDGE_TYPE_OPTIONS.find((o) => o.value === v)?.label ??
                          DAG_EDGE_TYPE_VALUE_ENUM[v]?.text ??
                          v,
                      },
                      {
                        title: '强制前置',
                        dataIndex: 'isMandatory',
                        width: 100,
                        render: (v) => (v ? '是' : '否'),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Spin>

      <Drawer
        title={`检验录入 · ${activeStep?.stepNo ?? ''}`}
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          canInspect ? (
            <Button type="primary" loading={inspSaving} onClick={() => void saveInspection()}>
              保存检验
            </Button>
          ) : null
        }
      >
        <Spin spinning={inspLoading}>
          {itemRows.length === 0 ? (
            <Empty description="该检验点暂无检验项定义" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {itemRows.map((row, index) => (
                <Card
                  key={row.item.id || index}
                  size="small"
                  title={
                    <Space>
                      <span>{row.item.name}</span>
                      <Tag>
                        {INSPECTION_TYPE_OPTIONS.find((o) => o.value === row.item.inspectionType)
                          ?.label ?? row.item.inspectionType}
                      </Tag>
                    </Space>
                  }
                >
                  <Form layout="vertical" disabled={!canInspect}>
                    {row.item.inspectionType === 'tolerance' && (
                      <>
                        <Descriptions size="small" column={2} style={{ marginBottom: 8 }}>
                          <Descriptions.Item label="标称值">
                            {row.item.nominalValue ?? '—'} {row.item.unit ?? ''}
                          </Descriptions.Item>
                          <Descriptions.Item label="公差">
                            [{row.item.lowerTolerance ?? '?'}, {row.item.upperTolerance ?? '?'}]
                          </Descriptions.Item>
                        </Descriptions>
                        <Form.Item label="测量值">
                          <InputNumber
                            style={{ width: '100%' }}
                            value={row.measuredValue ?? undefined}
                            onChange={(v) =>
                              patchRow(index, {
                                measuredValue: v == null ? null : Number(v),
                              })
                            }
                          />
                        </Form.Item>
                        {row.hint && (
                          <Alert
                            style={{ marginBottom: 12 }}
                            type={row.hint.startsWith('在公差内') ? 'success' : 'error'}
                            message={row.hint}
                            showIcon
                          />
                        )}
                      </>
                    )}
                    <Form.Item label="判定结果">
                      <Select
                        options={INSPECTION_RESULT_OPTIONS}
                        value={row.result}
                        onChange={(v) => patchRow(index, { result: v })}
                      />
                    </Form.Item>
                    <Form.Item label="不合格描述">
                      <Input.TextArea
                        rows={2}
                        value={row.defectDescription}
                        onChange={(e) =>
                          patchRow(index, { defectDescription: e.target.value })
                        }
                      />
                    </Form.Item>
                    <Form.Item label="测量设备">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={equipOpts}
                        value={row.equipmentId}
                        onChange={(v) => patchRow(index, { equipmentId: v })}
                      />
                    </Form.Item>
                    <Form.Item label="检验人">
                      <Input
                        value={row.inspector}
                        onChange={(e) => patchRow(index, { inspector: e.target.value })}
                      />
                    </Form.Item>
                    <Form.Item label="检验时间">
                      <DatePicker
                        showTime
                        style={{ width: '100%' }}
                        value={row.inspectedAt}
                        onChange={(v) => patchRow(index, { inspectedAt: v })}
                      />
                    </Form.Item>
                    <Form.Item label="拍照图片 URL" extra="每行一个，或逗号分隔">
                      <Input.TextArea
                        rows={2}
                        value={row.imageUrlsText}
                        onChange={(e) => patchRow(index, { imageUrlsText: e.target.value })}
                      />
                    </Form.Item>
                  </Form>
                </Card>
              ))}
            </Space>
          )}
        </Spin>
      </Drawer>
    </PageContainer>
  );
}
