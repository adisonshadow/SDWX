/**
 * WorkCardList — 工卡列表（卡片网格，参考 5702demo）
 *
 * 3列卡片网格，状态色标背景 + 状态 tag。
 * 点击卡片进入详情。
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Spin, Empty } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useOPHeader } from '../../layout/OPHeaderContext';
import { useLocalConfig } from '../../hooks/useLocalConfig';
import { fetchWorkCards, fetchWorkstation } from '../../api/opApi';
import {
  WORK_CARD_STATUS_LABELS,
  WORKSTATION_TYPE_LABELS,
  type WorkCard,
  type WorkCardStatus,
  type WorkstationType,
} from '@fmms/shared';

export default function WorkCardList({
  stationType,
  onSelectCard,
  onRegister,
}: {
  stationType: WorkstationType;
  onSelectCard: (id: string) => void;
  onRegister?: () => void;
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

  const rightButtons = useMemo(
    () => [
      { key: 'register', label: '设备注册', icon: <SettingOutlined />, onClick: () => onRegister?.() },
    ],
    [onRegister],
  );

  useOPHeader({ title: headerTitle, rightButtons, onRefresh: load });

  return (
    <div className="op-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : cards.length === 0 ? (
          <Empty description="暂无工卡" />
        ) : (
          <div className="op-card-grid-3">
            {cards.map((card) => (
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
      <div className="op-task-id">任务号：{card.card_code}</div>
      {card.product_name && <div className="op-meta-row">产品：{card.product_name}</div>}
      {card.batch_no && <div className="op-meta-row">批次：{card.batch_no}</div>}
      {card.accept_time && <div className="op-meta-row">接受时间：{card.accept_time}</div>}
      {card.complete_time && <div className="op-meta-row">完成时间：{card.complete_time}</div>}
      {card.accept_operator_name && <div className="op-meta-row">操作人：{card.accept_operator_name}</div>}
      {card.progress != null && card.progress > 0 && card.status === 'processing' && (
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
