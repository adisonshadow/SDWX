/**
 * 工位负荷图
 *
 * - 日负荷柱状：已占用 vs 容量基准（未来 7/14 天）
 * - 管道占用热力：各工位利用率色块
 * - 负荷预测：按计划时段日期汇总趋势 + 超容预警
 */
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import { getWorkstationLoad } from '@/services/workstation';
import { listWorkCards } from '@/services/workcards';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import './index.scss';

const { Text, Title } = Typography;

interface SlotRow {
  slotDate?: string | null;
  hours?: string | number | null;
  workCardId?: string;
}

interface LoadRawItem {
  workstation?: {
    id?: string;
    stationNo?: string;
    name?: string | null;
    dailyLoadHours?: string | number | null;
  };
  slotCount?: number;
  slots?: SlotRow[];
  horizonDays?: number;
}

interface StationLoad {
  workstationId: string;
  stationNo: string;
  name?: string;
  plannedHours: number;
  dailyLoadHours: number;
  capacity: number;
  utilization: number;
  slots: SlotRow[];
}

function heatColor(util: number): string {
  if (util <= 0) return '#f5f5f5';
  if (util < 0.5) return '#b7eb8f';
  if (util < 0.85) return '#ffe58f';
  if (util <= 1) return '#ffbb96';
  return '#ff7875';
}

/** 柱状图负荷比例色阶（与热力档位一致，略提饱和度便于区分） */
function utilBarColor(util: number): string {
  if (util <= 0) return '#d9d9d9';
  if (util < 0.5) return '#52c41a';
  if (util < 0.85) return '#faad14';
  if (util <= 1) return '#fa8c16';
  return '#ff4d4f';
}

function stationLabel(s: { name?: string; stationNo?: string }): string {
  return s.name || s.stationNo || '-';
}

export default function LoadVizPage() {
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const days = Number(searchParams.get('days') || 7) === 14 ? 14 : 7;

  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<StationLoad[]>([]);
  const [pendingHours, setPendingHours] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadRes, floatingRes] = await Promise.all([
        getWorkstationLoad(days),
        listWorkCards({ status: 'PENDING_EFFECTIVE', pageSize: 200 }),
      ]);
      if (isApiSuccess(loadRes)) {
        const raw = getApiData<{ items?: LoadRawItem[]; days?: number }>(loadRes);
        const items = (raw?.items ?? []).map((row) => {
          const plannedHours = (row.slots ?? []).reduce(
            (s, x) => s + Number(x.hours ?? 0),
            0,
          );
          const daily = Number(row.workstation?.dailyLoadHours ?? 0);
          const horizon = row.horizonDays ?? days;
          const capacity = daily * Math.max(horizon, 1);
          return {
            workstationId: row.workstation?.id ?? '',
            stationNo: row.workstation?.stationNo ?? '-',
            name: row.workstation?.name ?? undefined,
            plannedHours,
            dailyLoadHours: daily,
            capacity,
            utilization: capacity > 0 ? plannedHours / capacity : 0,
            slots: row.slots ?? [],
          } satisfies StationLoad;
        });
        setStations(items);
      }
      const floating = parseApiListResponse<{
        standardHours?: string | number | null;
        selectedHours?: string | number | null;
      }>(floatingRes).items;
      setPendingHours(
        floating.reduce(
          (s, c) => s + Number(c.selectedHours ?? c.standardHours ?? 0),
          0,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const barData = useMemo(
    () =>
      stations.map((s) => ({
        name: stationLabel(s),
        已占用: Number(s.plannedHours.toFixed(1)),
        容量: Number(s.capacity.toFixed(1)),
        利用率: Math.round(s.utilization * 100),
        utilization: s.utilization,
      })),
    [stations],
  );

  const trendData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const s of stations) {
      for (const slot of s.slots) {
        if (!slot.slotDate) continue;
        const d = String(slot.slotDate).slice(0, 10);
        byDate.set(d, (byDate.get(d) ?? 0) + Number(slot.hours ?? 0));
      }
    }
    // 补齐 horizon 内日期（即使无数据）
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, 0);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, days)
      .map(([date, hours]) => ({
        date: date.slice(5),
        计划工时: Number(hours.toFixed(1)),
      }));
  }, [stations, days]);

  const overload = stations.filter((s) => s.utilization > 1);

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div className="load-viz__toolbar">
          <Title level={4} style={{ margin: 0 }}>
            工位负荷图
          </Title>
          <Space>
            <Segmented
              value={days}
              options={[
                { label: '未来 7 天', value: 7 },
                { label: '未来 14 天', value: 14 },
              ]}
              onChange={(v) => patchSearchParams({ days: v === 7 ? null : String(v) })}
            />
            <Tooltip title="刷新">
              <ReloadOutlined
                spin={loading}
                onClick={() => void load()}
                style={{ cursor: 'pointer', fontSize: 16 }}
              />
            </Tooltip>
          </Space>
        </div>

        {overload.length > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={`超容预警：${overload.map((s) => stationLabel(s)).join('、')} 在未来 ${days} 天窗口内计划工时超过容量`}
          />
        )}

        <Spin spinning={loading}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title={`日负荷对比（已占用 vs 容量 = 日负荷×${days}）`}>
                {barData.length === 0 ? (
                  <Empty description="暂无负荷数据" />
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        tick={{ fontSize: 11 }}
                        height={56}
                      />
                      <YAxis />
                      <RTooltip />
                      <Legend />
                      <Bar dataKey="容量" fill="#d9d9d9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="已占用" radius={[4, 4, 0, 0]}>
                        {barData.map((e, i) => (
                          <Cell key={i} fill={utilBarColor(e.utilization)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card title="管道占用热力图">
                {stations.length === 0 ? (
                  <Empty description="暂无工位" />
                ) : (
                  <div className="load-heat">
                    {stations.map((s) => (
                      <Tooltip
                        key={s.workstationId || s.stationNo}
                        title={`${stationLabel(s)}：${Math.round(s.utilization * 100)}%（${s.plannedHours.toFixed(1)}/${s.capacity.toFixed(1)} h）`}
                      >
                        <div
                          className="load-heat__cell"
                          style={{ background: heatColor(s.utilization) }}
                        >
                          <div className="load-heat__no">{stationLabel(s)}</div>
                          <div className="load-heat__pct">
                            {Math.round(s.utilization * 100)}%
                          </div>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                )}
                <div className="load-heat__legend">
                  <span>
                    <i style={{ background: '#b7eb8f' }} />
                    &lt;50%
                  </span>
                  <span>
                    <i style={{ background: '#ffe58f' }} />
                    50–85%
                  </span>
                  <span>
                    <i style={{ background: '#ffbb96' }} />
                    85–100%
                  </span>
                  <span>
                    <i style={{ background: '#ff7875' }} />
                    超容
                  </span>
                </div>
              </Card>
            </Col>

            <Col span={24}>
              <Card
                title="负荷预测趋势"
                extra={
                  <Text type="secondary">
                    待生效工卡潜在工时约 {pendingHours.toFixed(1)} h（尚未入计划时段）
                  </Text>
                }
              >
                {trendData.every((d) => d.计划工时 === 0) ? (
                  <Empty description="暂无按日计划时段，无法绘制趋势（需 WorkCardPlanSlot.slotDate）" />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RTooltip />
                      <Line
                        type="monotone"
                        dataKey="计划工时"
                        stroke="#0476e7"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>

            <Col span={24}>
              <Card title="工位明细">
                <Table
                  size="small"
                  rowKey="workstationId"
                  dataSource={stations}
                  pagination={false}
                  columns={[
                    { title: '工位', dataIndex: 'stationNo', width: 120 },
                    {
                      title: '名称',
                      dataIndex: 'name',
                      ellipsis: true,
                      render: (v) => v || '-',
                    },
                    {
                      title: '已占用(h)',
                      dataIndex: 'plannedHours',
                      width: 110,
                      render: (v: number) => v.toFixed(1),
                    },
                    {
                      title: '容量(h)',
                      dataIndex: 'capacity',
                      width: 100,
                      render: (v: number) => v.toFixed(1),
                    },
                    {
                      title: '利用率',
                      dataIndex: 'utilization',
                      width: 110,
                      render: (v: number) => {
                        const pct = Math.round(v * 100);
                        return (
                          <Tag color={v > 1 ? 'red' : v > 0.85 ? 'orange' : 'green'}>
                            {pct}%
                          </Tag>
                        );
                      },
                    },
                    {
                      title: '时段数',
                      dataIndex: 'slots',
                      width: 90,
                      render: (slots: SlotRow[]) => slots.length,
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Spin>
      </Space>
    </PageContainer>
  );
}
