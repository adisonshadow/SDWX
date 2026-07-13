/**
 * SortingBoard — 分拣副屏
 *
 * Tab：形迹盘模式 | 列表模式（当前仅实现列表模式）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Segmented, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { fetchWorkCardDetail, fetchWorkCardParts } from '../../../api/opApi';
import type { WorkCardPart } from '@fmms/shared';

type SortingMode = 'tray' | 'list';

export default function SortingBoard({ cardId }: { cardId: string }) {
  const [mode, setMode] = useState<SortingMode>('list');
  const [parts, setParts] = useState<WorkCardPart[]>([]);
  const [cardTitle, setCardTitle] = useState('分拣工作台');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchWorkCardParts(cardId), fetchWorkCardDetail(cardId).catch(() => null)])
      .then(([partsRes, detail]) => {
        setParts(partsRes.items);
        if (detail?.work_card) {
          setCardTitle(detail.work_card.card_name ?? detail.work_card.card_code ?? '分拣工作台');
        }
      })
      .catch(() => setParts([]))
      .finally(() => setLoading(false));
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  useOPHeader({ title: cardTitle, onRefresh: load });

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
        width: '15%',
        align: 'center',
        render: (_, row) => row.sorted_quantity ?? 0,
      },
      {
        title: '进度',
        key: 'progress',
        width: '20%',
        align: 'center',
        render: (_, row) => {
          const sorted = row.sorted_quantity ?? 0;
          const target = row.quantity ?? 0;
          const done = target > 0 && sorted >= target;
          return (
            <Tag color={done ? 'success' : sorted > 0 ? 'processing' : 'default'}>
              {sorted}/{target}
            </Tag>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="op-body">
      <div className="op-sorting-tabs">
        <Segmented
          block
          size="large"
          value={mode}
          options={[
            { label: '形迹盘模式', value: 'tray', disabled: true },
            { label: '列表模式', value: 'list' },
          ]}
          onChange={(val) => setMode(val as SortingMode)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : mode === 'tray' ? (
        <Empty description="形迹盘模式待实现" style={{ marginTop: 48 }} />
      ) : parts.length === 0 ? (
        <Empty description="暂无零件清单" style={{ marginTop: 48 }} />
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
  );
}
