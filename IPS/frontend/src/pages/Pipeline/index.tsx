/**
 * 工位管道 — 栈式队列视图 + 负荷环 + 挂起列表
 *
 * 左：工位选择（URL workstationId 持久化）
 * 右：管道容量环 + 待接受/待修理/修理中队列卡片 + 挂起工卡恢复
 */
import {
  EyeOutlined,
  ReloadOutlined,
  RollbackOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ProCard } from '@ant-design/pro-components';
import {
  Badge,
  Button,
  Empty,
  Progress,
  Space,
  Splitter,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HALF_DAY_OPTIONS,
  SCHEDULE_PRIORITY_VALUE_ENUM,
  WORK_AREA_TYPE_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import {
  listWorkCards,
  recallWorkCard,
  resumeWorkCard,
} from '@/services/workcards';
import { listWorkstations } from '@/services/workstation';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import TitleWithHelp from '@/components/TitleWithHelp';
import './index.scss';

const { Text, Title } = Typography;

const QUEUE_STATUSES = new Set(['PENDING_ACCEPT', 'PENDING_REPAIR', 'REPAIRING']);
const SUSPEND_STATUSES = new Set(['KIT_SUSPENDED', 'LOAD_SUSPENDED']);

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  NON_ROUTINE: 1,
  ROUTINE: 2,
};

interface WorkstationItem {
  id?: string;
  stationNo: string;
  name?: string;
  areaType?: string;
  dailyLoadHours?: string | number | null;
  pipelineCapacityFactor?: string | number | null;
  enabled?: boolean;
}

interface WorkCardItem {
  id?: string;
  workCardNo?: string;
  workshopOrderId?: string;
  status?: string;
  priority?: string;
  plannedDate?: string | null;
  plannedHalfDay?: string | null;
  selectedHours?: string | number | null;
  standardHours?: string | number | null;
  pipelineOrder?: number | null;
  kitRequired?: boolean;
  updatedAt?: string | null;
  occupiesPipeline?: boolean;
}

function sortQueue(a: WorkCardItem, b: WorkCardItem) {
  const pa = PRIORITY_RANK[a.priority ?? 'ROUTINE'] ?? 9;
  const pb = PRIORITY_RANK[b.priority ?? 'ROUTINE'] ?? 9;
  if (pa !== pb) return pa - pb;
  const oa = a.pipelineOrder ?? 999;
  const ob = b.pipelineOrder ?? 999;
  if (oa !== ob) return oa - ob;
  return String(a.plannedDate ?? '').localeCompare(String(b.plannedDate ?? ''));
}

function hoursOf(card: WorkCardItem): number {
  const v = card.selectedHours ?? card.standardHours ?? 0;
  return Number(v) || 0;
}

function halfLabel(v?: string | null) {
  return HALF_DAY_OPTIONS.find((o) => o.value === v)?.label ?? '';
}

function statusTag(status?: string) {
  if (!status) return '-';
  const e = WORK_CARD_STATUS_VALUE_ENUM[status];
  if (!e) return <Tag>{status}</Tag>;
  const color =
    e.status === 'Success'
      ? 'green'
      : e.status === 'Error'
        ? 'red'
        : e.status === 'Warning'
          ? 'gold'
          : 'blue';
  return <Tag color={color}>{e.text}</Tag>;
}

function suspendedHours(updatedAt?: string | null): string {
  if (!updatedAt) return '-';
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)} 天`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const workstationId = searchParams.get('workstationId') || undefined;

  const [stations, setStations] = useState<WorkstationItem[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [cards, setCards] = useState<WorkCardItem[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const selected = useMemo(
    () => stations.find((s) => s.id === workstationId),
    [stations, workstationId],
  );

  const loadStations = useCallback(() => {
    setStationsLoading(true);
    listWorkstations()
      .then((res) => {
        const { items } = parseApiListResponse<WorkstationItem>(res);
        const enabled = items.filter((i) => i.enabled !== false);
        setStations(enabled);
        // 无选中时默认第一个
        if (!workstationId && enabled[0]?.id) {
          patchSearchParams({ workstationId: enabled[0].id });
        }
      })
      .finally(() => setStationsLoading(false));
  }, [workstationId, patchSearchParams]);

  const loadCards = useCallback(() => {
    if (!workstationId) {
      setCards([]);
      return;
    }
    setCardsLoading(true);
    listWorkCards({ workstationId, pageSize: 200 })
      .then((res) => {
        setCards(parseApiListResponse<WorkCardItem>(res).items);
      })
      .catch(() => setCards([]))
      .finally(() => setCardsLoading(false));
  }, [workstationId]);

  useEffect(() => {
    loadStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const queue = useMemo(
    () => cards.filter((c) => QUEUE_STATUSES.has(c.status ?? '')).sort(sortQueue),
    [cards],
  );
  const suspended = useMemo(
    () => cards.filter((c) => SUSPEND_STATUSES.has(c.status ?? '')),
    [cards],
  );

  const occupiedHours = useMemo(() => queue.reduce((s, c) => s + hoursOf(c), 0), [queue]);
  const daily = Number(selected?.dailyLoadHours ?? 0);
  const factor = Number(selected?.pipelineCapacityFactor ?? 2) || 2;
  const capacity = daily * factor;
  const utilization = capacity > 0 ? occupiedHours / capacity : 0;
  const remain = Math.max(capacity - occupiedHours, 0);
  const ringPercent = Math.min(Math.round(utilization * 100), 100);
  const ringStatus: 'success' | 'normal' | 'exception' =
    utilization > 1 ? 'exception' : utilization > 0.85 ? 'normal' : 'success';

  const stationsByArea = useMemo(() => {
    const map = new Map<string, WorkstationItem[]>();
    for (const s of stations) {
      const key = s.areaType || 'OTHER';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [stations]);

  const selectStation = (id: string) => {
    patchSearchParams({ workstationId: id });
  };

  const doRecall = (id: string) => {
    modal.confirm({
      title: '确认 Recall？',
      content: '将工卡召回并保持「待接受」，可用于调整管道队列位置。',
      onOk: async () => {
        setActing(true);
        try {
          const res = await recallWorkCard(id);
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, 'Recall 失败'));
            return;
          }
          message.success('已召回');
          loadCards();
        } finally {
          setActing(false);
        }
      },
    });
  };

  const doResume = (id: string) => {
    modal.confirm({
      title: '确认恢复挂起？',
      content: '系统将校验齐套；未满足时无法恢复。',
      onOk: async () => {
        setActing(true);
        try {
          const res = await resumeWorkCard(id);
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, '恢复失败'));
            return;
          }
          message.success('已恢复为待修理');
          loadCards();
        } finally {
          setActing(false);
        }
      },
    });
  };

  return (
    <Splitter style={{ height: 'calc(100vh - 56px)' }}>
      <Splitter.Panel defaultSize={260} min={200} max="40%" collapsible>
        <div className="pipeline-sider">
          <div className="pipeline-sider__header">
            <Title level={5} style={{ margin: 0 }}>
              工位选择
            </Title>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              loading={stationsLoading}
              onClick={loadStations}
            />
          </div>
          <div className="pipeline-sider__body">
            {stations.length === 0 && !stationsLoading ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工位" />
            ) : (
              stationsByArea.map(([area, list]) => {
                const areaLabel =
                  WORK_AREA_TYPE_OPTIONS.find((o) => o.value === area)?.label ?? area;
                return (
                  <div key={area} className="pipeline-sider__group">
                    <div className="pipeline-sider__group-title">{areaLabel}</div>
                    {list.map((s) => {
                      const active = s.id === workstationId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`pipeline-sider__item${active ? ' is-active' : ''}`}
                          onClick={() => s.id && selectStation(s.id)}
                        >
                          <span className="pipeline-sider__item-no">{s.stationNo}</span>
                          <span className="pipeline-sider__item-name">
                            {s.name || s.stationNo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Splitter.Panel>

      <Splitter.Panel>
        <div className="pipeline-main">
          {!workstationId ? (
            <Empty description="请选择左侧工位" style={{ marginTop: 80 }} />
          ) : (
            <>
              <div className="pipeline-main__toolbar">
                <Space size="middle" wrap>
                  <Title level={4} style={{ margin: 0 }}>
                    {selected?.stationNo ?? '-'}
                    <Text type="secondary" style={{ fontSize: 14, marginLeft: 8, fontWeight: 400 }}>
                      {selected?.name}
                    </Text>
                  </Title>
                  <Tag>
                    日负荷 {daily || '-'}h × 系数 {factor}
                  </Tag>
                </Space>
                <Button icon={<ReloadOutlined />} loading={cardsLoading} onClick={loadCards}>
                  刷新
                </Button>
              </div>

              <div className="pipeline-main__grid">
                {/* 容量环 */}
                <ProCard
                  title={
                    <TitleWithHelp
                      title="管道容量"
                      help="占用工时 = 队列内工卡选用/标准工时之和；容量 = 日负荷 × 管道系数（默认 2）。"
                    />
                  }
                  headerBordered
                  loading={cardsLoading && !queue.length}
                >
                  <div className="pipeline-capacity">
                    <Progress
                      type="circle"
                      percent={ringPercent}
                      status={ringStatus}
                      size={140}
                      format={(p) => (
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 600 }}>{p}%</div>
                          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>占用率</div>
                        </div>
                      )}
                    />
                    <div className="pipeline-capacity__stats">
                      <div>
                        <Text type="secondary">占用工时</Text>
                        <div className="pipeline-capacity__val">{occupiedHours.toFixed(1)} h</div>
                      </div>
                      <div>
                        <Text type="secondary">管道容量</Text>
                        <div className="pipeline-capacity__val">{capacity.toFixed(1)} h</div>
                      </div>
                      <div>
                        <Text type="secondary">剩余容量</Text>
                        <div
                          className="pipeline-capacity__val"
                          style={{ color: remain <= 0 ? token.colorError : token.colorSuccess }}
                        >
                          {remain.toFixed(1)} h
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">队列工卡</Text>
                        <div className="pipeline-capacity__val">{queue.length}</div>
                      </div>
                    </div>
                  </div>
                </ProCard>

                {/* 栈式队列 */}
                <ProCard
                  title={`管道队列（待接受 / 待修理 / 修理中 · ${queue.length}）`}
                  headerBordered
                  className="pipeline-queue-card"
                  loading={cardsLoading && !queue.length}
                  extra={
                    utilization > 1 ? (
                      <Tag color="error" icon={<ThunderboltOutlined />}>
                        超容
                      </Tag>
                    ) : null
                  }
                >
                  {queue.length === 0 ? (
                    <Empty description="管道空闲" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div className="pipeline-queue">
                      {queue.map((card, idx) => {
                        const prio = card.priority
                          ? SCHEDULE_PRIORITY_VALUE_ENUM[card.priority]
                          : undefined;
                        return (
                          <div
                            key={card.id}
                            className={`pipeline-queue__item status-${card.status ?? 'unknown'}`}
                          >
                            <div className="pipeline-queue__rank">#{idx + 1}</div>
                            <div className="pipeline-queue__body">
                              <div className="pipeline-queue__row">
                                <Link to={`/dispatch/workcards/${card.id}`} className="pipeline-queue__no">
                                  {card.workCardNo}
                                </Link>
                                {statusTag(card.status)}
                                {prio && (
                                  <Tag
                                    color={
                                      prio.status === 'Error'
                                        ? 'red'
                                        : prio.status === 'Warning'
                                          ? 'gold'
                                          : 'default'
                                    }
                                  >
                                    {prio.text}
                                  </Tag>
                                )}
                              </div>
                              <div className="pipeline-queue__meta">
                                <span>
                                  令号{' '}
                                  {card.workshopOrderId ? (
                                    <Link to={`/plan/orders/${card.workshopOrderId}`}>
                                      {card.workshopOrderId.slice(0, 8)}…
                                    </Link>
                                  ) : (
                                    '-'
                                  )}
                                </span>
                                <span>
                                  计划{' '}
                                  {card.plannedDate
                                    ? `${card.plannedDate} ${halfLabel(card.plannedHalfDay)}`
                                    : '-'}
                                </span>
                                <span>工时 {hoursOf(card) || '-'} h</span>
                              </div>
                            </div>
                            <Space size={0}>
                              <Button
                                type="link"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => navigate(`/dispatch/workcards/${card.id}`)}
                              />
                              {card.status === 'PENDING_ACCEPT' && (
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<RollbackOutlined />}
                                  loading={acting}
                                  onClick={() => card.id && doRecall(card.id)}
                                >
                                  Recall
                                </Button>
                              )}
                            </Space>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ProCard>
              </div>

              {/* 挂起列表 */}
              <ProCard
                title={
                  <Space>
                    <span>挂起工卡</span>
                    <Badge count={suspended.length} showZero color={token.colorError} />
                  </Space>
                }
                headerBordered
                style={{ marginTop: 16 }}
              >
                <Table
                  size="small"
                  rowKey="id"
                  loading={cardsLoading}
                  dataSource={suspended}
                  pagination={false}
                  locale={{
                    emptyText: <Empty description="无挂起工卡" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                  }}
                  columns={[
                    {
                      title: '工卡号',
                      dataIndex: 'workCardNo',
                      width: 160,
                      render: (v: string, r: WorkCardItem) =>
                        r.id ? <Link to={`/dispatch/workcards/${r.id}`}>{v}</Link> : v,
                    },
                    {
                      title: '挂起原因',
                      dataIndex: 'status',
                      width: 120,
                      render: (v: string) => statusTag(v),
                    },
                    {
                      title: '挂起时长',
                      dataIndex: 'updatedAt',
                      width: 120,
                      render: (v: string) => suspendedHours(v),
                    },
                    {
                      title: '齐套',
                      dataIndex: 'kitRequired',
                      width: 90,
                      render: (v: boolean) =>
                        v ? <Tag color="orange">需齐套</Tag> : <Tag>无需</Tag>,
                    },
                    {
                      ...TABLE_ACTION_COLUMN_BASE,
                      width: 2 * 24 + 12 * 2,
                      render: (_, record: WorkCardItem) => (
                        <TableActions>
                          <TableActionButton
                            title="详情"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/dispatch/workcards/${record.id}`)}
                          />
                          <TableActionButton
                            title="恢复"
                            icon={<ReloadOutlined />}
                            onClick={() => record.id && doResume(record.id)}
                          />
                        </TableActions>
                      ),
                    },
                  ]}
                />
              </ProCard>
            </>
          )}
        </div>
      </Splitter.Panel>
    </Splitter>
  );
}
