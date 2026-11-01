/**
 * CallModal — 异常呼叫弹窗（选项卡片模式，触摸友好）
 */
import { useEffect, useState } from 'react';
import { Modal, Input, App } from 'antd';
import { createCall } from '../api/opApi';
import { get } from '../api/request';
import { CALL_TYPES, CALL_TYPE_LABELS } from '@fmms/shared';

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
  const [callType, setCallType] = useState<string>('tool_fault');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>(
    CALL_TYPES.map((code) => ({ code, name: CALL_TYPE_LABELS[code] })),
  );

  useEffect(() => {
    if (!open) return;
    get<{ items: Array<{ code: string; name: string }> }>('/api/op/call-types')
      .then((data) => {
        const items = (data.items ?? []).filter((item) => item.code && item.name);
        if (items.length) {
          setTypes(items);
          setCallType((current) => (items.some((item) => item.code === current) ? current : items[0].code));
        }
      })
      .catch(() => undefined);
  }, [open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createCall({ call_type: callType, description, station_code: stationCode });
      message.success('呼叫已发送');
      setDescription('');
      window.dispatchEvent(new Event('fmms-call-sent'));
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
          {types.map((item) => (
            <div
              key={item.code}
              className={`op-option-card ${callType === item.code ? 'selected' : ''}`}
              onClick={() => setCallType(item.code)}
            >
              {item.name || item.code}
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
