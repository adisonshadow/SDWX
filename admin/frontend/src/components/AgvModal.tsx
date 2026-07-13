/**
 * AgvModal — AGV 物流弹窗（进站/出站大按钮）
 * Mock 占位，不上报 PCS。
 */
import { Modal, App } from 'antd';
import { LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { requestAgv } from '../api/opApi';

export default function AgvModal({
  open,
  onClose,
  cardId,
}: {
  open: boolean;
  onClose: () => void;
  cardId?: string;
}) {
  const { message } = App.useApp();

  const handleAction = async (action: 'in' | 'out') => {
    try {
      await requestAgv({ card_id: cardId, action });
      message.success(action === 'in' ? 'AGV 进站请求已发送' : 'AGV 出站请求已发送');
      onClose();
    } catch (e) {
      message.error(`AGV 请求失败: ${(e as Error).message}`);
    }
  };

  return (
    <Modal title="AGV" open={open} onCancel={onClose} footer={null} width={440}>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', padding: '20px 0' }}>
        <button className="op-big-btn" onClick={() => handleAction('in')}>
          <LoginOutlined />
          进站
        </button>
        <button className="op-big-btn" onClick={() => handleAction('out')}>
          <LogoutOutlined />
          出站
        </button>
      </div>
    </Modal>
  );
}
