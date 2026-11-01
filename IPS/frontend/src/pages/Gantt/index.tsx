/**
 * 令号甘特图
 *
 * 多令号选择 → GET /gantt/workshop-order/:id → 按天/周/月时间轴展示工卡条带（状态着色）。
 * 可选显示 DAG 前置标记（强制前置边）。
 */
import { LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Empty,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import { crudList } from '@/services/crud';
import { getGanttByOrder } from '@/services/gantt';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import './index.scss';

type Zoom = 'day' | 'week' | 'month';

interface OrderOption {
  label: string;
  value: string;
  workshopOrderNo?: string;
}

interface GanttBar {
  id: string;
  workCardNo: string;
  orderId: string;
  orderLabel: string;
  status?: string;
  start: Dayjs;
  end: Dayjs;
  predCount: number;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING_EFFECTIVE: '#8c8c8c',
  PENDING_ACCEPT: '#faad14',
  PENDING_REPAIR: '#1677ff',
  REPAIRING: '#1677ff',
  KIT_SUSPENDED: '#ff4d4f',
  LOAD_SUSPENDED: '#ff4d4f',
  REPAIR_DONE: '#52c41a',
  CANCELLED: '#d9d9d9',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_EFFECTIVE: '待生效',
  PENDING_ACCEPT: '待接受',
  PENDING_REPAIR: '待修理',
  REPAIRING: '修理中',
  KIT_SUSPENDED: '齐套挂起',
  LOAD_SUSPENDED: '负荷挂起',
  REPAIR_DONE: '修理结束',
  CANCELLED: '已取消',
};

function resolveBarDates(
  card: Record<string, any>,
  tasks: Record<string, any>[],
): { start: Dayjs; end: Dayjs } | null {
  const task = tasks.find((t) => t.workCardId === card.id);
  const dateStr = task?.plannedDate || card.plannedDate;
  if (!dateStr) return null;
  const half = (task?.plannedHalfDay || card.plannedHalfDay || 'AM') as string;
  const base = dayjs(dateStr);
  if (!base.isValid()) return null;
  if (half === 'PM') {
    return { start: base.hour(13).minute(0), end: base.hour(17).minute(0) };
  }
  return { start: base.hour(8).minute(0), end: base.hour(12).minute(0) };
}

function colWidth(zoom: Zoom) {
  if (zoom === 'day') return 56;
  if (zoom === 'week') return 120;
  return 160;
}

function buildColumns(rangeStart: Dayjs, rangeEnd: Dayjs, zoom: Zoom): Dayjs[] {
  const cols: Dayjs[] = [];
  let cur = rangeStart.startOf(zoom === 'day' ? 'day' : zoom === 'week' ? 'week' : 'month');
  const end = rangeEnd.endOf(zoom === 'day' ? 'day' : zoom === 'week' ? 'week' : 'month');
  while (cur.isBefore(end) || cur.isSame(end, zoom === 'month' ? 'month' : 'day')) {
    cols.push(cur);
    cur = cur.add(1, zoom === 'day' ? 'day' : zoom === 'week' ? 'week' : 'month');
    if (cols.length > 90) break;
  }
  return cols;
}

function formatCol(d: Dayjs, zoom: Zoom) {
  if (zoom === 'day') return d.format('MM-DD');
  if (zoom === 'week') return `${d.format('MM-DD')}周`;
  return d.format('YYYY-MM');
}

export default function GanttPage() {
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const zoom = (searchParams.get('zoom') as Zoom) || 'day';
  const orderIdsFromUrl = (searchParams.get('orders') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(orderIdsFromUrl);
  const [loading, setLoading] = useState(false);
  const [bars, setBars] = useState<GanttBar[]>([]);
  const [showDag, setShowDag] = useState(false);

  useEffect(() => {
    crudList('production', 'WorkshopOrder').then((res) => {
      const { items } = parseApiListResponse<{
        id?: string;
        workshopOrderNo: string;
        name?: string;
      }>(res);
      setOrderOptions(
        items
          .filter((i) => i.id)
          .map((i) => ({
            value: i.id!,
            workshopOrderNo: i.workshopOrderNo,
            label: `${i.workshopOrderNo}${i.name ? `（${i.name}）` : ''}`,
          })),
      );
    });
  }, []);

  const loadGantt = useCallback(async (ids: string[], withDag: boolean) => {
    if (!ids.length) {
      setBars([]);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await getGanttByOrder(id);
          if (!isApiSuccess(res)) {
            throw new Error(getApiErrorMessage(res, `令号 ${id} 甘特加载失败`));
          }
          return { id, data: getApiData<{ workCards: any[]; tasks: any[] }>(res) };
        }),
      );

      let edgeCountByCard: Record<string, number> = {};
      if (withDag) {
        const edgeRes = await crudList('production', 'WorkCardEdge', { pageSize: 500 });
        const edges = parseApiListResponse<{
          toWorkCardId?: string;
          isMandatory?: boolean;
        }>(edgeRes).items;
        edgeCountByCard = {};
        for (const e of edges) {
          if (!e.toWorkCardId) continue;
          if (e.isMandatory === false) continue;
          edgeCountByCard[e.toWorkCardId] = (edgeCountByCard[e.toWorkCardId] ?? 0) + 1;
        }
      }

      const next: GanttBar[] = [];
      for (const r of results) {
        const opt = orderOptions.find((o) => o.value === r.id);
        const orderLabel = opt?.workshopOrderNo || opt?.label || r.id.slice(0, 8);
        const cards = r.data?.workCards ?? [];
        const tasks = r.data?.tasks ?? [];
        for (const card of cards) {
          if (!card.id) continue;
          const dates = resolveBarDates(card, tasks);
          if (!dates) continue;
          next.push({
            id: card.id,
            workCardNo: card.workCardNo,
            orderId: r.id,
            orderLabel,
            status: card.status,
            start: dates.start,
            end: dates.end,
            predCount: edgeCountByCard[card.id] ?? 0,
          });
        }
      }
      next.sort((a, b) => a.start.valueOf() - b.start.valueOf());
      setBars(next);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载甘特失败');
      setBars([]);
    } finally {
      setLoading(false);
    }
  }, [orderOptions]);

  useEffect(() => {
    void loadGantt(selectedIds, showDag);
  }, [selectedIds, showDag, loadGantt]);

  const onSelectOrders = (ids: string[]) => {
    setSelectedIds(ids);
    patchSearchParams({
      orders: ids.length ? ids.join(',') : null,
    });
  };

  const onZoom = (z: Zoom) => {
    patchSearchParams({ zoom: z === 'day' ? null : z });
  };

  const { columns, rangeStartMs, rangeEndMs, totalWidth } = useMemo(() => {
    if (!bars.length) {
      const start = dayjs().startOf('day');
      const end = start.add(14, 'day');
      const cols = buildColumns(start, end, zoom);
      return {
        columns: cols,
        rangeStartMs: start.valueOf(),
        rangeEndMs: end.valueOf(),
        totalWidth: cols.length * colWidth(zoom),
      };
    }
    let min = bars[0].start;
    let max = bars[0].end;
    for (const b of bars) {
      if (b.start.isBefore(min)) min = b.start;
      if (b.end.isAfter(max)) max = b.end;
    }
    const padStart = min.subtract(1, zoom === 'month' ? 'month' : 'day');
    const padEnd = max.add(2, zoom === 'month' ? 'month' : 'day');
    const cols = buildColumns(padStart, padEnd, zoom);
    const rangeStart = cols[0];
    const rangeEnd = cols[cols.length - 1].endOf(
      zoom === 'day' ? 'day' : zoom === 'week' ? 'week' : 'month',
    );
    return {
      columns: cols,
      rangeStartMs: rangeStart.valueOf(),
      rangeEndMs: rangeEnd.valueOf(),
      totalWidth: cols.length * colWidth(zoom),
    };
  }, [bars, zoom]);

  const spanMs = Math.max(rangeEndMs - rangeStartMs, 1);
  const cw = colWidth(zoom);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; bars: GanttBar[] }>();
    for (const b of bars) {
      if (!map.has(b.orderId)) map.set(b.orderId, { label: b.orderLabel, bars: [] });
      map.get(b.orderId)!.bars.push(b);
    }
    return Array.from(map.entries());
  }, [bars]);

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Card
        title="令号甘特图"
        extra={
          <Space wrap>
            <Switch
              checkedChildren="DAG"
              unCheckedChildren="DAG"
              checked={showDag}
              onChange={setShowDag}
            />
            <Segmented
              value={zoom}
              onChange={(v) => onZoom(v as Zoom)}
              options={[
                { label: '天', value: 'day' },
                { label: '周', value: 'week' },
                { label: '月', value: 'month' },
              ]}
            />
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void loadGantt(selectedIds, showDag)}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择一个或多个车间令号"
            style={{ width: '100%', maxWidth: 720 }}
            options={orderOptions}
            value={selectedIds}
            onChange={onSelectOrders}
          />

          <div className="gantt-legend">
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <span key={k} className="gantt-legend__item">
                <i style={{ background: STATUS_COLOR[k] }} />
                {label}
              </span>
            ))}
          </div>

          {!selectedIds.length ? (
            <Empty description="请先选择令号" />
          ) : bars.length === 0 && !loading ? (
            <Empty description="所选令号暂无计划时段（需工卡 plannedDate 或排产任务）" />
          ) : (
            <div className="gantt-wrap">
              <div className="gantt-left">
                <div className="gantt-left__head">工卡</div>
                {grouped.map(([orderId, group]) => (
                  <div key={orderId} className="gantt-left__group">
                    <div className="gantt-left__order">
                      <Link to={`/plan/orders/${orderId}`}>{group.label}</Link>
                    </div>
                    {group.bars.map((b) => (
                      <div key={b.id} className="gantt-left__row" title={b.workCardNo}>
                        <Link to={`/dispatch/workcards/${b.id}`}>{b.workCardNo}</Link>
                        {showDag && b.predCount > 0 && (
                          <Tooltip title={`${b.predCount} 条强制前置`}>
                            <Tag color="purple" style={{ marginInlineStart: 4 }}>
                              <LinkOutlined /> {b.predCount}
                            </Tag>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="gantt-right">
                <div className="gantt-right__scroll">
                  <div className="gantt-timeline" style={{ width: totalWidth }}>
                    <div className="gantt-timeline__head">
                      {columns.map((c) => (
                        <div
                          key={c.toISOString()}
                          className="gantt-timeline__col"
                          style={{ width: cw }}
                        >
                          {formatCol(c, zoom)}
                        </div>
                      ))}
                    </div>
                    {grouped.map(([orderId, group]) => (
                      <div key={orderId} className="gantt-timeline__group">
                        <div className="gantt-timeline__order-spacer" />
                        {group.bars.map((b) => {
                          const left = ((b.start.valueOf() - rangeStartMs) / spanMs) * totalWidth;
                          const width = Math.max(
                            ((b.end.valueOf() - b.start.valueOf()) / spanMs) * totalWidth,
                            8,
                          );
                          const color = STATUS_COLOR[b.status ?? ''] ?? '#1677ff';
                          return (
                            <div key={b.id} className="gantt-timeline__row">
                              <Tooltip
                                title={`${b.workCardNo} · ${STATUS_LABEL[b.status ?? ''] ?? b.status} · ${b.start.format('MM-DD HH:mm')} ~ ${b.end.format('HH:mm')}`}
                              >
                                <Link
                                  to={`/dispatch/workcards/${b.id}`}
                                  className="gantt-bar"
                                  style={{
                                    left,
                                    width,
                                    background: color,
                                  }}
                                />
                              </Tooltip>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Space>
      </Card>
    </PageContainer>
  );
}
