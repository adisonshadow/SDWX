/**
 * WorkCardList — 工卡列表（卡片网格，参考 5702demo）
 *
 * 3列卡片网格，状态色标背景 + 状态 tag。
 * 点击卡片进入详情。
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Spin, Empty } from 'antd';
import { useOPHeader } from '../../layout/OPHeaderContext';
import { useLocalConfig } from '../../hooks/useLocalConfig';
import { fetchWorkCards, fetchWorkstation } from '../../api/opApi';
import {
  WORK_CARD_STATUS_LABELS,
  WORK_CARD_STATUS_PRIORITY,
  WORKSTATION_TYPE_LABELS,
  type WorkCard,
  type WorkCardStatus,
  type WorkstationType,
} from '@fmms/shared';

export default function WorkCardList({
  stationType,
  onSelectCard,
}: {
  stationType: WorkstationType;
  onSelectCard: (id: string) => void;
}) {
  const { config } = useLocalConfig();
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [stationName, setStationName] = useState('');

  useEffect(() => {
    if (config?.selected_station_name) {
      setStationName(config.selected_station_name);
      return;
    }
    const code = config?.selected_station_code;
    if (!code) {
      setStationName(WORKSTATION_TYPE_LABELS[stationType] ?? '');
      return;
    }
    fetchWorkstation(code)
      .then((ws) => setStationName(ws.station_name))
      .catch(() => setStationName(WORKSTATION_TYPE_LABELS[stationType] ?? ''));
  }, [config?.selected_station_code, config?.selected_station_name, stationType]);

  const headerTitle = useMemo(
    () => (stationName ? `工卡列表（${stationName}）` : '工卡列表'),
    [stationName],
  );

  const load = useCallback(() => {
    setLoading(true);
    fetchWorkCards({ stationType })
      .then((res) => setCards(res.items))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [stationType]);

  useEffect(() => {
    load();
  }, [load]);

  useOPHeader({ title: headerTitle, onRefresh: load });

  // 按状态优先级排序：待执行 pending → 执行中 in_progress → 已完成 completed → 已取消 cancelled
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const pa = WORK_CARD_STATUS_PRIORITY[a.status as WorkCardStatus] ?? 99;
      const pb = WORK_CARD_STATUS_PRIORITY[b.status as WorkCardStatus] ?? 99;
      return pa - pb;
    });
  }, [cards]);

  return (
    <div className="op-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : sortedCards.length === 0 ? (
          <Empty description="暂无工卡" />
        ) : (
          <div className="op-card-grid-3">
            {sortedCards.map((card) => (
              <WorkCardCard key={card.id ?? card.card_code} card={card} onClick={() => onSelectCard(card.id ?? card.card_code)} />
            ))}
          </div>
        )}
    </div>
  );
}

function WorkCardCard({ card, onClick }: { card: WorkCard; onClick: () => void }) {
  const status = card.status as WorkCardStatus;
  return (
    <div className={`op-workcard ${status}`} onClick={onClick}>
      <span className="op-status-tag">{WORK_CARD_STATUS_LABELS[status] ?? status}</span>
      <div className="op-task-id">{card.card_code}</div>
      {card.product_name && <div className="op-meta-row">产品：{card.product_name}</div>}
      {card.batch_no && <div className="op-meta-row">令号：{card.batch_no}</div>}
      {card.accept_time && <div className="op-meta-row">接受时间：{card.accept_time}</div>}
      {card.complete_time && <div className="op-meta-row">完成时间：{card.complete_time}</div>}
      {card.accept_operator_name && <div className="op-meta-row">操作人：{card.accept_operator_name}</div>}
      {card.progress != null && card.progress > 0 && card.status === 'in_progress' && (
        <div className="op-meta-row">
          进度：{card.progress}%
          <div className="op-progress-bar">
            <div className="op-progress-bar-fill" style={{ width: `${card.progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
