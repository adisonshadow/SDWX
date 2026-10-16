/**
 * InspectionDisposal — 故检不合格零件处置分类 + 分类流转条码
 *
 * 三类：委外修理 / 厂内修理 / 报废（含报废类别与缺件申领提示）
 * 确认后在页面底部生成模拟条码，每条附打印按钮；最后追加「合格」条码。
 */
import { useEffect, useMemo, useState, type Key } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Select,
  Input,
  Tag,
  Space,
  App,
  Typography,
  Divider,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { PrinterOutlined } from '@ant-design/icons';
import Barcode from 'react-barcode';
import type { InspectionItem, InspectionResult as ResultType } from '@fmms/shared';

const { TextArea } = Input;
const { Paragraph, Text } = Typography;

export type DisposalKind = 'outsource' | 'repair' | 'scrap';

export type ScrapCategory =
  | 'mandatory_replace'
  | 'scrap_life'
  | 'scrap_inspection'
  | 'scrap_recheck';

export interface DisposalRow {
  key: string;
  item_code: string;
  item_name: string;
  part_code?: string;
  measured_value?: number;
  result: 'qualified' | 'unqualified';
  /** 系统建议：由物料属性驱动 */
  suggested: DisposalKind | null;
  suggested_label: string;
  disposal?: DisposalKind;
  scrap_category?: ScrapCategory;
  disposal_remark?: string;
}

export interface FlowBarcode {
  id: string;
  category: DisposalKind | 'qualified';
  label: string;
  value: string;
  itemCodes: string[];
}

const DISPOSAL_LABELS: Record<DisposalKind, string> = {
  outsource: '委外修理',
  repair: '厂内修理',
  scrap: '报废',
};

const SCRAP_OPTIONS: { value: ScrapCategory; label: string; desc: string }[] = [
  { value: 'mandatory_replace', label: '必换件', desc: '工艺规定必换' },
  { value: 'scrap_life', label: '报废件-1', desc: '工艺未规定，零件寿命问题' },
  { value: 'scrap_inspection', label: '报废件-2', desc: '故检检查后确认' },
  { value: 'scrap_recheck', label: '报废件-3', desc: '修理后复检确认' },
];

const SCRAP_LABELS = Object.fromEntries(SCRAP_OPTIONS.map((o) => [o.value, o.label])) as Record<
  ScrapCategory,
  string
>;

/** 按物料属性 Mock 建议处置（默认委外 / 只换不修 / 厂内修理） */
export function suggestDisposal(item: InspectionItem): DisposalKind {
  const blob = `${item.part_code ?? ''} ${item.item_code} ${item.item_name} ${item.remark ?? ''} ${item.item_type ?? ''}`.toLowerCase();
  if (/outsource|委外|default_outsource/.test(blob)) return 'outsource';
  if (/replace_only|只换|必换|scrap|报废/.test(blob)) return 'scrap';
  // 按编码尾号轮换，便于演示三类建议
  const n = (item.item_code?.charCodeAt(item.item_code.length - 1) ?? 0) % 3;
  if (n === 0) return 'outsource';
  if (n === 1) return 'scrap';
  return 'repair';
}

export function buildDisposalRows(
  items: InspectionItem[],
  results: Record<string, ResultType>,
  values: Record<string, number | undefined>,
): DisposalRow[] {
  return items
    .filter((it) => {
      const r = results[it.item_code];
      return r === 'qualified' || r === 'unqualified';
    })
    .map((it) => {
      const result = results[it.item_code] as 'qualified' | 'unqualified';
      const suggested = result === 'unqualified' ? suggestDisposal(it) : null;
      return {
        key: it.item_code,
        item_code: it.item_code,
        item_name: it.item_name,
        part_code: it.part_code,
        measured_value: values[it.item_code],
        result,
        suggested,
        suggested_label: suggested ? DISPOSAL_LABELS[suggested] : '—',
      };
    });
}

function buildBarcodes(cardId: string, rows: DisposalRow[]): FlowBarcode[] {
  const short = cardId.slice(0, 8).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  const list: FlowBarcode[] = [];

  (['outsource', 'repair', 'scrap'] as DisposalKind[]).forEach((kind, idx) => {
    const group = rows.filter((r) => r.disposal === kind);
    if (group.length === 0) return;
    const prefix = kind === 'outsource' ? 'OUT' : kind === 'repair' ? 'REP' : 'SCR';
    list.push({
      id: `${kind}-${stamp}`,
      category: kind,
      label: DISPOSAL_LABELS[kind],
      value: `FLOW-${prefix}-${short}-${String(idx + 1).padStart(2, '0')}-${stamp}`,
      itemCodes: group.map((g) => g.item_code),
    });
  });

  const qualified = rows.filter((r) => r.result === 'qualified');
  list.push({
    id: `qualified-${stamp}`,
    category: 'qualified',
    label: '合格',
    // 与不合格条码同格式、同长度，避免 CODE128 渲染宽度不一致
    value: `FLOW-QAL-${short}-00-${stamp}`,
    itemCodes: qualified.map((g) => g.item_code),
  });

  return list;
}

function kindTagColor(kind?: DisposalKind | null): string {
  switch (kind) {
    case 'outsource':
      return 'blue';
    case 'repair':
      return 'processing';
    case 'scrap':
      return 'error';
    default:
      return 'default';
  }
}

export default function InspectionDisposal({
  cardId,
  items,
  results,
  values,
}: {
  cardId: string;
  items: InspectionItem[];
  results: Record<string, ResultType>;
  values: Record<string, number | undefined>;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DisposalRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [action, setAction] = useState<DisposalKind | null>(null);
  const [barcodes, setBarcodes] = useState<FlowBarcode[]>([]);
  const [scrapForm] = Form.useForm();

  useEffect(() => {
    const next = buildDisposalRows(items, results, values);
    setRows(next);
    setSelectedKeys([]);
    setAction(null);
    // 无待分类不合格项时（含全部合格），直接生成条码区（含合格条码）
    const pending = next.filter((r) => r.result === 'unqualified' && !r.disposal).length;
    setBarcodes(pending === 0 ? buildBarcodes(cardId, next) : []);
  }, [cardId, items, results, values]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.includes(r.key)),
    [rows, selectedKeys],
  );

  const unqualifiedPending = rows.filter((r) => r.result === 'unqualified' && !r.disposal).length;

  const columns = useMemo<ColumnsType<DisposalRow>>(
    () => [
      { title: '检测项', dataIndex: 'item_name', width: '18%' },
      { title: '编码', dataIndex: 'item_code', width: '14%' },
      {
        title: '零件号',
        dataIndex: 'part_code',
        width: '12%',
        render: (v?: string) => v || '—',
      },
      {
        title: '测量值',
        dataIndex: 'measured_value',
        width: '10%',
        align: 'center',
        render: (v?: number) => (v != null ? v : '—'),
      },
      {
        title: '判定',
        dataIndex: 'result',
        width: '10%',
        align: 'center',
        render: (r: DisposalRow['result']) => (
          <Tag color={r === 'qualified' ? 'success' : 'error'}>
            {r === 'qualified' ? '合格' : '不合格'}
          </Tag>
        ),
      },
      {
        title: '系统建议',
        dataIndex: 'suggested_label',
        width: '12%',
        align: 'center',
        render: (label: string, row) =>
          row.result === 'unqualified' ? (
            <Tag color={kindTagColor(row.suggested)}>{label}</Tag>
          ) : (
            '—'
          ),
      },
      {
        title: '处置结果',
        key: 'disposal',
        width: '16%',
        align: 'center',
        render: (_, row) => {
          if (row.result === 'qualified') {
            return <Tag color="success">合格流转</Tag>;
          }
          if (!row.disposal) return <Tag>待分类</Tag>;
          const extra =
            row.disposal === 'scrap' && row.scrap_category
              ? `（${SCRAP_LABELS[row.scrap_category]}）`
              : '';
          return (
            <Tag color={kindTagColor(row.disposal)}>
              {DISPOSAL_LABELS[row.disposal]}
              {extra}
            </Tag>
          );
        },
      },
    ],
    [],
  );

  const rowSelection: TableProps<DisposalRow>['rowSelection'] = {
    selectedRowKeys: selectedKeys,
    onChange: (keys) => setSelectedKeys(keys),
    getCheckboxProps: (record) => ({
      // 合格项不参与不合格三类分类；已分类不可再选
      disabled: record.result === 'qualified' || !!record.disposal,
      name: record.item_code,
    }),
  };

  const openAction = (kind: DisposalKind) => {
    const targets = selectedRows.filter((r) => r.result === 'unqualified' && !r.disposal);
    if (targets.length === 0) {
      message.warning('请勾选待分类的不合格项');
      return;
    }
    if (kind === 'scrap') scrapForm.resetFields();
    setAction(kind);
  };

  const applyDisposal = (kind: DisposalKind, extra?: { scrap_category?: ScrapCategory; remark?: string }) => {
    const keySet = new Set(selectedKeys);
    setRows((prev) => {
      const next = prev.map((r) =>
        keySet.has(r.key) && r.result === 'unqualified' && !r.disposal
          ? {
              ...r,
              disposal: kind,
              scrap_category: extra?.scrap_category,
              disposal_remark: extra?.remark,
            }
          : r,
      );
      setBarcodes(buildBarcodes(cardId, next));
      return next;
    });
    setSelectedKeys([]);
    setAction(null);
    message.success(`已分类为「${DISPOSAL_LABELS[kind]}」`);
  };

  const handleOutsourceOk = () => applyDisposal('outsource');
  const handleRepairOk = () => applyDisposal('repair');

  const handleScrapOk = async () => {
    try {
      const v = await scrapForm.validateFields();
      applyDisposal('scrap', { scrap_category: v.scrap_category, remark: v.reason });
      if (v.scrap_category) {
        message.info('已模拟向车间 PCS 发起缺件申领');
      }
    } catch {
      /* validate */
    }
  };

  const handlePrint = (bc: FlowBarcode) => {
    message.success(`已发送打印任务（模拟）：${bc.label} / ${bc.value}`);
  };

  const selectedSummary = selectedRows
    .map((r) => `${r.item_name}（${r.item_code}）`)
    .join('、');

  return (
    <div className="op-body" style={{ paddingBottom: 48 }}>
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
          已选 {selectedKeys.length} 项 ·{' '}
          {unqualifiedPending > 0 ? (
            `待分类不合格 ${unqualifiedPending} 项`
          ) : (
            <span style={{ color: 'var(--op-status-qualified)', fontWeight: 600 }}>不合格项已全部分类</span>
          )}
        </span>
        <Space wrap>
          <Button type="primary" size="large" onClick={() => openAction('outsource')}>
            委外修理
          </Button>
          <Button size="large" onClick={() => openAction('repair')}>
            厂内修理
          </Button>
          <Button size="large" onClick={() => openAction('scrap')}>
            报废
          </Button>
        </Space>
      </div>

      <Table<DisposalRow>
        rowKey="key"
        size="middle"
        columns={columns}
        dataSource={rows}
        rowSelection={rowSelection}
        pagination={false}
        scroll={{ x: true }}
      />

      {/* 委外修理 */}
      <Modal
        title="委外修理确认"
        open={action === 'outsource'}
        onCancel={() => setAction(null)}
        onOk={handleOutsourceOk}
        okText="确认委外"
        destroyOnHidden
        width={560}
      >
        <Paragraph>
          委外修理由物料「默认委外」属性驱动，系统已给出建议。确认后将按委外路径生成分类流转条码。
        </Paragraph>
        <Paragraph>
          <Text strong>已选：</Text>
          {selectedSummary}
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          建议为「委外修理」的项会优先展示蓝标签；可手工覆盖系统建议。
        </Paragraph>
      </Modal>

      {/* 厂内修理 */}
      <Modal
        title="厂内修理确认"
        open={action === 'repair'}
        onCancel={() => setAction(null)}
        onOk={handleRepairOk}
        okText="确认厂内修理"
        destroyOnHidden
        width={560}
      >
        <Paragraph>
          将以下不合格项标记为需在本厂修理工位处置，确认后生成「厂内修理」分类流转条码。
        </Paragraph>
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>已选：</Text>
          {selectedSummary}
        </Paragraph>
      </Modal>

      {/* 报废 */}
      <Modal
        title="报废登记"
        open={action === 'scrap'}
        onCancel={() => setAction(null)}
        onOk={() => void handleScrapOk()}
        okText="确认报废"
        destroyOnHidden
        width={560}
      >
        <Paragraph>
          报废含「只换不修」等策略对应的报废件。在故检工位确认的报废件，需向车间 PCS 系统发起缺件申领。
        </Paragraph>
        <Paragraph type="secondary">已选：{selectedSummary}</Paragraph>
        <Form form={scrapForm} layout="vertical">
          <Form.Item
            label="报废类别"
            name="scrap_category"
            rules={[{ required: true, message: '请选择报废类别' }]}
          >
            <Select
              size="large"
              options={SCRAP_OPTIONS.map((o) => ({
                value: o.value,
                label: `${o.label} — ${o.desc}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="备注" name="reason">
            <TextArea rows={2} placeholder="可选填" />
          </Form.Item>
        </Form>
      </Modal>

      {barcodes.length > 0 && (
        <>
          <Divider style={{ borderColor: 'var(--op-border-subtle)', margin: '28px 0 16px' }}>
            分类流转条码
          </Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {barcodes.map((bc) => (
              <div
                key={bc.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '16px 20px',
                  background: 'var(--op-bg-elevated)',
                  borderRadius: 'var(--op-radius-md)',
                  border: '1px solid var(--op-border-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    width: '100%',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ color: 'var(--op-text-primary)', fontWeight: 600 }}>
                    <Tag color={bc.category === 'qualified' ? 'success' : kindTagColor(bc.category)}>
                      {bc.label}
                    </Tag>
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 'var(--op-font-sm)' }}>
                      {bc.itemCodes.length > 0
                        ? bc.itemCodes.join(', ')
                        : '（无明细，空合格托盘占位）'}
                    </Text>
                  </div>
                  <Button size="large" icon={<PrinterOutlined />} onClick={() => handlePrint(bc)}>
                    打印
                  </Button>
                </div>

                <div
                  style={{
                    background: '#fff',
                    padding: '10px 12px',
                    borderRadius: 8,
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      color: '#000',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      lineHeight: 1.2,
                      marginBottom: 6,
                      textAlign: 'left',
                    }}
                  >
                    {bc.value}
                  </div>
                  <Barcode
                    value={bc.value}
                    format="CODE128"
                    width={1.6}
                    height={56}
                    displayValue={false}
                    margin={0}
                    background="#ffffff"
                    lineColor="#000000"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
