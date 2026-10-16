/**
 * SortingBoard — 分拣副屏
 *
 * Tab：形迹盘模式 | 列表模式
 * 形迹盘：零件数据与列表一致，仅格子占用布局 mock（约 30% 占 2 格）；
 * 点击进度只改本地状态，不上报服务端
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Segmented, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { useOpCardHeaderActions } from '../../../hooks/useOpCardHeaderActions';
import { fetchWorkCardDetail, fetchWorkCardParts } from '../../../api/opApi';
import type { WorkCardPart } from '@fmms/shared';
import { PART_STATUS_LABELS, type PartStatus } from '@fmms/shared';

type SortingMode = 'tray' | 'list';

const TRAY_CELL_COUNT = 6;
const SPAN2_PROBABILITY = 0.3;

type TrayLayoutItem = {
  partKey: string;
  /** 起始 cell，0-based，当前行内 */
  startCell: number;
  span: 1 | 2;
  row: number;
};

function partKeyOf(part: WorkCardPart, index: number) {
  return part.id ?? `${part.part_code}-${index}`;
}

function initialSortedOf(part: WorkCardPart) {
  return part.sorted_quantity ?? (part.status === 'done' ? part.quantity : 0);
}

/** 按零件清单排布格子：每行 6 cell，约 30% 概率占 2 个连续 cell（仅布局 mock） */
function buildTrayLayout(parts: WorkCardPart[]): TrayLayoutItem[] {
  const layout: TrayLayoutItem[] = [];
  let row = 0;
  let col = 0;

  parts.forEach((part, index) => {
    const remain = TRAY_CELL_COUNT - col;
    if (remain <= 0) {
      row += 1;
      col = 0;
    }
    const canSpan2 = TRAY_CELL_COUNT - col >= 2;
    const span: 1 | 2 = canSpan2 && Math.random() < SPAN2_PROBABILITY ? 2 : 1;
    layout.push({
      partKey: partKeyOf(part, index),
      startCell: col,
      span,
      row,
    });
    col += span;
    if (col >= TRAY_CELL_COUNT) {
      row += 1;
      col = 0;
    }
  });

  return layout;
}

function TrayModeView({
  parts,
  layout,
  localSorted,
  onInc,
}: {
  parts: WorkCardPart[];
  layout: TrayLayoutItem[];
  localSorted: Record<string, number>;
  onInc: (partKey: string) => void;
}) {
  const partMap = useMemo(() => {
    const map = new Map<string, WorkCardPart>();
    parts.forEach((p, i) => map.set(partKeyOf(p, i), p));
    return map;
  }, [parts]);

  const rowCount = useMemo(() => {
    if (layout.length === 0) return 1;
    return Math.max(...layout.map((l) => l.row)) + 1;
  }, [layout]);

  return (
    <div className="op-tray" style={{ aspectRatio: `${TRAY_CELL_COUNT} / ${1.35 * rowCount}` }}>
      <div
        className="op-tray-layer op-tray-bg"
        style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
        aria-hidden
      >
        {Array.from({ length: rowCount * TRAY_CELL_COUNT }, (_, i) => (
          <div key={i} className="op-tray-cell" />
        ))}
      </div>
      <div
        className="op-tray-layer op-tray-parts"
        style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
      >
        {layout.map((item) => {
          const part = partMap.get(item.partKey);
          if (!part) return null;
          const target = part.quantity ?? 0;
          const sorted = localSorted[item.partKey] ?? initialSortedOf(part);
          const done = sorted >= target && target > 0;
          return (
            <button
              key={item.partKey}
              type="button"
              className={`op-tray-part${done ? ' is-done' : ''}`}
              style={{
                gridColumn: `${item.startCell + 1} / span ${item.span}`,
                gridRow: item.row + 1,
              }}
              onClick={() => {
                if (!done) onInc(item.partKey);
              }}
              disabled={done}
            >
              <span className="op-tray-part-name">{part.part_name}</span>
              <span className="op-tray-part-progress">
                {sorted}/{target}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SortingBoard({ cardId }: { cardId: string }) {
  const [mode, setMode] = useState<SortingMode>('tray');
  const [parts, setParts] = useState<WorkCardPart[]>([]);
  const [trayLayout, setTrayLayout] = useState<TrayLayoutItem[]>([]);
  const [localSorted, setLocalSorted] = useState<Record<string, number>>({});
  const [cardTitle, setCardTitle] = useState('分拣工作台');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchWorkCardParts(cardId), fetchWorkCardDetail(cardId).catch(() => null)])
      .then(([partsRes, detail]) => {
        const items = partsRes.items;
        setParts(items);
        setTrayLayout(buildTrayLayout(items));
        const nextSorted: Record<string, number> = {};
        items.forEach((p, i) => {
          nextSorted[partKeyOf(p, i)] = initialSortedOf(p);
        });
        setLocalSorted(nextSorted);
        if (detail?.work_card) {
          setCardTitle(detail.work_card.card_name ?? detail.work_card.card_code ?? '分拣工作台');
        }
      })
      .catch(() => {
        setParts([]);
        setTrayLayout([]);
        setLocalSorted({});
      })
      .finally(() => setLoading(false));
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  const { rightButtons, agvModal } = useOpCardHeaderActions(cardId);

  // useOPHeader({ title: cardTitle, onRefresh: load, rightButtons });

  useOPHeader({
    // title: loading ? '故检工作台' : headerTitle,
    // title: '故检工作台',
    isPutTitleLeft : true,
    onRefresh: load,
    title: '分拣操作',
    rightButtons,
  });

  const handleTrayInc = useCallback((partKey: string) => {
    setLocalSorted((prev) => {
      const part = parts.find((p, i) => partKeyOf(p, i) === partKey);
      if (!part) return prev;
      const target = part.quantity ?? 0;
      const current = prev[partKey] ?? initialSortedOf(part);
      if (current >= target) return prev;
      return { ...prev, [partKey]: current + 1 };
    });
  }, [parts]);

  const columns = useMemo<ColumnsType<WorkCardPart>>(
    () => [
      {
        title: '零件编号',
        dataIndex: 'part_code',
        width: '22%',
      },
      {
        title: '零件名称',
        dataIndex: 'part_name',
        width: '28%',
      },
      {
        title: '目标数量',
        dataIndex: 'quantity',
        width: '15%',
        align: 'center',
      },
      {
        title: '已分拣',
        key: 'sorted_quantity',
        width: '12%',
        align: 'center',
        render: (_, row) => row.sorted_quantity ?? (row.status === 'done' ? row.quantity : 0),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: '15%',
        align: 'center',
        render: (status: PartStatus) => (
          <Tag color={status === 'done' ? 'success' : status === 'checking' ? 'processing' : 'default'}>
            {PART_STATUS_LABELS[status] ?? status}
          </Tag>
        ),
      },
      {
        title: '进度',
        key: 'progress',
        width: '20%',
        align: 'center',
        render: (_, row) => {
          const sorted = row.sorted_quantity ?? (row.status === 'done' ? row.quantity : 0);
          const target = row.quantity ?? 0;
          const done = sorted >= target && target > 0;
          const checking = row.status === 'checking';
          return (
            <Tag color={done ? 'success' : checking || sorted > 0 ? 'processing' : 'default'}>
              {sorted}/{target}
            </Tag>
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <div className="op-body">
        <div className="op-sorting-tabs">
          <Segmented
            block
            size="large"
            value={mode}
            options={[
              { label: '形迹盘模式', value: 'tray' },
              { label: '列表模式', value: 'list' },
            ]}
            onChange={(val) => setMode(val as SortingMode)}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : parts.length === 0 ? (
          <Empty description="暂无零件清单" style={{ marginTop: 48 }} />
        ) : mode === 'tray' ? (
          <TrayModeView
            parts={parts}
            layout={trayLayout}
            localSorted={localSorted}
            onInc={handleTrayInc}
          />
        ) : (
          <Table
            className="op-sorting-table"
            rowKey={(row) => row.id ?? row.part_code}
            columns={columns}
            dataSource={parts}
            pagination={false}
            size="middle"
          />
        )}
      </div>
      {agvModal}
    </>
  );
}
