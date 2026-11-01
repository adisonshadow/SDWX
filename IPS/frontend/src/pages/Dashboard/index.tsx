/**
 * 工作台 — 排产总览
 *
 * - 关键指标卡：待生效/待接受/修理中/挂起(齐套+负荷)/超期预警
 * - 管道负荷速览：各工位占用率（recharts 柱状），按负荷比例分色
 * - 风险预警列表：monitor/alerts
 * - 快捷入口：令号投产 / 非例行插单 / 工卡看板
 */
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components';
import { Button, Card, Col, Empty, Row, Spin, Table, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { listWorkCards } from '@/services/workcards';
import { getWorkstationLoad } from '@/services/workstation';
import { listAlerts } from '@/services/monitor';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { ALERT_TYPE_LABELS } from './alerts';

interface LoadItem {
  workstationId?: string;
  stationNo?: string;
  name?: string;
  plannedHours: number;
  dailyLoadHours: number;
  utilization: number;
}

interface AlertRecord {
  id?: string;
  alertType?: string;
  content?: string;
  triggerAt?: string;
  resolved?: boolean;
}

/** 后端 /load/workstations 原始结构 → 利用率 */
interface LoadRawItem {
  workstation?: {
    id?: string;
    stationNo?: string;
    name?: string | null;
    dailyLoadHours?: string | number | null;
  };
  slots?: Array<{ hours?: string | number | null }>;
  horizonDays?: number;
}

/** 负荷比例色阶（与工位负荷图热力一致） */
function utilBarColor(util: number): string {
  if (util <= 0) return '#d9d9d9';
  if (util < 0.5) return '#52c41a';
  if (util < 0.85) return '#faad14';
  if (util <= 1) return '#fa8c16';
  return '#ff4d4f';
}

function normalizeLoadItems(raw: unknown, days: number): LoadItem[] {
  const data = raw as { items?: LoadRawItem[] } | null;
  const items = data?.items ?? [];
  return items.map((row) => {
    const plannedHours = (row.slots ?? []).reduce((sum, s) => sum + Number(s.hours ?? 0), 0);
    const daily = Number(row.workstation?.dailyLoadHours ?? 0);
    const horizon = row.horizonDays ?? days;
    const capacity = daily * Math.max(horizon, 1);
    return {
      workstationId: row.workstation?.id,
      stationNo: row.workstation?.stationNo,
      name: row.workstation?.name ?? undefined,
      plannedHours,
      dailyLoadHours: daily,
      utilization: capacity > 0 ? plannedHours / capacity : 0,
    };
  });
}

const STATUS_COUNTS = [
  { status: 'PENDING_EFFECTIVE', label: '待生效', icon: <ClockCircleOutlined />, color: '#8c8c8c' },
  { status: 'PENDING_ACCEPT', label: '待接受', icon: <ThunderboltOutlined />, color: '#faad14' },
  { status: 'REPAIRING', label: '修理中', icon: <PlayCircleOutlined />, color: '#1677ff' },
  { status: 'KIT_SUSPENDED', label: '齐套挂起', icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
  { status: 'LOAD_SUSPENDED', label: '负荷挂起', icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
] as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [overdueCount, setOverdueCount] = useState(0);
  const [countsLoading, setCountsLoading] = useState(true);
  const [load, setLoad] = useState<LoadItem[]>([]);
  const [loadLoading, setLoadLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setCountsLoading(true);
    Promise.all([
      ...STATUS_COUNTS.map((s) =>
        listWorkCards({ status: s.status, pageSize: 1 })
          .then((res) => ({ key: s.status, total: parseApiListResponse(res).total }))
          .catch(() => ({ key: s.status, total: 0 })),
      ),
      listAlerts({ alertType: 'DELAY_RISK', resolved: false })
        .then((res) => ({ key: 'OVERDUE', total: parseApiListResponse(res).total }))
        .catch(() => ({ key: 'OVERDUE', total: 0 })),
    ]).then((results) => {
      if (!active) return;
      const map: Record<string, number> = {};
      results.forEach((r) => {
        if (r.key === 'OVERDUE') setOverdueCount(r.total);
        else map[r.key] = r.total;
      });
      setCounts(map);
      setCountsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const days = 7;
    getWorkstationLoad(days)
      .then((res) => {
        if (!active) return;
        if (isApiSuccess(res)) {
          setLoad(normalizeLoadItems(getApiData(res), days));
        }
      })
      .finally(() => active && setLoadLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAlertsLoading(true);
    listAlerts()
      .then((res) => {
        if (!active) return;
        setAlerts(parseApiListResponse<AlertRecord>(res).items);
      })
      .finally(() => active && setAlertsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const loadChart = useMemo(
    () =>
      load.map((l) => ({
        name: l.name || l.stationNo || l.workstationId || '-',
        利用率: Math.round(l.utilization * 100),
        utilization: l.utilization,
      })),
    [load],
  );

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Spin spinning={countsLoading}>
        <Row gutter={[16, 16]}>
          {STATUS_COUNTS.map((s) => (
            <Col xs={12} sm={8} md={6} lg={4} key={s.status}>
              <StatisticCard
                statistic={{
                  title: s.label,
                  value: counts[s.status] ?? 0,
                  icon: (
                    <span style={{ fontSize: 28, color: s.color, opacity: 0.85 }}>{s.icon}</span>
                  ),
                }}
              />
            </Col>
          ))}
          <Col xs={12} sm={8} md={6} lg={4}>
            <StatisticCard
              statistic={{
                title: '超期预警',
                value: overdueCount,
                icon: (
                  <span style={{ fontSize: 28, color: '#fa541c', opacity: 0.85 }}>
                    <WarningOutlined />
                  </span>
                ),
              }}
            />
          </Col>
        </Row>
      </Spin>

      <ProCard title="快捷入口" headerBordered style={{ marginTop: 16 }} gutter={[16, 16]}>
        <Button
          type="primary"
          className="btn-gradient-primary"
          onClick={() => navigate('/plan/orders/launch')}
        >
          令号投产
        </Button>
        <Button onClick={() => navigate('/dispatch/non-routine')} style={{ marginLeft: 12 }}>
          非例行插单
        </Button>
        <Button onClick={() => navigate('/dispatch/workcards')} style={{ marginLeft: 12 }}>
          工卡作业看板
        </Button>
      </ProCard>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="工位管道负荷速览（未来 7 天利用率%）" loading={loadLoading}>
            {loadChart.length === 0 && !loadLoading ? (
              <Empty description="暂无负荷数据" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={loadChart} margin={{ top: 8, right: 16, bottom: 48, left: 0 }}>
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
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <ReferenceLine
                    y={100}
                    stroke="#ff4d4f"
                    strokeDasharray="4 4"
                    label={{ value: '满容', position: 'right', fill: '#ff4d4f', fontSize: 12 }}
                  />
                  <Bar dataKey="利用率" radius={[4, 4, 0, 0]}>
                    {loadChart.map((entry, idx) => (
                      <Cell key={idx} fill={utilBarColor(entry.utilization)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="风险预警" loading={alertsLoading}>
            <Table
              size="small"
              rowKey={(r) => r.id ?? `${r.alertType}-${r.triggerAt}`}
              dataSource={alerts}
              pagination={{ pageSize: 5, simple: true }}
              locale={{
                emptyText: (
                  <Empty description="暂无预警" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ),
              }}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'alertType',
                  width: 90,
                  render: (v: string) => (
                    <Tag color="orange">{ALERT_TYPE_LABELS[v] ?? v}</Tag>
                  ),
                },
                { title: '内容', dataIndex: 'content', ellipsis: true },
                {
                  title: '时间',
                  dataIndex: 'triggerAt',
                  width: 150,
                  render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}
