/**
 * 创建非例行工卡（Insert）— FixHeaderPage 向导
 *
 * 选令号 / 工序实例 / 工位 / 优先级 / 管道插入位 → 影响预览 → POST /workcards/non-routine
 */
import {
  ProForm,
  ProFormDigit,
  ProFormInstance,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { Alert, Button, Card, Space, Table, Tag } from 'antd';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { WORK_CARD_STATUS_VALUE_ENUM } from '@/constants/enums';
import { getOrderOverview } from '@/services/orders';
import { crudList } from '@/services/crud';
import { createNonRoutineCard, listWorkCards } from '@/services/workcards';
import { listWorkstations } from '@/services/workstation';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { NON_ROUTINE_PRIORITY_OPTIONS } from '../schema';

interface ImpactRow {
  id?: string;
  workCardNo?: string;
  status?: string;
  priority?: string;
  pipelineOrder?: number | null;
  displaced?: boolean;
}

export default function NonRoutineCreate() {
  const navigate = useNavigate();
  const formRef = useRef<ProFormInstance>(null);
  const [submitting, setSubmitting] = useState(false);
  const [impact, setImpact] = useState<ImpactRow[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);

  const refreshImpact = async () => {
    const values = formRef.current?.getFieldsValue?.() ?? {};
    const workstationId = values.workstationId as string | undefined;
    const pipelineOrder = Number(values.pipelineOrder ?? 1);
    if (!workstationId) {
      setImpact([]);
      return;
    }
    setImpactLoading(true);
    try {
      const res = await listWorkCards({ workstationId, pageSize: 100 });
      const items = parseApiListResponse<ImpactRow>(res).items.filter((c) =>
        ['PENDING_ACCEPT', 'PENDING_REPAIR', 'REPAIRING'].includes(c.status ?? ''),
      );
      const sorted = [...items].sort(
        (a, b) => (a.pipelineOrder ?? 999) - (b.pipelineOrder ?? 999),
      );
      setImpact(
        sorted.map((c) => ({
          ...c,
          displaced: (c.pipelineOrder ?? 999) >= pipelineOrder,
        })),
      );
    } finally {
      setImpactLoading(false);
    }
  };

  const submit = async (values: Record<string, unknown>) => {
    const body = {
      workshopOrderId: String(values.workshopOrderId),
      operationInstanceId: String(values.operationInstanceId),
      workstationId: String(values.workstationId),
      priority: (values.priority as 'NON_ROUTINE' | 'URGENT') || 'NON_ROUTINE',
      pipelineOrder: values.pipelineOrder ? Number(values.pipelineOrder) : 1,
      remark: values.remark ? String(values.remark) : undefined,
    };

    const displaced = impact.filter((i) => i.displaced);
    modal.confirm({
      title: '确认插单 Insert？',
      width: 520,
      content: (
        <div>
          <p>
            将插入管道第 <strong>{body.pipelineOrder}</strong> 位
            {displaced.length > 0
              ? `，预计影响 ${displaced.length} 张低优先级/后序工卡（顺延由引擎处理）。`
              : '，当前管道无后序工卡。'}
          </p>
          {displaced.length > 0 && (
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={displaced.slice(0, 5)}
              columns={[
                { title: '工卡', dataIndex: 'workCardNo' },
                {
                  title: '原位置',
                  dataIndex: 'pipelineOrder',
                  width: 80,
                  render: (v) => (v != null ? `#${v}` : '-'),
                },
              ]}
            />
          )}
        </div>
      ),
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await createNonRoutineCard(body);
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, '创建失败'));
            return;
          }
          const data = getApiData<{ id?: string }>(res);
          message.success('非例行工卡已创建并插入管道');
          navigate(data?.id ? `/dispatch/workcards/${data.id}` : '/dispatch/non-routine');
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  return (
    <FixHeaderPage
      title={<PageContainerTitleWithBack title="创建非例行工卡" backTo="/dispatch/non-routine" />}
      extra={
        <Space>
          <Button onClick={() => navigate('/dispatch/non-routine')}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => formRef.current?.submit()}>
            确认插单
          </Button>
        </Space>
      }
    >
      <div style={{ padding: '0 24px 24px', maxWidth: 920 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="非例行工卡将以「待接受」状态插入指定工位管道位置；低优先级工卡顺延由排产引擎处理。"
        />

        <ProForm
          formRef={formRef}
          layout="vertical"
          submitter={false}
          onFinish={submit}
          initialValues={{ priority: 'NON_ROUTINE', pipelineOrder: 1 }}
          onValuesChange={(changed) => {
            if ('workstationId' in changed || 'pipelineOrder' in changed) {
              void refreshImpact();
            }
          }}
        >
          <Card title="插单信息" style={{ marginBottom: 16 }}>
            <ProFormSelect
              name="workshopOrderId"
              label="车间令号"
              rules={[{ required: true, message: '请选择令号' }]}
              request={async () => {
                const res = await crudList('production', 'WorkshopOrder');
                const { items } = parseApiListResponse<{
                  id?: string;
                  workshopOrderNo: string;
                  name?: string;
                }>(res);
                return items.map((i) => ({
                  label: `${i.workshopOrderNo}${i.name ? `（${i.name}）` : ''}`,
                  value: i.id,
                }));
              }}
              fieldProps={{
                showSearch: true,
                optionFilterProp: 'label',
                onChange: () => {
                  formRef.current?.setFieldsValue({ operationInstanceId: undefined });
                },
              }}
            />

            <ProFormSelect
              name="operationInstanceId"
              label="工序实例"
              rules={[{ required: true, message: '请选择工序实例' }]}
              dependencies={['workshopOrderId']}
              request={async (params) => {
                const orderId = params.workshopOrderId as string | undefined;
                if (!orderId) return [];
                const res = await getOrderOverview(orderId);
                if (!isApiSuccess(res)) return [];
                const data = getApiData<{
                  workCards?: Array<{
                    operationInstanceId?: string;
                    workCardNo?: string;
                    name?: string;
                    operationName?: string;
                  }>;
                }>(res);
                const seen = new Set<string>();
                const opts: { label: string; value: string }[] = [];
                for (const c of data?.workCards ?? []) {
                  const oid = c.operationInstanceId;
                  if (!oid || seen.has(oid)) continue;
                  seen.add(oid);
                  const label =
                    c.operationName || c.name || `${c.workCardNo ?? '工卡'} 关联工序`;
                  opts.push({ label, value: oid });
                }
                // 兜底：全量工序实例
                if (opts.length === 0) {
                  const all = await crudList('production', 'OperationInstance', { pageSize: 50 });
                  const { items } = parseApiListResponse<{
                    id?: string;
                    name?: string;
                    sourceNodeNo?: string;
                  }>(all);
                  return items.map((i) => ({
                    label: i.name || i.sourceNodeNo || i.id,
                    value: i.id,
                  }));
                }
                return opts;
              }}
              fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
            />

            <ProFormSelect
              name="workstationId"
              label="目标工位"
              rules={[{ required: true, message: '请选择工位' }]}
              request={async () => {
                const res = await listWorkstations();
                const { items } = parseApiListResponse<{
                  id?: string;
                  stationNo: string;
                  name?: string;
                }>(res);
                return items.map((i) => ({
                  label: `${i.stationNo}${i.name ? `（${i.name}）` : ''}`,
                  value: i.id,
                }));
              }}
              fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
            />

            <ProFormSelect
              name="priority"
              label="优先级"
              rules={[{ required: true }]}
              options={NON_ROUTINE_PRIORITY_OPTIONS}
            />

            <ProFormDigit
              name="pipelineOrder"
              label="插入管道位置"
              min={1}
              fieldProps={{ precision: 0 }}
              extra="例如填 2 表示插入队列第 2 位"
              rules={[{ required: true, message: '请填写插入位置' }]}
            />

            <ProFormTextArea name="remark" label="备注" fieldProps={{ rows: 2 }} />
          </Card>

          <Card
            title="影响评估"
            extra={
              <Button size="small" loading={impactLoading} onClick={() => void refreshImpact()}>
                刷新预览
              </Button>
            }
          >
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="标红行为将被挤占/顺延的候选工卡（以当前管道序 ≥ 插入位近似评估）。"
            />
            <Table
              size="small"
              rowKey="id"
              loading={impactLoading}
              pagination={false}
              dataSource={impact}
              locale={{ emptyText: '请先选择目标工位以预览管道' }}
              rowClassName={(r) => (r.displaced ? 'ant-table-row-selected' : '')}
              columns={[
                {
                  title: '位置',
                  dataIndex: 'pipelineOrder',
                  width: 70,
                  render: (v) => (v != null ? `#${v}` : '-'),
                },
                { title: '工卡号', dataIndex: 'workCardNo' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 100,
                  render: (v: string) => {
                    const e = WORK_CARD_STATUS_VALUE_ENUM[v];
                    return e ? <Tag>{e.text}</Tag> : v;
                  },
                },
                { title: '优先级', dataIndex: 'priority', width: 100 },
                {
                  title: '影响',
                  dataIndex: 'displaced',
                  width: 90,
                  render: (v: boolean) =>
                    v ? <Tag color="red">将被挤占</Tag> : <Tag color="green">不受影响</Tag>,
                },
              ]}
            />
          </Card>
        </ProForm>
      </div>
    </FixHeaderPage>
  );
}
