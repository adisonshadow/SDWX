/**
 * AgvModal — AGV 物流弹窗（进站/出站大按钮）
 */
import { useState } from 'react';
import { Modal, App, Input } from 'antd';
import { LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { requestAgv } from '../api/opApi';

export default function AgvModal({
  open,
  onClose,
  cardId,
  fromStation,
}: {
  open: boolean;
  onClose: () => void;
  cardId?: string;
  fromStation?: string;
}) {
  const { message } = App.useApp();
  const [toStation, setToStation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async (action: 'in' | 'out') => {
    if (!fromStation) {
      message.warning('请先选择工位');
      return;
    }
    setSubmitting(true);
    try {
      await requestAgv({
        action,
        from_station: fromStation,
        to_station: toStation.trim() || undefined,
        card_id: cardId,
      });
      message.success(action === 'in' ? 'AGV 进站请求已发送' : 'AGV 出站请求已发送');
      setToStation('');
      onClose();
    } catch (e) {
      message.error(`AGV 请求失败: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="AGV 物流" open={open} onCancel={onClose} footer={null} width={440}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, color: 'var(--op-text-secondary)' }}>起始工位：{fromStation ?? '未选择'}</div>
        <Input
          size="large"
          placeholder="目标工位（可选）"
          value={toStation}
          onChange={(e) => setToStation(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', padding: '12px 0' }}>
        <button className="op-big-btn" disabled={submitting} onClick={() => handleAction('in')}>
          <LoginOutlined />
          进站
        </button>
        <button className="op-big-btn" disabled={submitting} onClick={() => handleAction('out')}>
          <LogoutOutlined />
          出站
        </button>
      </div>
    </Modal>
  );
}
