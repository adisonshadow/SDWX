/**
 * RepairBoard — 修理副屏：零件清单多选 → 修理 / 委外 / 报废
 * 数据全部前端 Mock，不调后端接口。
 */
import { useEffect, useMemo, useState, type Key } from 'react';
import { Table, Button, Modal, Form, Select, Input, Tag, Space, App, Typography } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { useOpCardHeaderActions } from '../../../hooks/useOpCardHeaderActions';
import {
  DISPOSAL_RESULT_LABELS,
  type DisposalResult,
  type WorkCardPart,
} from '@fmms/shared';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

type ActionType = 'repair' | 'outsource' | 'scrap';

type MockPart = WorkCardPart & { key: string; defect_reason?: string };

const REPAIR_METHOD_OPTIONS = [
  { value: 'grinding', label: '磨削' },
  { value: 'welding', label: '焊接' },
  { value: 'replacement', label: '换件' },
  { value: 'adjustment', label: '调整' },
];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  REPAIR_METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

function buildMockParts(cardId: string): MockPart[] {
  const base: Array<Omit<MockPart, 'key' | 'work_card_id' | 'id'>> = [
    {
      part_code: 'OUTER-CYL-001',
      part_name: '外筒',
      quantity: 1,
      status: 'pending',
      suggested_disposal: '自修',
      disposal_result: undefined,
      defect_reason: '导向段磨损超差，圆度超差',
      sort_order: 1,
    },
    {
      part_code: 'PISTON-001',
      part_name: '活塞',
      quantity: 1,
      status: 'pending',
      suggested_disposal: '委外',
      disposal_result: undefined,
      defect_reason: '密封沟槽磨损，需激光熔覆',
      sort_order: 2,
    },
    {
      part_code: 'INNER-CYL-001',
      part_name: '内筒',
      quantity: 1,
      status: 'pending',
      suggested_disposal: '报废',
      disposal_result: undefined,
      defect_reason: '腐蚀坑深超限，不可修复',
      sort_order: 3,
    },
    {
      part_code: 'SEAL-RING-001',
      part_name: '密封圈组',
      quantity: 4,
      status: 'pending',
      suggested_disposal: '报废',
      disposal_result: undefined,
      defect_reason: '工艺规定必换件',
      sort_order: 4,
    },
    {
      part_code: 'BEARING-001',
      part_name: '关节轴承',
      quantity: 2,
      status: 'pending',
      suggested_disposal: '报废',
      disposal_result: undefined,
      defect_reason: '游隙超差，只换不修',
      sort_order: 5,
    },
  ];

  return base.map((p, i) => ({
    ...p,
    id: `${cardId}-part-${i + 1}`,
    work_card_id: cardId,
    key: `${cardId}-part-${i + 1}`,
  }));
}

function disposalTagColor(result?: DisposalResult | string): string {
  switch (result) {
    case 'repair':
      return 'processing';
    case 'outsource':
      return 'blue';
    case 'scrap':
      return 'error';
    case 'qualified':
      return 'success';
    default:
      return 'default';
  }
}

function disposalLabel(result?: DisposalResult | string): string {
  if (!result) return '待处置';
  return DISPOSAL_RESULT_LABELS[result as DisposalResult] ?? result;
}

export default function RepairBoard({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const { rightButtons, agvModal } = useOpCardHeaderActions(cardId);
  useOPHeader({ title: '修理处置工作台', rightButtons });

  const [parts, setParts] = useState<MockPart[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [action, setAction] = useState<ActionType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repairForm] = Form.useForm();
  const [scrapForm] = Form.useForm();

  useEffect(() => {
    setParts(buildMockParts(cardId));
    setSelectedKeys([]);
    setAction(null);
    repairForm.resetFields();
    scrapForm.resetFields();
  }, [cardId, repairForm, scrapForm]);

  const selectedParts = useMemo(
    () => parts.filter((p) => selectedKeys.includes(p.key)),
    [parts, selectedKeys],
  );

  const columns = useMemo<ColumnsType<MockPart>>(
    () => [
      { title: '零件编号', dataIndex: 'part_code', width: '16%' },
      { title: '零件名称', dataIndex: 'part_name', width: '16%' },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: '8%',
        align: 'center',
      },
      {
        title: '不合格原因',
        dataIndex: 'defect_reason',
        width: '28%',
        ellipsis: true,
        render: (v?: string) => v || '-',
      },
      {
        title: '建议处置',
        dataIndex: 'suggested_disposal',
        width: '12%',
        align: 'center',
        render: (v?: string) => (v ? <Tag>{v}</Tag> : '-'),
      },
      {
        title: '执行结果',
        dataIndex: 'disposal_result',
        width: '12%',
        align: 'center',
        render: (v?: DisposalResult) => (
          <Tag color={disposalTagColor(v)}>{disposalLabel(v)}</Tag>
        ),
      },
    ],
    [],
  );

  const rowSelection: TableProps<MockPart>['rowSelection'] = {
    selectedRowKeys: selectedKeys,
    onChange: (keys) => setSelectedKeys(keys),
    getCheckboxProps: (record) => ({
      disabled: !!record.disposal_result,
      name: record.part_code,
    }),
  };

  const openAction = (type: ActionType) => {
    if (selectedParts.length === 0) {
      message.warning('请先勾选零件');
      return;
    }
    if (type === 'repair') repairForm.resetFields();
    if (type === 'scrap') scrapForm.resetFields();
    setAction(type);
  };

  const closeAction = () => {
    setAction(null);
    repairForm.resetFields();
    scrapForm.resetFields();
  };

  const applyDisposal = (result: DisposalResult, remark?: string) => {
    const keySet = new Set(selectedKeys);
    setParts((prev) =>
      prev.map((p) =>
        keySet.has(p.key)
          ? {
              ...p,
              disposal_result: result,
              disposal_remark: remark,
              disposal_time: new Date().toISOString(),
              status: 'done',
            }
          : p,
      ),
    );
    setSelectedKeys([]);
  };

  const handleRepairOk = async () => {
    try {
      const v = await repairForm.validateFields();
      setSubmitting(true);
      const remark = [
        `方法:${METHOD_LABELS[v.method] ?? v.method}`,
        v.equipment ? `设备:${v.equipment}` : null,
        v.conclusion ? `结论:${v.conclusion}` : null,
      ]
        .filter(Boolean)
        .join('；');
      applyDisposal('repair', remark);
      message.success(`已对 ${selectedParts.length} 个零件登记修理`);
      closeAction();
    } catch (e) {
      if (!(e as { errorFields?: unknown }).errorFields) {
        message.error((e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutsourceOk = () => {
    setSubmitting(true);
    const orderNo = `OS-MOCK-${Date.now().toString(36).toUpperCase()}`;
    applyDisposal('outsource', `委托单:${orderNo}`);
    message.success(`已生成委托单 ${orderNo}，共 ${selectedParts.length} 个零件`);
    setSubmitting(false);
    closeAction();
  };

  const handleScrapOk = async () => {
    try {
      const v = await scrapForm.validateFields();
      setSubmitting(true);
      applyDisposal('scrap', v.reason || undefined);
      message.success(`已对 ${selectedParts.length} 个零件登记报废`);
      closeAction();
    } catch (e) {
      if (!(e as { errorFields?: unknown }).errorFields) {
        message.error((e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSummary = selectedParts
    .map((p) => `${p.part_name}（${p.part_code}）×${p.quantity}`)
    .join('、');

  const pendingCount = parts.filter((p) => !p.disposal_result).length;

  return (
    <>
      <div className="op-body">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--op-text-secondary)', fontSize: 'var(--op-font-base)' }}>
            已选 {selectedKeys.length} 件 ·{' '}
            {pendingCount > 0 ? (
              `待处置 ${pendingCount} 件`
            ) : (
              <span style={{ color: 'var(--op-status-qualified)', fontWeight: 600 }}>全部已处置</span>
            )}
          </span>
          <Space wrap>
            <Button type="primary" size="large" onClick={() => openAction('repair')}>
              修理
            </Button>
            <Button size="large" onClick={() => openAction('outsource')}>
              委外
            </Button>
            <Button size="large" onClick={() => openAction('scrap')}>
              报废
            </Button>
          </Space>
        </div>

        <Table<MockPart>
          rowKey="key"
          size="middle"
          columns={columns}
          dataSource={parts}
          rowSelection={rowSelection}
          pagination={false}
          scroll={{ x: true }}
        />
      </div>

      {/* 修理 */}
      <Modal
        title="修理执行"
        open={action === 'repair'}
        onCancel={closeAction}
        onOk={() => void handleRepairOk()}
        confirmLoading={submitting}
        okText="确认修理"
        destroyOnHidden
        width={560}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          已选零件：{selectedSummary}
        </Paragraph>
        <Form form={repairForm} layout="vertical">
          <Form.Item label="修理方法" name="method" rules={[{ required: true, message: '请选择修理方法' }]}>
            <Select size="large" options={REPAIR_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item label="修理设备/工装" name="equipment">
            <Input size="large" placeholder="设备编号/工装" />
          </Form.Item>
          <Form.Item label="故障/缺陷描述" name="defect_description">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item label="修理过程" name="process">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item label="修理结论" name="conclusion">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 委外：仅确认表述 */}
      <Modal
        title="委外确认"
        open={action === 'outsource'}
        onCancel={closeAction}
        onOk={handleOutsourceOk}
        confirmLoading={submitting}
        okText="确认委外"
        destroyOnHidden
        width={520}
      >
        <Paragraph>
          即将对以下零件执行委外处置。系统将生成唯一委托单编码，并按委外方拆分打印预览（委外系统物理隔离，需人工持纸质单录入）。
        </Paragraph>
        <Paragraph>
          <Text strong>已选零件：</Text>
          {selectedSummary}
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          确认后零件执行结果将标记为「委外」。
        </Paragraph>
      </Modal>

      {/* 报废 */}
      <Modal
        title="报废登记"
        open={action === 'scrap'}
        onCancel={closeAction}
        onOk={() => void handleScrapOk()}
        confirmLoading={submitting}
        okText="确认报废"
        okButtonProps={{ danger: true }}
        destroyOnHidden
        width={520}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          已选零件：{selectedSummary}
        </Paragraph>
        <Form form={scrapForm} layout="vertical">
          <Form.Item label="报废原因" name="reason">
            <TextArea rows={3} placeholder="可选填备注，如寿命到期、不可修复、只换不修等" />
          </Form.Item>
        </Form>
      </Modal>

      {agvModal}
    </>
  );
}
