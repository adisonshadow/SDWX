/**
 * 排产效能报告
 *
 * - 工时中位数：列表 + 人工修正
 * - 排产偏差：选用工时 vs 实际工时
 * - 管道利用率
 * - 挂起损耗占比（齐套/负荷挂起工时估算）
 * - CSV 导出当前 Tab 数据
 */
import { DownloadOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer, StatisticCard } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { REPAIR_METHOD_OPTIONS } from '@/constants/enums';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { crudList, crudUpdate } from '@/services/crud';
import {
  getDeviation,
  getUtilization,
  listWorkHourMedians,
} from '@/services/monitor';
import { listWorkCards } from '@/services/workcards';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

const { Text } = Typography;

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    message.warning('无可导出数据');
    return;
  }
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 负荷比例色阶（与工作台 / 工位负荷图一致） */
function utilBarColor(util: number): string {
  if (util <= 0) return '#d9d9d9';
  if (util < 0.5) return '#52c41a';
  if (util < 0.85) return '#faad14';
  if (util <= 1) return '#fa8c16';
  return '#ff4d4f';
}

export default function AnalyticsReportPage() {
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const tab = searchParams.get('tab') || 'median';

  const medianRef = useRef<ActionType | undefined>(undefined);
  const medianSearch = useProTableSearchCollapse('analytics.median');

  const [utilItems, setUtilItems] = useState<Record<string, any>[]>([]);
  const [utilLoading, setUtilLoading] = useState(false);

  const [devOrderId, setDevOrderId] = useState<string | undefined>();
  const [devData, setDevData] = useState<{
    items: Record<string, any>[];
    avgDeviation: number;
    count: number;
  }>({ items: [], avgDeviation: 0, count: 0 });
  const [devLoading, setDevLoading] = useState(false);
  const [orderOptions, setOrderOptions] = useState<{ label: string; value: string }[]>([]);

  const [suspendLoading, setSuspendLoading] = useState(false);
  const [kitLoss, setKitLoss] = useState(0);
  const [loadLoss, setLoadLoss] = useState(0);
  const [kitCount, setKitCount] = useState(0);
  const [loadCount, setLoadCount] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  const loadUtil = useCallback(async () => {
    setUtilLoading(true);
    try {
      const res = await getUtilization();
      if (isApiSuccess(res)) {
        const data = getApiData<{ items: Record<string, any>[] }>(res);
        setUtilItems(data?.items ?? []);
      }
    } finally {
      setUtilLoading(false);
    }
  }, []);

  const loadDeviation = useCallback(async (orderId?: string) => {
    setDevLoading(true);
    try {
      const res = await getDeviation({ workshopOrderId: orderId });
      if (isApiSuccess(res)) {
        const data = getApiData<{
          items: Record<string, any>[];
          avgDeviation: number;
          count: number;
        }>(res);
        setDevData({
          items: data?.items ?? [],
          avgDeviation: data?.avgDeviation ?? 0,
          count: data?.count ?? 0,
        });
      }
    } finally {
      setDevLoading(false);
    }
  }, []);

  const loadSuspendLoss = useCallback(async () => {
    setSuspendLoading(true);
    try {
      const [kitRes, loadRes] = await Promise.all([
        listWorkCards({ status: 'KIT_SUSPENDED', pageSize: 200 }),
        listWorkCards({ status: 'LOAD_SUSPENDED', pageSize: 200 }),
      ]);
      const kitItems = parseApiListResponse<Record<string, any>>(kitRes).items;
      const loadItems = parseApiListResponse<Record<string, any>>(loadRes).items;
      const sumHours = (items: Record<string, any>[]) =>
        items.reduce(
          (s, c) => s + Number(c.selectedHours ?? c.standardHours ?? 0),
          0,
        );
      setKitCount(kitItems.length);
      setLoadCount(loadItems.length);
      setKitLoss(sumHours(kitItems));
      setLoadLoss(sumHours(loadItems));
    } finally {
      setSuspendLoading(false);
    }
  }, []);

  useEffect(() => {
    crudList('production', 'WorkshopOrder').then((res) => {
      const { items } = parseApiListResponse<{
        id?: string;
        workshopOrderNo: string;
      }>(res);
      setOrderOptions(
        items
          .filter((i) => i.id)
          .map((i) => ({ label: i.workshopOrderNo, value: i.id! })),
      );
    });
  }, []);

  useEffect(() => {
    if (tab === 'util') void loadUtil();
    if (tab === 'deviation') void loadDeviation(devOrderId);
    if (tab === 'suspend') void loadSuspendLoss();
  }, [tab, devOrderId, loadUtil, loadDeviation, loadSuspendLoss]);

  const utilChart = useMemo(
    () =>
      utilItems.map((u) => {
        const utilization = Number(u.utilization ?? 0);
        return {
          name: u.name || u.stationNo || u.workstationId || '-',
          利用率: Math.round(utilization * 100),
          已占用: Number(u.plannedHours ?? 0),
          日负荷: Number(u.dailyLoadHours ?? 0),
          utilization,
        };
      }),
    [utilItems],
  );

  const suspendPie = useMemo(
    () => [
      { name: '齐套挂起', value: Number(kitLoss.toFixed(1)), count: kitCount },
      { name: '负荷挂起', value: Number(loadLoss.toFixed(1)), count: loadCount },
    ],
    [kitLoss, loadLoss, kitCount, loadCount],
  );

  const openEdit = (record: Record<string, any>) => {
    setEditing(record);
    editForm.setFieldsValue({ medianHours: Number(record.medianHours ?? 0) });
    setEditOpen(true);
  };

  const saveMedian = async () => {
    const values = await editForm.validateFields();
    if (!editing?.id) return;
    setEditSaving(true);
    try {
      const res = await crudUpdate('schedule', 'WorkHourMedian', editing.id, {
        medianHours: values.medianHours,
        lastCalculatedAt: new Date().toISOString(),
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '修正失败'));
        return;
      }
      message.success('中位数已修正');
      setEditOpen(false);
      medianRef.current?.reload();
    } finally {
      setEditSaving(false);
    }
  };

  const exportCurrent = async () => {
    if (tab === 'median') {
      const res = await listWorkHourMedians();
      const items = parseApiListResponse(res).items;
      downloadCsv('work-hour-medians.csv', items as Record<string, unknown>[]);
      return;
    }
    if (tab === 'deviation') {
      downloadCsv(
        'deviation.csv',
        devData.items.map((i) => ({
          workCardNo: i.workCardNo,
          selectedHours: i.selectedHours,
          actualHours: i.actualHours,
          deviation: i.deviation,
        })),
      );
      return;
    }
    if (tab === 'util') {
      downloadCsv(
        'utilization.csv',
        utilItems.map((u) => ({
          stationNo: u.stationNo,
          name: u.name,
          plannedHours: u.plannedHours,
          dailyLoadHours: u.dailyLoadHours,
          utilization: u.utilization,
        })),
      );
      return;
    }
    downloadCsv('suspend-loss.csv', [
      { type: 'KIT_SUSPENDED', count: kitCount, lossHours: kitLoss },
      { type: 'LOAD_SUSPENDED', count: loadCount, lossHours: loadLoss },
    ]);
  };

  const maxAbsDev = useMemo(() => {
    if (!devData.items.length) return 0;
    return Math.max(...devData.items.map((i) => Math.abs(Number(i.deviation ?? 0))));
  }, [devData.items]);

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Tabs
        activeKey={tab}
        onChange={(key) => patchSearchParams({ tab: key === 'median' ? null : key })}
        tabBarExtraContent={
          <Button icon={<DownloadOutlined />} onClick={() => void exportCurrent()}>
            导出 CSV
          </Button>
        }
        items={[
          {
            key: 'median',
            label: '工时中位数',
            children: (
              <UrlSyncedProTable<Record<string, any>>
                actionRef={medianRef}
                rowKey="id"
                headerTitle="机型 × 修理方式 × 工序 工时中位数"
                search={medianSearch}
                syncUrl={false}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                toolBarRender={() => [
                  <Button
                    key="reload"
                    icon={<ReloadOutlined />}
                    onClick={() => medianRef.current?.reload()}
                  >
                    刷新
                  </Button>,
                ]}
                columns={[
                  { title: '机型', dataIndex: 'productModel', width: 120 },
                  {
                    title: '修理方式',
                    dataIndex: 'repairMethod',
                    width: 100,
                    render: (_, r) =>
                      REPAIR_METHOD_OPTIONS.find((o) => o.value === r.repairMethod)?.label ??
                      r.repairMethod,
                  },
                  {
                    title: '工序',
                    dataIndex: 'processOperationId',
                    ellipsis: true,
                  },
                  {
                    title: '中位数(h)',
                    dataIndex: 'medianHours',
                    width: 110,
                    render: (_, r) => <Text strong>{r.medianHours}</Text>,
                  },
                  {
                    title: '样本量',
                    dataIndex: 'sampleCount',
                    width: 90,
                    render: (_, r) => r.sampleCount ?? '-',
                  },
                  {
                    title: '最近计算',
                    dataIndex: 'lastCalculatedAt',
                    width: 170,
                    render: (_, r) =>
                      r.lastCalculatedAt ? new Date(r.lastCalculatedAt).toLocaleString() : '-',
                  },
                  {
                    ...TABLE_ACTION_COLUMN_BASE,
                    width: 1 * 24 + 12 * 2,
                    render: (_, record) => (
                      <TableActions>
                        <TableActionButton
                          title="人工修正"
                          icon={<EditOutlined />}
                          onClick={() => openEdit(record)}
                        />
                      </TableActions>
                    ),
                  },
                ]}
                request={async () => parseApiListResponse(await listWorkHourMedians())}
              />
            ),
          },
          {
            key: 'deviation',
            label: '排产偏差',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Space wrap>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="按令号筛选（可选）"
                    style={{ minWidth: 260 }}
                    options={orderOptions}
                    value={devOrderId}
                    onChange={(v) => setDevOrderId(v)}
                  />
                  <Button
                    icon={<ReloadOutlined />}
                    loading={devLoading}
                    onClick={() => void loadDeviation(devOrderId)}
                  >
                    刷新
                  </Button>
                </Space>
                <StatisticCard.Group direction="row">
                  <StatisticCard
                    loading={devLoading}
                    statistic={{ title: '样本数', value: devData.count }}
                  />
                  <StatisticCard
                    loading={devLoading}
                    statistic={{
                      title: '平均偏差(h)',
                      value: Number(devData.avgDeviation.toFixed(2)),
                    }}
                  />
                  <StatisticCard
                    loading={devLoading}
                    statistic={{
                      title: '最大绝对偏差(h)',
                      value: Number(maxAbsDev.toFixed(2)),
                    }}
                  />
                </StatisticCard.Group>
                <Card title="偏差明细（实际 − 选用）">
                  <Table
                    size="small"
                    rowKey={(r) => r.workCardId ?? r.workCardNo}
                    loading={devLoading}
                    dataSource={devData.items}
                    pagination={{ pageSize: 10 }}
                    locale={{
                      emptyText: (
                        <Empty description="暂无同时具备选用工时与实际工时的工卡" />
                      ),
                    }}
                    columns={[
                      { title: '工卡号', dataIndex: 'workCardNo', width: 160 },
                      { title: '选用工时', dataIndex: 'selectedHours', width: 100 },
                      { title: '实际工时', dataIndex: 'actualHours', width: 100 },
                      {
                        title: '偏差',
                        dataIndex: 'deviation',
                        width: 100,
                        render: (v: number) => (
                          <Tag color={v > 0 ? 'red' : v < 0 ? 'green' : 'default'}>
                            {v > 0 ? '+' : ''}
                            {Number(v).toFixed(2)}
                          </Tag>
                        ),
                      },
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'util',
            label: '管道利用率',
            children: (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card
                    title="各工位利用率"
                    extra={
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={utilLoading}
                        onClick={() => void loadUtil()}
                      >
                        刷新
                      </Button>
                    }
                  >
                    {utilChart.length === 0 && !utilLoading ? (
                      <Empty />
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={utilChart} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            interval={0}
                            angle={-35}
                            textAnchor="end"
                            tick={{ fontSize: 11 }}
                            height={56}
                          />
                          <YAxis unit="%" />
                          <Tooltip formatter={(v: number) => `${v}%`} />
                          <Bar dataKey="利用率" radius={[4, 4, 0, 0]}>
                            {utilChart.map((e, i) => (
                              <Cell key={i} fill={utilBarColor(e.utilization)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </Card>
                </Col>
                <Col span={24}>
                  <Table
                    size="small"
                    rowKey={(r) => r.workstationId ?? r.stationNo}
                    loading={utilLoading}
                    dataSource={utilItems}
                    pagination={false}
                    columns={[
                      { title: '编码', dataIndex: 'stationNo', width: 100 },
                      {
                        title: '工位',
                        dataIndex: 'name',
                        ellipsis: true,
                        render: (v: string, r) => v || r.stationNo || '-',
                      },
                      { title: '已占用(h)', dataIndex: 'plannedHours', width: 110 },
                      { title: '日负荷(h)', dataIndex: 'dailyLoadHours', width: 110 },
                      {
                        title: '利用率',
                        dataIndex: 'utilization',
                        width: 110,
                        render: (v: number) => {
                          const pct = Math.round(Number(v) * 100);
                          return (
                            <Tag color={v > 1 ? 'red' : v > 0.85 ? 'orange' : 'green'}>
                              {pct}%
                            </Tag>
                          );
                        },
                      },
                    ]}
                  />
                </Col>
              </Row>
            ),
          },
          {
            key: 'suspend',
            label: '挂起损耗',
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card
                    title="挂起产能损失（估算）"
                    loading={suspendLoading}
                    extra={
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => void loadSuspendLoss()}
                      >
                        刷新
                      </Button>
                    }
                  >
                    <StatisticCard.Group direction="row">
                      <StatisticCard
                        statistic={{
                          title: '齐套挂起',
                          value: kitLoss,
                          suffix: 'h',
                          description: `${kitCount} 张`,
                        }}
                      />
                      <StatisticCard
                        statistic={{
                          title: '负荷挂起',
                          value: loadLoss,
                          suffix: 'h',
                          description: `${loadCount} 张`,
                        }}
                      />
                    </StatisticCard.Group>
                    <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                      以挂起工卡的选用/标准工时之和近似产能损失（未计入挂起时长系数）。
                    </Text>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card title="损耗占比" loading={suspendLoading}>
                    {kitLoss + loadLoss === 0 ? (
                      <Empty description="当前无挂起损耗" />
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={suspendPie}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, value }) => `${name} ${value}h`}
                          >
                            <Cell fill="#fa8c16" />
                            <Cell fill="#ff4d4f" />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />

      <Modal
        title="人工修正工时中位数"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => void saveMedian()}
        confirmLoading={editSaving}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="机型">
            <Text>{editing?.productModel}</Text>
          </Form.Item>
          <Form.Item label="修理方式">
            <Text>
              {REPAIR_METHOD_OPTIONS.find((o) => o.value === editing?.repairMethod)?.label ??
                editing?.repairMethod}
            </Text>
          </Form.Item>
          <Form.Item
            name="medianHours"
            label="中位数工时 (h)"
            rules={[{ required: true, message: '请填写中位数' }]}
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
