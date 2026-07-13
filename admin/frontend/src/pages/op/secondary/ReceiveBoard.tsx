/**
 * ReceiveBoard — 收发副屏：线边库 + 出入库
 */
import { useEffect, useState } from 'react';
import { Tabs, Table, Tag, Form, Select, InputNumber, Input, Button, App, Empty } from 'antd';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { fetchInventory, createInventoryTransaction } from '../../../api/opApi';
import { STOCK_TYPES, STOCK_TYPE_LABELS, type LineStock, type StockType } from '@fmms/shared';

export default function ReceiveBoard({ cardId }: { cardId: string }) {
  useOPHeader({ title: '收发作业工作台' });

  return (
    <div className="op-body">
        <Tabs
          items={[
            { key: 'inventory', label: '线边库', children: <InventoryTab /> },
            { key: 'transaction', label: '出入库', children: <TransactionTab cardId={cardId} /> },
          ]}
        />
    </div>
  );
}

function InventoryTab() {
  const { message } = App.useApp();
  const [stocks, setStocks] = useState<LineStock[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchInventory()
      .then((res) => setStocks(res.items))
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [message]);

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={stocks}
      size="middle"
      pagination={false}
      locale={{ emptyText: <Empty description="暂无线边库数据" /> }}
      columns={[
        { title: '库位编码', dataIndex: 'stock_code', key: 'stock_code' },
        { title: '名称', dataIndex: 'stock_name', key: 'stock_name' },
        { title: '位置', dataIndex: 'location', key: 'location' },
        {
          title: '类型',
          dataIndex: 'stock_type',
          key: 'stock_type',
          render: (t: StockType) => <Tag>{STOCK_TYPE_LABELS[t] ?? t}</Tag>,
        },
      ]}
    />
  );
}

function TransactionTab({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSubmitting(true);
      await createInventoryTransaction({ ...v, card_id: cardId });
      message.success('出入库已记账');
      form.resetFields();
    } catch (e) {
      if (!(e as { errorFields?: unknown }).errorFields) message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 500 }}>
      <Form.Item name="transaction_type" label="操作类型" rules={[{ required: true }]}>
        <Select size="large" options={[{ value: 'inbound', label: '入库' }, { value: 'outbound', label: '出库' }]} />
      </Form.Item>
      <Form.Item name="stock_type" label="库存类型">
        <Select size="large" options={STOCK_TYPES.map((t) => ({ value: t, label: STOCK_TYPE_LABELS[t] }))} />
      </Form.Item>
      <Form.Item name="material_code" label="物料编码" rules={[{ required: true }]}>
        <Input size="large" />
      </Form.Item>
      <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
        <InputNumber size="large" min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
        <Input size="large" placeholder="件/个" />
      </Form.Item>
      <Form.Item name="related_barcode" label="载具/零件条码">
        <Input size="large" />
      </Form.Item>
      <Button type="primary" size="large" loading={submitting} onClick={handleOk}>
        确认出入库
      </Button>
    </Form>
  );
}
