/**
 * WorkCardDetail — 工卡详情 + 零部件选择（卡片网格，参考 5702demo select 页）
 *
 * 点击零件 → 副屏渲染对应检测表（BroadcastChannel 同步）
 */
import { useEffect, useState, useMemo } from 'react';
import { Spin, Empty, Button, Tag, App, Descriptions, Progress } from 'antd';
import { CheckCircleOutlined, FileTextOutlined, CarOutlined, ScanOutlined } from '@ant-design/icons';
import { useOPHeader } from '../../layout/OPHeaderContext';
import AgvModal from '../../components/AgvModal';
import {
  fetchWorkCardDetail,
  acceptWorkCard,
  submitWorkCard,
} from '../../api/opApi';
import { useOpContext } from '../../layout/OPContext';
import {
  PART_STATUS_LABELS,
  type WorkCard,
  type WorkCardPart,
  type PartStatus,
} from '@fmms/shared';

const PART_BADGE_CLASS: Record<PartStatus, string> = {
  pending: 'pending',
  checking: 'checking',
  done: 'done',
};

export default function WorkCardDetail({
  cardId,
  onBack,
}: {
  cardId: string;
  onBack: () => void;
}) {
  const { message } = App.useApp();
  const ctx = useOpContext();
  const [card, setCard] = useState<WorkCard | null>(null);
  const [parts, setParts] = useState<WorkCardPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [agvOpen, setAgvOpen] = useState(false);

  const load = () => {
    setLoading(true);
    fetchWorkCardDetail(cardId)
      .then((data) => {
        setCard(data.work_card);
        setParts(data.parts);
      })
      .catch((e) => message.error(`加载失败: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const handleAccept = async () => {
    try {
      await acceptWorkCard(cardId);
      message.success('已接受');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleSubmit = async () => {
    try {
      await submitWorkCard(cardId);
      message.success('已提交执行结果');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const selectPart = (part: WorkCardPart) => {
    ctx.setSelectedPartId(part.id ?? part.part_code);
    ctx.broadcastSelectPart(part.id ?? part.part_code);
  };

  const rightButtons = useMemo(() => {
    const buttons = [
      { key: 'craft', label: '工艺', icon: <FileTextOutlined />, onClick: () => message.info('工艺资料（待接 WBS process_resources）') },
      { key: 'agv', label: 'AGV', icon: <CarOutlined />, onClick: () => setAgvOpen(true) },
    ];
    if (card?.status === 'unaccepted') {
      buttons.push({ key: 'accept', label: '接受任务', icon: <CheckCircleOutlined />, onClick: handleAccept });
    } else if (card && card.status !== 'completed') {
      buttons.push({ key: 'submit', label: '提交结果', icon: <CheckCircleOutlined />, onClick: handleSubmit });
    }
    return buttons;
  }, [card, message]);

  useOPHeader({
    title: card?.card_name ?? card?.card_code ?? '工卡详情',
    onBack,
    rightButtons,
  });

  return (
    <>
      <div className="op-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : !card ? (
          <Empty description="工卡不存在" />
        ) : (
          <>
            <Descriptions bordered column={3} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="工卡号">{card.card_code}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag>{card.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="产品">{card.product_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="批次">{card.batch_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="序列号">{card.serial_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="操作员">{card.accept_operator_name ?? '-'}</Descriptions.Item>
            </Descriptions>

            {card.progress != null && card.progress > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Progress percent={card.progress} />
              </div>
            )}

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--op-text-primary)' }}>零部件任务看板</h3>
              <Button icon={<ScanOutlined />} onClick={() => message.info('扫码识别（待接扫码枪）')}>
                扫码定位
              </Button>
            </div>

            {parts.length === 0 ? (
              <Empty description="暂无零部件数据（需在 EADAF 创建 WorkCardPart 实体）" />
            ) : (
              <div className="op-card-grid-2">
                {parts.map((part) => (
                  <PartCard
                    key={part.id ?? part.part_code}
                    part={part}
                    selected={ctx.selectedPartId === (part.id ?? part.part_code)}
                    onClick={() => selectPart(part)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AgvModal open={agvOpen} onClose={() => setAgvOpen(false)} cardId={cardId} />
    </>
  );
}

function PartCard({ part, selected, onClick }: { part: WorkCardPart; selected: boolean; onClick: () => void }) {
  const status = part.status as PartStatus;
  const badgeText =
    status === 'done'
      ? `检测完成（${part.pass_count ?? 0}合格、${part.fail_count ?? 0}不合格）`
      : PART_STATUS_LABELS[status] ?? status;

  return (
    <div
      className="op-part-card"
      style={selected ? { borderColor: 'var(--op-accent-light)', boxShadow: '0 0 0 2px rgba(106,159,213,0.3)' } : undefined}
      onClick={onClick}
    >
      <div className="op-part-name">
        {part.part_name}×{part.quantity}
      </div>
      <span className={`op-part-badge ${PART_BADGE_CLASS[status] ?? 'pending'}`}>{badgeText}</span>
      {part.disposal_result && (
        <Tag style={{ marginTop: 8 }}>{part.disposal_result}</Tag>
      )}
    </div>
  );
}
