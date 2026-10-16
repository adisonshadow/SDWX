/**
 * CallModal — 异常呼叫弹窗（选项卡片模式，触摸友好）
 */
import { useState } from 'react';
import { Modal, Input, App } from 'antd';
import { createCall } from '../api/opApi';
import { CALL_TYPES, CALL_TYPE_LABELS, type CallType } from '@fmms/shared';

const { TextArea } = Input;

export default function CallModal({
  open,
  onClose,
  stationCode,
}: {
  open: boolean;
  onClose: () => void;
  stationCode?: string;
}) {
  const { message } = App.useApp();
  const [callType, setCallType] = useState<CallType>('tool_fault');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createCall({ call_type: callType, description, station_code: stationCode });
      message.success('呼叫已发送');
      setDescription('');
      onClose();
    } catch (e) {
      message.error(`呼叫失败: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="异常呼叫"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="提交呼叫"
      cancelText="取消"
      confirmLoading={submitting}
      centered={true}
      mask={{ blur: true }}
      width={600}
    >
      <div style={{ marginBottom: 24, marginTop: 30 }}>
        <label style={{ display: 'block', marginBottom: 12, fontWeight: 500, fontSize: 'var(--op-font-base)' }}>
          呼叫类型
        </label>
        <div className="op-option-grid cols-3">
          {CALL_TYPES.map((t) => (
            <div
              key={t}
              className={`op-option-card ${callType === t ? 'selected' : ''}`}
              onClick={() => setCallType(t)}
            >
              {CALL_TYPE_LABELS[t]}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 12, fontWeight: 500, fontSize: 'var(--op-font-base)' }}>
          问题描述
        </label>
        <TextArea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请输入简要描述"
        />
      </div>
    </Modal>
  );
}
