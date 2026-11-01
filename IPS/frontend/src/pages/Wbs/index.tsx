/**
 * 单台计划（WBS）
 *
 * 左：令号选择；右：WBS 树表 + 批量顺延；TASK 节点点开侧栏看工卡/计划时段。
 */
import {
  CalendarOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Splitter,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { Key } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import TitleWithHelp from '@/components/TitleWithHelp';
import {
  HALF_DAY_OPTIONS,
  WBS_NODE_TYPE_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import { crudList, crudUpdate } from '@/services/crud';
import { listWorkHourMedians } from '@/services/monitor';
import { getWbsTree, postponeWbsNodes } from '@/services/wbs';
import { listWorkCards } from '@/services/workcards';
import { listWorkstations } from '@/services/workstation';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import './index.scss';

const { Text, Title } = Typography;

interface OrderOption {
  id: string;
  workshopOrderNo: string;
  name?: string;
  repairMethod?: string;
}

interface WbsTreeNode {
  id?: string;
  code: string;
  name?: string | null;
  level: number;
  nodeType: string;
  parentId?: string | null;
  sortOrder?: number;
  workshopOrderId: string;
  workstationId?: string | null;
  workCardTaskId?: string | null;
  operationInstanceId?: string | null;
  isRoutine?: boolean;
  status?: string;
  remark?: string | null;
  children?: WbsTreeNode[];
}

interface WorkCardRow {
  id?: string;
  workCardNo?: string;
  operationInstanceId?: string;
  status?: string;
  plannedDate?: string | null;
  plannedHalfDay?: string | null;
  standardHours?: string | number | null;
  selectedHours?: string | number | null;
  kitRequired?: boolean;
  workstationId?: string | null;
}

function flattenTree(nodes: WbsTreeNode[]): WbsTreeNode[] {
  const out: WbsTreeNode[] = [];
  const walk = (list: WbsTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function statusTag(status?: string) {
  if (!status) return '-';
  const e = WORK_CARD_STATUS_VALUE_ENUM[status];
  if (!e) return <Tag>{status}</Tag>;
  const color =
    e.status === 'Success'
      ? 'green'
      : e.status === 'Error'
        ? 'red'
        : e.status === 'Warning'
          ? 'gold'
          : 'blue';
  return <Tag color={color}>{e.text}</Tag>;
}

function halfLabel(v?: string | null) {
  return HALF_DAY_OPTIONS.find((o) => o.value === v)?.label ?? '';
}

export default function WbsPage() {
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const orderId = searchParams.get('orderId') || undefined;

  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [tree, setTree] = useState<WbsTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [cards, setCards] = useState<WorkCardRow[]>([]);
  const [stationMap, setStationMap] = useState<Record<string, string>>({});
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNode, setActiveNode] = useState<WbsTreeNode | null>(null);
  const [activeCard, setActiveCard] = useState<WorkCardRow | null>(null);

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm] = Form.useForm();
  const [planSaving, setPlanSaving] = useState(false);

  const [hourModalOpen, setHourModalOpen] = useState(false);
  const [hourMode, setHourMode] = useState<'standard' | 'median'>('standard');
  const [medianHours, setMedianHours] = useState<number | null>(null);

  const cardByOp = useMemo(() => {
    const map = new Map<string, WorkCardRow>();
    for (const c of cards) {
      if (c.operationInstanceId) map.set(c.operationInstanceId, c);
    }
    return map;
  }, [cards]);

  const loadOrders = useCallback(() => {
    setOrdersLoading(true);
    crudList('production', 'WorkshopOrder')
      .then((res) => {
        const { items } = parseApiListResponse<{
          id?: string;
          workshopOrderNo: string;
          name?: string;
          repairMethod?: string;
        }>(res);
        const list = items
          .filter((i) => i.id)
          .map((i) => ({
            id: i.id!,
            workshopOrderNo: i.workshopOrderNo,
            name: i.name,
            repairMethod: i.repairMethod,
          }));
        setOrders(list);
        if (!orderId && list[0]?.id) {
          patchSearchParams({ orderId: list[0].id });
        }
      })
      .finally(() => setOrdersLoading(false));
  }, [orderId, patchSearchParams]);

  const loadTree = useCallback(async (id: string) => {
    setTreeLoading(true);
    try {
      const [treeRes, cardsRes] = await Promise.all([
        getWbsTree(id),
        listWorkCards({ workshopOrderId: id, pageSize: 200 }),
      ]);
      if (!isApiSuccess(treeRes)) {
        message.error(getApiErrorMessage(treeRes, '加载 WBS 失败'));
        setTree([]);
        return;
      }
      const data = getApiData<{ tree: WbsTreeNode[]; total: number }>(treeRes);
      const roots = data?.tree ?? [];
      setTree(roots);
      setExpandedKeys(flattenTree(roots).map((n) => n.id!).filter(Boolean));
      setCards(parseApiListResponse<WorkCardRow>(cardsRes).items);
      setSelectedKeys([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    listWorkstations().then((res) => {
      const { items } = parseApiListResponse<{
        id?: string;
        stationNo: string;
        name?: string;
      }>(res);
      const map: Record<string, string> = {};
      for (const s of items) {
        if (s.id) map[s.id] = `${s.stationNo}${s.name ? ` ${s.name}` : ''}`;
      }
      setStationMap(map);
    });
  }, [loadOrders]);

  useEffect(() => {
    if (orderId) void loadTree(orderId);
    else {
      setTree([]);
      setCards([]);
    }
  }, [orderId, loadTree]);

  const selectOrder = (id: string) => {
    patchSearchParams({ orderId: id });
  };

  const openNode = (node: WbsTreeNode) => {
    setActiveNode(node);
    const card = node.operationInstanceId
      ? cardByOp.get(node.operationInstanceId) ?? null
      : null;
    setActiveCard(card);
    setDrawerOpen(true);
  };

  const doPostpone = () => {
    const ids = selectedKeys.map(String);
    if (!ids.length) {
      message.warning('请先勾选要顺延的节点');
      return;
    }
    let days = 1;
    modal.confirm({
      title: `批量顺延 ${ids.length} 个节点`,
      content: (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">顺延天数（后端当前以备注留痕，引擎侧按 DAG 重算）</Text>
          <InputNumber
            min={1}
            max={60}
            defaultValue={1}
            style={{ width: '100%', marginTop: 8 }}
            onChange={(v) => {
              days = Number(v) || 1;
            }}
          />
        </div>
      ),
      onOk: async () => {
        const res = await postponeWbsNodes(ids, days);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '顺延失败'));
          return;
        }
        message.success('已提交顺延');
        if (orderId) void loadTree(orderId);
      },
    });
  };

  const openPlanEdit = () => {
    if (!activeCard?.id) {
      message.warning('该节点尚未关联工卡计划时段');
      return;
    }
    planForm.setFieldsValue({
      plannedDate: activeCard.plannedDate ? dayjs(activeCard.plannedDate) : dayjs(),
      plannedHalfDay: activeCard.plannedHalfDay || 'AM',
    });
    setPlanModalOpen(true);
  };

  const savePlan = async () => {
    const values = await planForm.validateFields();
    if (!activeCard?.id) return;
    setPlanSaving(true);
    try {
      const res = await crudUpdate('production', 'WorkCard', activeCard.id, {
        plannedDate: values.plannedDate.format('YYYY-MM-DD'),
        plannedHalfDay: values.plannedHalfDay,
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '调整失败'));
        return;
      }
      message.success('计划时段已更新');
      setPlanModalOpen(false);
      if (orderId) void loadTree(orderId);
      // refresh drawer card
      const updated = {
        ...activeCard,
        plannedDate: values.plannedDate.format('YYYY-MM-DD'),
        plannedHalfDay: values.plannedHalfDay,
      };
      setActiveCard(updated);
    } finally {
      setPlanSaving(false);
    }
  };

  const openHourSwitch = async () => {
    if (!activeCard?.id) {
      message.warning('无关联工卡');
      return;
    }
    setHourMode('standard');
    setMedianHours(null);
    setHourModalOpen(true);
    try {
      const res = await listWorkHourMedians();
      const items = parseApiListResponse<{ medianHours?: string | number }>(res).items;
      if (items[0]?.medianHours != null) {
        setMedianHours(Number(items[0].medianHours));
      }
    } catch {
      // ignore
    }
  };

  const saveHourSwitch = async () => {
    if (!activeCard?.id) return;
    const hours =
      hourMode === 'median'
        ? medianHours
        : Number(activeCard.standardHours ?? 0);
    if (hours == null || Number.isNaN(hours)) {
      message.warning('无可用工时值');
      return;
    }
    const res = await crudUpdate('production', 'WorkCard', activeCard.id, {
      selectedHours: hours,
    });
    if (!isApiSuccess(res)) {
      message.error(getApiErrorMessage(res, '切换失败'));
      return;
    }
    message.success(`已切换为${hourMode === 'median' ? '历史中位数' : '标准工时'}：${hours}h`);
    setHourModalOpen(false);
    if (orderId) void loadTree(orderId);
    setActiveCard({ ...activeCard, selectedHours: hours });
  };

  const columns = [
    {
      title: '编码',
      dataIndex: 'code',
      width: 220,
      render: (v: string, r: WbsTreeNode) =>
        r.nodeType === 'TASK' ? (
          <Tag
            color="blue"
            variant="outlined"
            style={{ cursor: 'pointer' }}
            onClick={() => openNode(r)}
          >
            {v}
          </Tag>
        ) : (
          <Tag
            color="default"
            variant="outlined"
            style={{ cursor: 'pointer' }}
          >
            {v}
          </Tag>
        ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 220,
      ellipsis: true,
      render: (v: string, r: WbsTreeNode) => (
        <a onClick={() => openNode(r)}>{v || r.code}</a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'nodeType',
      width: 90,
      render: (v: string) =>
        WBS_NODE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: string, r: WbsTreeNode) => {
        const card = r.operationInstanceId
          ? cardByOp.get(r.operationInstanceId)
          : undefined;
        return statusTag(card?.status ?? v);
      },
    },
    {
      title: (
        <TitleWithHelp title="计划时段" help="来自关联工卡的 plannedDate + 上/下午。" />
      ),
      key: 'plan',
      width: 150,
      render: (_: unknown, r: WbsTreeNode) => {
        const card = r.operationInstanceId
          ? cardByOp.get(r.operationInstanceId)
          : undefined;
        if (!card?.plannedDate) return <Text type="secondary">-</Text>;
        return (
          <Tag icon={<CalendarOutlined />}>
            {card.plannedDate} {halfLabel(card.plannedHalfDay)}
          </Tag>
        );
      },
    },
    {
      title: '工时',
      key: 'hours',
      width: 90,
      render: (_: unknown, r: WbsTreeNode) => {
        const card = r.operationInstanceId
          ? cardByOp.get(r.operationInstanceId)
          : undefined;
        if (!card) return '-';
        return card.selectedHours ?? card.standardHours ?? '-';
      },
    },
    {
      title: '工位',
      dataIndex: 'workstationId',
      width: 120,
      ellipsis: true,
      render: (v: string, r: WbsTreeNode) => {
        const card = r.operationInstanceId
          ? cardByOp.get(r.operationInstanceId)
          : undefined;
        const id = card?.workstationId ?? v;
        return id ? stationMap[id] ?? id : '-';
      },
    },
  ];

  const selectedOrder = orders.find((o) => o.id === orderId);

  return (
    <>
    <Splitter style={{ height: 'calc(100vh - 56px)' }}>
      <Splitter.Panel defaultSize={260} min={200} max="40%" collapsible>
        <div className="wbs-sider">
          <div className="wbs-sider__header">
            <Title level={5} style={{ margin: 0 }}>
              车间令号
            </Title>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              loading={ordersLoading}
              onClick={loadOrders}
            />
          </div>
          <div className="wbs-sider__body">
            {orders.length === 0 && !ordersLoading ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无令号" />
            ) : (
              orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`wbs-sider__item${o.id === orderId ? ' is-active' : ''}`}
                  onClick={() => selectOrder(o.id)}
                >
                  <span className="wbs-sider__no">{o.workshopOrderNo}</span>
                  <span className="wbs-sider__name">{o.name || o.repairMethod || ''}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Splitter.Panel>

      <Splitter.Panel>
        <div className="wbs-main">
          {!orderId ? (
            <Empty description="请选择左侧令号" style={{ marginTop: 80 }} />
          ) : (
            <>
              <div className="wbs-main__toolbar">
                <Space wrap>
                  <Title level={4} style={{ margin: 0 }}>
                    {selectedOrder?.workshopOrderNo ?? '单台计划'}
                  </Title>
                  <Text type="secondary">WBS</Text>
                  <Link to={`/plan/orders/${orderId}`}>令号详情</Link>
                </Space>
                <Space>
                  <Button
                    disabled={!selectedKeys.length}
                    onClick={doPostpone}
                  >
                    批量顺延
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={treeLoading}
                    onClick={() => orderId && void loadTree(orderId)}
                  >
                    刷新
                  </Button>
                </Space>
              </div>

              <Table
                size="small"
                rowKey="id"
                loading={treeLoading}
                columns={columns as any}
                dataSource={tree}
                pagination={false}
                expandable={{
                  expandedRowKeys: expandedKeys,
                  onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
                  childrenColumnName: 'children',
                }}
                rowSelection={{
                  selectedRowKeys: selectedKeys,
                  onChange: (keys) => setSelectedKeys(keys),
                  checkStrictly: false,
                }}
                scroll={{ x: 960, y: 'calc(100vh - 160px)' }}
                locale={{
                  emptyText: (
                    <Empty description="该令号暂无 WBS 节点（投产后会生成根节点，可在后端继续展开层级）" />
                  ),
                }}
              />
            </>
          )}
        </div>
      </Splitter.Panel>
    </Splitter>

      <Drawer
        title={`节点 · ${activeNode?.code ?? ''}`}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            {activeCard?.id && (
              <>
                <Button size="small" icon={<CalendarOutlined />} onClick={openPlanEdit}>
                  调整时段
                </Button>
                <Button size="small" icon={<FieldTimeOutlined />} onClick={() => void openHourSwitch()}>
                  工时切换
                </Button>
              </>
            )}
          </Space>
        }
      >
        {activeNode && (
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="编码">{activeNode.code}</Descriptions.Item>
            <Descriptions.Item label="名称">{activeNode.name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="类型">
              {WBS_NODE_TYPE_OPTIONS.find((o) => o.value === activeNode.nodeType)?.label ??
                activeNode.nodeType}
            </Descriptions.Item>
            <Descriptions.Item label="层级">L{activeNode.level}</Descriptions.Item>
            <Descriptions.Item label="例行">
              {activeNode.isRoutine === false ? (
                <Tag color="orange">非例行</Tag>
              ) : (
                <Tag>例行</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="备注">{activeNode.remark ?? '-'}</Descriptions.Item>
          </Descriptions>
        )}

        {activeCard ? (
          <>
            <Title level={5}>关联工卡</Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="工卡号">
                <Link to={`/dispatch/workcards/${activeCard.id}`}>{activeCard.workCardNo}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(activeCard.status)}</Descriptions.Item>
              <Descriptions.Item label="计划时段">
                {activeCard.plannedDate
                  ? `${activeCard.plannedDate} ${halfLabel(activeCard.plannedHalfDay)}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="标准工时">{activeCard.standardHours ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="选用工时">{activeCard.selectedHours ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="齐套">
                {activeCard.kitRequired ? <Tag color="orange">需齐套</Tag> : <Tag>无需</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="工位">
                {activeCard.workstationId
                  ? stationMap[activeCard.workstationId] ?? activeCard.workstationId
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="非工卡任务节点，或尚未关联工序实例"
          />
        )}
      </Drawer>

      <Modal
        title="调整计划时段"
        open={planModalOpen}
        onCancel={() => setPlanModalOpen(false)}
        onOk={() => void savePlan()}
        confirmLoading={planSaving}
        destroyOnHidden
      >
        <Form form={planForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="plannedDate"
            label="计划日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="plannedHalfDay"
            label="上/下午"
            rules={[{ required: true }]}
          >
            <Select options={HALF_DAY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="工时选用切换"
        open={hourModalOpen}
        onCancel={() => setHourModalOpen(false)}
        onOk={() => void saveHourSwitch()}
        destroyOnHidden
      >
        <Radio.Group
          value={hourMode}
          onChange={(e) => setHourMode(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Radio value="standard">
            标准工时（{activeCard?.standardHours ?? '-'} h）
          </Radio>
          <Radio value="median" disabled={medianHours == null}>
            历史中位数（{medianHours != null ? `${medianHours} h` : '暂无样本'}）
          </Radio>
        </Radio.Group>
      </Modal>
    </>
  );
}
