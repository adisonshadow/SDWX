/**
 * ReceiveBoard — 收发副屏
 * 零件来自工卡，线边库来自库存接口，出入库写入流水。
 */
import { useEffect, useMemo, useState, type Key, type ReactNode } from 'react';
import {
  Tabs,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Select,
  InputNumber,
  Space,
  App,
  Typography,
  Steps,
  Card,
  Empty,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { useOpCardHeaderActions } from '../../../hooks/useOpCardHeaderActions';
import { createInventoryTransaction, fetchInventory, fetchWorkCardParts } from '../../../api/opApi';
import { STOCK_TYPE_LABELS, type DisposalResult, type StockType, type WorkCardPart } from '@fmms/shared';

const { Paragraph, Text } = Typography;

type BizType = 'warehouse' | 'outsource' | 'staging' | 'scrap' | 'large';
type ExecStatus = 'pending' | 'done';
type OutsourcePhase = 'pending_ship' | 'shipped' | 'returned';

interface RcvPart {
  key: string;
  part_code: string;
  part_name: string;
  barcode: string;
  quantity: number;
  bizType: BizType;
  status: ExecStatus;
  remark?: string;
}

interface StockItem {
  key: string;
  part_code: string;
  part_name: string;
  quantity: number;
  stock_type: StockType;
  barcode?: string;
}

interface TxRow {
  id: string;
  time: string;
  action: string;
  part_code: string;
  quantity: number;
  target: string;
}

interface OsItem {
  key: string;
  part_code: string;
  part_name: string;
  quantity: number;
  phase: OutsourcePhase;
  remark?: string;
}

const BIZ_LABELS: Record<BizType, string> = {
  warehouse: '合格入立库',
  outsource: '待委外',
  staging: '零件暂存',
  scrap: '报废',
  large: '大件换载具',
};

const BIZ_COLORS: Record<BizType, string> = {
  warehouse: 'success',
  outsource: 'blue',
  staging: 'processing',
  scrap: 'error',
  large: 'warning',
};

function bizOf(part: WorkCardPart): BizType {
  const disposal = part.disposal_result as DisposalResult | undefined;
  if (disposal === 'scrap') return 'scrap';
  if (disposal === 'outsource') return 'outsource';
  if (disposal === 'qualified') return 'warehouse';
  if (part.category === 'large') return 'large';
  return 'staging';
}

function partsFromCard(cardId: string, items: WorkCardPart[]): RcvPart[] {
  return items.map((part, index) => ({
    key: part.id ?? `${cardId}-${index}`,
    part_code: part.part_code,
    part_name: part.part_name,
    barcode: part.barcode ?? part.scan_barcode ?? part.part_code,
    quantity: part.quantity,
    bizType: bizOf(part),
    status: part.status === 'done' ? 'done' : 'pending',
    remark: part.disposal_remark,
  }));
}

export default function ReceiveBoard({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const { rightButtons, agvModal } = useOpCardHeaderActions(cardId);
  useOPHeader({ title: '收发作业工作台', isPutTitleLeft: true, rightButtons });

  const [parts, setParts] = useState<RcvPart[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [osItems, setOsItems] = useState<OsItem[]>([]);
  const [largeStep, setLargeStep] = useState(0);
  const [smallWarehouseDone, setSmallWarehouseDone] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchWorkCardParts(cardId),
      fetchInventory().catch((invErr: Error) => {
        message.error(`线边库加载失败：${invErr.message}`);
        return null;
      }),
    ])
      .then(([partsRes, inventory]) => {
        if (!alive) return;
        const nextParts = partsFromCard(cardId, partsRes.items);
        setParts(nextParts);
        setStocks(
          (inventory?.stock_items ?? []).map((item) => ({
            key: item.id ?? `${item.stock_id}-${item.part_code}`,
            part_code: item.part_code,
            part_name: item.part_name ?? item.part_code,
            quantity: item.quantity,
            stock_type: item.stock_type ?? 'staging',
            barcode: item.part_code,
          })),
        );
        setTxs([]);
        setOsItems(
          nextParts
            .filter((p) => p.bizType === 'outsource')
            .map((p) => ({
              key: `os-${p.key}`,
              part_code: p.part_code,
              part_name: p.part_name,
              quantity: p.quantity,
              phase: 'pending_ship' as OutsourcePhase,
            })),
        );
        setLargeStep(0);
        setSmallWarehouseDone(false);
      })
      .catch((e: Error) => {
        if (alive) message.error(e.message);
      });
    return () => {
      alive = false;
    };
  }, [cardId, message]);

  const pushTx = async (action: string, part_code: string, quantity: number, target: string, stockType?: StockType) => {
    const outbound = /出库|发运|交接/.test(action);
    await createInventoryTransaction({
      transaction_type: outbound ? 'stock_out' : 'stock_in',
      stock_type: stockType,
      part_code,
      part_name: undefined,
      quantity,
      card_id: cardId,
      material_code: part_code,
    });
    setTxs((prev) => [
      {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toLocaleString(),
        action,
        part_code,
        quantity,
        target,
      },
      ...prev,
    ]);
  };

  const addToStock = (stock_type: StockType, rows: RcvPart[]) => {
    setStocks((prev) => {
      const next = [...prev];
      for (const r of rows) {
        const hit = next.find((s) => s.stock_type === stock_type && s.part_code === r.part_code);
        if (hit) hit.quantity += r.quantity;
        else {
          next.push({
            key: `st-${stock_type}-${r.part_code}-${Date.now()}`,
            part_code: r.part_code,
            part_name: r.part_name,
            quantity: r.quantity,
            stock_type,
            barcode: r.barcode,
          });
        }
      }
      return [...next];
    });
  };

  return (
    <>
      <div className="op-body">
        <Tabs
          size="large"
          items={[
            {
              key: 'job',
              label: '工卡作业',
              children: (
                <JobTab
                  parts={parts}
                  setParts={setParts}
                  addToStock={addToStock}
                  pushTx={pushTx}
                  onWarehouse={async (rows) => {
                    await pushTx('登记入立库', rows.map((r) => r.part_code).join(','), rows.reduce((n, r) => n + r.quantity, 0), '立库缓存(未齐套)');
                    setSmallWarehouseDone(true);
                    message.success('已登记入立库缓存（未齐套），可发起 AGV/人工转运');
                  }}
                />
              ),
            },
            {
              key: 'stock',
              label: '线边库',
              children: (
                <StockTab
                  stocks={stocks}
                  setStocks={setStocks}
                  txs={txs}
                  pushTx={pushTx}
                />
              ),
            },
            {
              key: 'outsource',
              label: '委外收发',
              children: <OutsourceTab items={osItems} setItems={setOsItems} pushTx={pushTx} addToStock={addToStock} />,
            },
            {
              key: 'warehouse',
              label: '立库交接',
              children: (
                <WarehouseTab
                  parts={parts}
                  smallDone={smallWarehouseDone}
                  setSmallDone={setSmallWarehouseDone}
                  largeStep={largeStep}
                  setLargeStep={setLargeStep}
                  setParts={setParts}
                  pushTx={pushTx}
                />
              ),
            },
          ]}
        />
      </div>
      {agvModal}
    </>
  );
}

/* ========== Tab 1 工卡作业 ========== */

function JobTab({
  parts,
  setParts,
  addToStock,
  pushTx,
  onWarehouse,
}: {
  parts: RcvPart[];
  setParts: (u: RcvPart[] | ((p: RcvPart[]) => RcvPart[])) => void;
  addToStock: (t: StockType, rows: RcvPart[]) => void;
  pushTx: (a: string, code: string, qty: number, target: string, stockType?: StockType) => Promise<void>;
  onWarehouse: (rows: RcvPart[]) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [action, setAction] = useState<'outsource_cache' | 'staging' | 'scrap' | 'warehouse' | null>(null);

  const selected = useMemo(() => parts.filter((p) => selectedKeys.includes(p.key)), [parts, selectedKeys]);
  const pendingCount = parts.filter((p) => p.status === 'pending').length;

  const columns: ColumnsType<RcvPart> = [
    { title: '零件编号', dataIndex: 'part_code', width: '16%' },
    { title: '零件名称', dataIndex: 'part_name', width: '16%' },
    { title: '条码', dataIndex: 'barcode', width: '18%', ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: '8%', align: 'center' },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      width: '14%',
      align: 'center',
      render: (t: BizType) => <Tag color={BIZ_COLORS[t]}>{BIZ_LABELS[t]}</Tag>,
    },
    {
      title: '执行状态',
      dataIndex: 'status',
      width: '12%',
      align: 'center',
      render: (s: ExecStatus) =>
        s === 'done' ? (
          <Tag color="success">已登记</Tag>
        ) : (
          <Tag>待处理</Tag>
        ),
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ];

  const rowSelection: TableProps<RcvPart>['rowSelection'] = {
    selectedRowKeys: selectedKeys,
    onChange: setSelectedKeys,
    getCheckboxProps: (r) => ({ disabled: r.status === 'done' }),
  };

  const openAction = (a: typeof action) => {
    if (selected.filter((p) => p.status === 'pending').length === 0) {
      message.warning('请勾选待处理零件');
      return;
    }
    setAction(a);
  };

  const markDone = (rows: RcvPart[]) => {
    const keys = new Set(rows.map((r) => r.key));
    setParts((prev) => prev.map((p) => (keys.has(p.key) ? { ...p, status: 'done' } : p)));
    setSelectedKeys([]);
  };

  const confirm = async () => {
    const rows = selected.filter((p) => p.status === 'pending');
    if (!action || rows.length === 0) return;
    try {
      if (action === 'warehouse') {
        await onWarehouse(rows);
        markDone(rows);
      } else {
        const label = STOCK_TYPE_LABELS[action];
        await pushTx(`入${label}`, rows.map((r) => r.part_code).join(','), rows.reduce((n, r) => n + r.quantity, 0), label, action);
        addToStock(action, rows);
        markDone(rows);
        message.success(`已入「${label}」`);
      }
      setAction(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const actionTitle =
    action === 'warehouse'
      ? '登记入立库'
      : action
        ? `入${STOCK_TYPE_LABELS[action]}`
        : '';

  const actionBody: ReactNode =
    action === 'warehouse' ? (
      <Paragraph>
        合格小零件入立库缓存（未齐套）：故检合格但尚未与其他零件齐套的小零件，经收发工位登记后 AGV/人工入立库缓存。
      </Paragraph>
    ) : action === 'outsource_cache' ? (
      <Paragraph>零件将记入线边库「待委外缓存」，等待委外发运。</Paragraph>
    ) : action === 'staging' ? (
      <Paragraph>零件将记入线边库「零件暂存（待处理）」，供产线各环节继续处理。</Paragraph>
    ) : action === 'scrap' ? (
      <Paragraph>报废件入库记账；后续须执行报废出库动作并留存凭证。</Paragraph>
    ) : null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--op-text-secondary)', fontSize: 'var(--op-font-base)' }}>
          已选 {selectedKeys.length} 件 ·{' '}
          {pendingCount > 0 ? (
            `待处理 ${pendingCount} 件`
          ) : (
            <span style={{ color: 'var(--op-status-qualified)', fontWeight: 600 }}>全部已登记</span>
          )}
        </span>
        <Space wrap>
          <Button size="large" onClick={() => openAction('outsource_cache')}>入待委外缓存</Button>
          <Button size="large" onClick={() => openAction('staging')}>入零件暂存</Button>
          <Button size="large" onClick={() => openAction('scrap')}>报废入库</Button>
          <Button type="primary" size="large" onClick={() => openAction('warehouse')}>登记入立库</Button>
        </Space>
      </div>
      <Table<RcvPart>
        rowKey="key"
        size="middle"
        columns={columns}
        dataSource={parts}
        rowSelection={rowSelection}
        pagination={false}
        scroll={{ x: true }}
      />
      <Modal
        title={actionTitle}
        open={!!action}
        onCancel={() => setAction(null)}
        onOk={confirm}
        okText="确认"
        destroyOnHidden
        width={520}
      >
        {actionBody}
        <Paragraph>
          <Text strong>已选：</Text>
          {selected.map((p) => `${p.part_name}（${p.part_code}）×${p.quantity}`).join('、')}
        </Paragraph>
      </Modal>
    </>
  );
}

/* ========== Tab 2 线边库 ========== */

function StockTab({
  stocks,
  setStocks,
  txs,
  pushTx,
}: {
  stocks: StockItem[];
  setStocks: (u: StockItem[] | ((p: StockItem[]) => StockItem[])) => void;
  txs: TxRow[];
  pushTx: (a: string, code: string, qty: number, target: string, stockType?: StockType) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [outItem, setOutItem] = useState<StockItem | null>(null);
  const [form] = Form.useForm();

  const renderZone = (stock_type: StockType) => {
    const rows = stocks.filter((s) => s.stock_type === stock_type);
    const total = rows.reduce((n, r) => n + r.quantity, 0);
    return (
      <Card
        key={stock_type}
        size="small"
        title={
          <span>
            {STOCK_TYPE_LABELS[stock_type]}
            <Text type="secondary" style={{ marginLeft: 12, fontWeight: 400 }}>
              共 {total} 件 / {rows.length} 种
            </Text>
          </span>
        }
        style={{ marginBottom: 16, background: 'var(--op-bg-elevated)' }}
      >
        {rows.length === 0 ? (
          <Empty description="暂无库存" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table<StockItem>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={[
              { title: '零件编号', dataIndex: 'part_code' },
              { title: '名称', dataIndex: 'part_name' },
              { title: '数量', dataIndex: 'quantity', width: 80, align: 'center' },
              {
                title: '操作',
                key: 'op',
                width: 100,
                render: (_, row) => (
                  <Button
                    size="small"
                    onClick={() => {
                      setOutItem(row);
                      form.setFieldsValue({ quantity: 1, target: 'line' });
                    }}
                  >
                    出库
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    );
  };

  const handleOut = async () => {
    if (!outItem) return;
    try {
      const v = await form.validateFields();
      const qty = Number(v.quantity);
      if (qty > outItem.quantity) {
        message.warning('出库数量不能大于库存');
        return;
      }
      const targetLabel =
        v.target === 'line' ? '产线工位' : v.target === 'scrap_out' ? '报废出库' : '委外发运';
      await pushTx('出库', outItem.part_code, qty, targetLabel, outItem.stock_type);
      setStocks((prev) =>
        prev
          .map((s) => (s.key === outItem.key ? { ...s, quantity: s.quantity - qty } : s))
          .filter((s) => s.quantity > 0),
      );
      message.success(`已出库 → ${targetLabel}`);
      setOutItem(null);
      form.resetFields();
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error((e as Error).message);
    }
  };

  return (
    <>
      {STOCK_TYPES_ORDER.map(renderZone)}
      <Card size="small" title="出入库流水（本地）" style={{ background: 'var(--op-bg-elevated)' }}>
        <Table<TxRow>
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={txs}
          locale={{ emptyText: <Empty description="暂无流水" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={[
            { title: '时间', dataIndex: 'time', width: '22%' },
            { title: '动作', dataIndex: 'action', width: '16%' },
            { title: '零件', dataIndex: 'part_code', width: '22%' },
            { title: '数量', dataIndex: 'quantity', width: '10%', align: 'center' },
            { title: '目标/库位', dataIndex: 'target' },
          ]}
        />
      </Card>
      <Modal
        title="线边库出库"
        open={!!outItem}
        onCancel={() => setOutItem(null)}
        onOk={() => void handleOut()}
        okText="确认出库"
        destroyOnHidden
      >
        <Paragraph>
          {outItem?.part_name}（{outItem?.part_code}）库存 {outItem?.quantity}
        </Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="quantity" label="出库数量" rules={[{ required: true }]}>
            <InputNumber min={1} size="large" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="target" label="出库目标" rules={[{ required: true }]}>
            <Select
              size="large"
              options={[
                { value: 'line', label: '产线工位（原则上先入立库再发，紧急串件须回传 PCS/WES）' },
                { value: 'outsource', label: '委外发运' },
                { value: 'scrap_out', label: '报废出库' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

const STOCK_TYPES_ORDER: StockType[] = ['outsource_cache', 'staging', 'scrap'];

/* ========== Tab 3 委外收发 ========== */

function OutsourceTab({
  items,
  setItems,
  pushTx,
  addToStock,
}: {
  items: OsItem[];
  setItems: (u: OsItem[] | ((p: OsItem[]) => OsItem[])) => void;
  pushTx: (a: string, code: string, qty: number, target: string, stockType?: StockType) => Promise<void>;
  addToStock: (t: StockType, rows: RcvPart[]) => void;
}) {
  const { message } = App.useApp();
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [mode, setMode] = useState<'ship' | 'return' | null>(null);
  const [returnDest, setReturnDest] = useState<'staging' | 'warehouse'>('staging');

  const selected = items.filter((i) => selectedKeys.includes(i.key));

  const sections: { phase: OutsourcePhase; title: string }[] = [
    { phase: 'pending_ship', title: '待发运' },
    { phase: 'shipped', title: '已发运' },
    { phase: 'returned', title: '已返回' },
  ];

  const openShip = () => {
    if (!selected.some((s) => s.phase === 'pending_ship')) {
      message.warning('请勾选待发运零件');
      return;
    }
    setMode('ship');
  };

  const openReturn = () => {
    if (!selected.some((s) => s.phase === 'shipped')) {
      message.warning('请勾选已发运待返回零件');
      return;
    }
    setMode('return');
  };

  const confirm = async () => {
    try {
    if (mode === 'ship') {
      const shipping = selected.filter((s) => s.phase === 'pending_ship');
      for (const s of shipping) {
        await pushTx('委外出库发运', s.part_code, s.quantity, '委外方', 'outsource_cache');
      }
      const keys = new Set(shipping.map((s) => s.key));
      setItems((prev) => prev.map((i) => (keys.has(i.key) ? { ...i, phase: 'shipped' } : i)));
      message.success('委外发运已登记');
    } else if (mode === 'return') {
      const rows = selected.filter((s) => s.phase === 'shipped');
      for (const s of rows) {
        await pushTx('委外返回验收', s.part_code, s.quantity, returnDest === 'staging' ? '暂存待复检' : '转立库交接', returnDest === 'staging' ? 'staging' : undefined);
      }
      const keys = new Set(rows.map((s) => s.key));
      setItems((prev) => prev.map((i) => (keys.has(i.key) ? { ...i, phase: 'returned' } : i)));
      if (returnDest === 'staging') {
        addToStock(
          'staging',
          rows.map((r) => ({
            key: r.key,
            part_code: r.part_code,
            part_name: r.part_name,
            barcode: '',
            quantity: r.quantity,
            bizType: 'staging' as BizType,
            status: 'done' as ExecStatus,
          })),
        );
      }
      message.success(returnDest === 'staging' ? '已返回并暂存待复检' : '已返回，请至立库交接办理');
    }
    setSelectedKeys([]);
    setMode(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" size="large" onClick={openShip}>出库发运</Button>
        <Button size="large" onClick={openReturn}>返回验收</Button>
      </Space>
      {sections.map(({ phase, title }) => {
        const rows = items.filter((i) => i.phase === phase);
        return (
          <Card
            key={phase}
            size="small"
            title={`${title}（${rows.length}）`}
            style={{ marginBottom: 16, background: 'var(--op-bg-elevated)' }}
          >
            <Table<OsItem>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={rows}
              locale={{ emptyText: <Empty description="无" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                getCheckboxProps: () => ({
                  disabled: phase === 'returned',
                }),
              }}
              columns={[
                { title: '零件编号', dataIndex: 'part_code' },
                { title: '名称', dataIndex: 'part_name' },
                { title: '数量', dataIndex: 'quantity', width: 80, align: 'center' },
              ]}
            />
          </Card>
        );
      })}
      <Modal
        title={mode === 'ship' ? '委外出库发运确认' : '委外返回验收'}
        open={!!mode}
        onCancel={() => setMode(null)}
        onOk={confirm}
        okText="确认"
        destroyOnHidden
        width={520}
      >
        {mode === 'ship' ? (
          <Paragraph>
            委外零件出库发运将通过收发工位登记留存交接记录。确认后状态变为「已发运」。
          </Paragraph>
        ) : (
          <>
            <Paragraph>委外完成返回验收登记；完成后可暂存线边库等待故检复检，或转立库交接。</Paragraph>
            <Form layout="vertical">
              <Form.Item label="返回后去向">
                <Select
                  size="large"
                  value={returnDest}
                  onChange={setReturnDest}
                  options={[
                    { value: 'staging', label: '暂存待复检（入零件暂存）' },
                    { value: 'warehouse', label: '转立库交接' },
                  ]}
                />
              </Form.Item>
            </Form>
          </>
        )}
        <Paragraph>
          <Text strong>已选：</Text>
          {selected.map((s) => `${s.part_name}×${s.quantity}`).join('、')}
        </Paragraph>
      </Modal>
    </>
  );
}

/* ========== Tab 4 立库交接 ========== */

function WarehouseTab({
  parts,
  smallDone,
  setSmallDone,
  largeStep,
  setLargeStep,
  setParts,
  pushTx,
}: {
  parts: RcvPart[];
  smallDone: boolean;
  setSmallDone: (v: boolean) => void;
  largeStep: number;
  setLargeStep: (n: number | ((p: number) => number)) => void;
  setParts: (u: RcvPart[] | ((p: RcvPart[]) => RcvPart[])) => void;
  pushTx: (a: string, code: string, qty: number, target: string, stockType?: StockType) => Promise<void>;
}) {
  const { message } = App.useApp();
  const smallParts = parts.filter((p) => p.bizType === 'warehouse');
  const largeParts = parts.filter((p) => p.bizType === 'large');

  const registerSmall = async () => {
    const pending = smallParts.filter((p) => p.status === 'pending');
    if (pending.length === 0) {
      message.info('小件已全部登记或无小件');
      return;
    }
    try {
      await pushTx(
        '小件入立库(未齐套)',
        pending.map((p) => p.part_code).join(','),
        pending.reduce((n, p) => n + p.quantity, 0),
        '立库缓存',
      );
      const keys = new Set(pending.map((p) => p.key));
      setParts((prev) => prev.map((p) => (keys.has(p.key) ? { ...p, status: 'done' } : p)));
      setSmallDone(true);
      message.success('已登记入立库；可点击 header AGV 发起转运（模拟）');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const advanceLarge = async () => {
    if (largeStep >= 3) return;
    const next = largeStep + 1;
    const labels = ['空盘到达缓存区', '复检合格件到站', '更换载具完成', '入立库完成'];
    try {
      await pushTx(`大件-${labels[next]}`, largeParts.map((p) => p.part_code).join(',') || 'LG', 1, 'OP04-2');
      setLargeStep(next);
      if (next === 3) {
        const keys = new Set(largeParts.map((p) => p.key));
        setParts((prev) => prev.map((p) => (keys.has(p.key) ? { ...p, status: 'done' } : p)));
        message.success('大件已入立库缓存');
      } else {
        message.success(labels[next]);
      }
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card
        title="OP04-1 小零件入立库缓存（未齐套）"
        style={{ background: 'var(--op-bg-elevated)' }}
      >
        <Paragraph type="secondary">
          故检合格但尚未与其他零件齐套的小零件，经收发工位登记后 AGV/人工入立库缓存。原则上合格小零件均须先入立库再发往产线；紧急串件须回传 PCS 与 WES。
        </Paragraph>
        <Table<RcvPart>
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={smallParts}
          locale={{ emptyText: '无小件' }}
          columns={[
            { title: '零件编号', dataIndex: 'part_code' },
            { title: '名称', dataIndex: 'part_name' },
            { title: '数量', dataIndex: 'quantity', width: 80, align: 'center' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: ExecStatus) => (s === 'done' ? <Tag color="success">已登记</Tag> : <Tag>待登记</Tag>),
            },
          ]}
        />
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" size="large" onClick={registerSmall} disabled={smallDone && smallParts.every((p) => p.status === 'done')}>
            登记入立库
          </Button>
          {smallDone && <Tag color="success">可发起 AGV/人工转运</Tag>}
        </Space>
      </Card>

      <Card title="OP04-2 大零件收发（换载具入立库）" style={{ background: 'var(--op-bg-elevated)' }}>
        <Paragraph type="secondary">
          大零件形迹托盘空盘 AGV 至收发缓存区 → 复检合格大零件至收发缓存 → 更换载具 → AGV/人工入立库缓存。
        </Paragraph>
        <Steps
          current={largeStep}
          style={{ marginBottom: 20 }}
          items={[
            { title: '空盘至缓存' },
            { title: '合格件到站' },
            { title: '更换载具' },
            { title: '入立库' },
          ]}
        />
        <Table<RcvPart>
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={largeParts}
          locale={{ emptyText: '无大件' }}
          style={{ marginBottom: 12 }}
          columns={[
            { title: '零件编号', dataIndex: 'part_code' },
            { title: '名称', dataIndex: 'part_name' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (s: ExecStatus) => (s === 'done' ? <Tag color="success">已入立库</Tag> : <Tag>进行中</Tag>),
            },
          ]}
        />
        <Button type="primary" size="large" onClick={advanceLarge} disabled={largeStep >= 3 || largeParts.length === 0}>
          {largeStep >= 3 ? '已完成' : `确认：${['空盘到达', '合格件到站', '更换载具', '入立库'][largeStep]}`}
        </Button>
      </Card>
    </Space>
  );
}
