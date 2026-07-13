/**
 * RepairBoard — 修理副屏：修理执行 / 委外操作 / 报废登记
 */
import { useState } from 'react';
import { Tabs, Form, Select, Input, Button, Tag, App, Empty } from 'antd';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { createOutsource, createScrap } from '../../../api/opApi';

const { TextArea } = Input;

export default function RepairBoard({ cardId }: { cardId: string }) {
  useOPHeader({ title: '修理处置工作台' });

  return (
    <div className="op-body">
        <Tabs
          items={[
            { key: 'repair', label: '修理执行', children: <RepairTab /> },
            { key: 'outsource', label: '委外操作', children: <OutsourceTab cardId={cardId} /> },
            { key: 'scrap', label: '报废登记', children: <ScrapTab cardId={cardId} /> },
          ]}
        />
    </div>
  );
}

function RepairTab() {
  const { message } = App.useApp();
  return (
    <Form layout="vertical" style={{ maxWidth: 600 }}>
      <Form.Item label="修理方法" name="method">
        <Select
          size="large"
          options={[
            { value: 'grinding', label: '磨削' },
            { value: 'welding', label: '焊接' },
            { value: 'replacement', label: '换件' },
            { value: 'adjustment', label: '调整' },
          ]}
        />
      </Form.Item>
      <Form.Item label="修理设备/工装" name="equipment">
        <Input size="large" placeholder="设备编号/工装" />
      </Form.Item>
      <Form.Item label="修理过程" name="process">
        <TextArea rows={3} />
      </Form.Item>
      <Form.Item label="修理结论" name="conclusion">
        <TextArea rows={2} />
      </Form.Item>
      <Button type="primary" size="large" onClick={() => message.info('修理记录保存（待 EADAF 创建相关实体）')}>
        保存修理记录
      </Button>
    </Form>
  );
}

function OutsourceTab({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const [party, setParty] = useState('');
  const [orderNo, setOrderNo] = useState('');

  const handleCreate = async () => {
    if (!party.trim()) {
      message.warning('请填写委外方');
      return;
    }
    try {
      const order = await createOutsource({ source_card_id: cardId, outsource_party: party });
      setOrderNo(order.order_no);
      message.success(`委外单已创建: ${order.order_no}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Form layout="vertical" style={{ maxWidth: 600 }}>
      <Form.Item label="委外方" required>
        <Input size="large" value={party} onChange={(e) => setParty(e.target.value)} placeholder="委外方名称" />
      </Form.Item>
      <Button type="primary" size="large" onClick={handleCreate}>
        生成委托单
      </Button>
      {orderNo && (
        <div style={{ marginTop: 20 }}>
          <Tag color="blue" style={{ fontSize: 'var(--op-font-base)', padding: '4px 12px' }}>
            委托单编码: {orderNo}
          </Tag>
          <Button size="large" style={{ marginLeft: 12 }} onClick={() => message.info('打印预览（待实现）')}>
            打印预览
          </Button>
        </div>
      )}
    </Form>
  );
}

function ScrapTab({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const [partCode, setPartCode] = useState('');
  const [partName, setPartName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');

  const handleScrap = async () => {
    if (!partCode.trim()) {
      message.warning('请填写零件编号');
      return;
    }
    try {
      await createScrap({
        card_id: cardId,
        items: [{ part_code: partCode, part_name: partName || undefined, quantity, scrap_type: 'inspection_confirmed', reason }],
      });
      message.success('已登记报废');
      setPartCode('');
      setPartName('');
      setReason('');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Form layout="vertical" style={{ maxWidth: 600 }}>
      <Empty description="逐件登记报废" style={{ marginBottom: 20 }} />
      <Form.Item label="零件编号" required>
        <Input size="large" value={partCode} onChange={(e) => setPartCode(e.target.value)} />
      </Form.Item>
      <Form.Item label="零件名称">
        <Input size="large" value={partName} onChange={(e) => setPartName(e.target.value)} />
      </Form.Item>
      <Form.Item label="数量" required>
        <Input size="large" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </Form.Item>
      <Form.Item label="报废原因">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Form.Item>
      <Button danger size="large" onClick={handleScrap}>
        登记报废
      </Button>
    </Form>
  );
}
