/**
 * 排产规则配置
 *
 * - 排期参数 / 工时策略：GET·PATCH /api/ips/config/schedule
 * - 工位产能：列表 + Modal 创建/更新 PUT /api/ips/config/workstation-capacity
 * - 优先级档位说明（引擎内置权重，本页只读展示）
 * - 挂起释放管道：固定「释放」，不可关闭
 */
import { EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import type { ActionType, ProFormInstance } from '@ant-design/pro-components';
import {
  PageContainer,
  ProForm,
  ProFormDigit,
  ProFormSwitch,
  ProFormTimePicker,
} from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import TitleWithHelp from '@/components/TitleWithHelp';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { SCHEDULE_PRIORITY_OPTIONS } from '@/constants/enums';
import {
  getScheduleConfig,
  listWorkstationCapacity,
  updateScheduleConfig,
  upsertWorkstationCapacity,
} from '@/services/config';
import { listWorkstations } from '@/services/workstation';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

const { Text, Paragraph } = Typography;

/** 引擎内置优先级权重（只读展示） */
const PRIORITY_WEIGHTS: Record<string, number> = {
  ROUTINE: 1,
  NON_ROUTINE: 5,
  URGENT: 10,
};

function timeToStr(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string') return v.length >= 5 ? v.slice(0, 5) : v;
  if (dayjs.isDayjs(v)) return v.format('HH:mm');
  return dayjs(v as string | number | Date).format('HH:mm');
}

function strToTime(v?: string | null) {
  if (!v) return undefined;
  const s = v.length >= 5 ? v.slice(0, 5) : v;
  const d = dayjs(s, 'HH:mm');
  return d.isValid() ? d : undefined;
}

function toScheduleFormValues(cfg: Record<string, any>) {
  return {
    includeSaturday: cfg.includeSaturday ?? false,
    includeSunday: cfg.includeSunday ?? false,
    amStart: strToTime(cfg.amStart) ?? dayjs('08:00', 'HH:mm'),
    amEnd: strToTime(cfg.amEnd) ?? dayjs('12:00', 'HH:mm'),
    pmStart: strToTime(cfg.pmStart) ?? dayjs('13:00', 'HH:mm'),
    pmEnd: strToTime(cfg.pmEnd) ?? dayjs('17:00', 'HH:mm'),
    pipelineCapacityFactor: Number(cfg.pipelineCapacityFactor ?? 2),
    effectiveLookaheadSlots: Number(cfg.effectiveLookaheadSlots ?? 1),
    preferHistoricalMedian: cfg.preferHistoricalMedian ?? false,
  };
}

export default function EngineConfigPage() {
  const formRef = useRef<ProFormInstance>(undefined);
  /** 外部 Form 实例：Card loading 会卸载 ProForm，须把值写在独立 store 上，否则 setFieldsValue 落空 */
  const [scheduleForm] = Form.useForm();
  const capacityRef = useRef<ActionType | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stationMap, setStationMap] = useState<Record<string, string>>({});
  const [stationOptions, setStationOptions] = useState<{ label: string; value: string }[]>([]);

  const [capModalOpen, setCapModalOpen] = useState(false);
  const [capSubmitting, setCapSubmitting] = useState(false);
  const [capEditing, setCapEditing] = useState<Record<string, any> | null>(null);
  const [capForm] = Form.useForm();

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await getScheduleConfig();
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '加载配置失败'));
        return;
      }
      const raw = getApiData<Record<string, any>>(res);
      // 后端可能返回 null（尚无默认配置）
      const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      scheduleForm.setFieldsValue(toScheduleFormValues(cfg));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
    listWorkstations().then((res) => {
      const { items } = parseApiListResponse<{
        id?: string;
        stationNo: string;
        name?: string;
      }>(res);
      const map: Record<string, string> = {};
      const opts: { label: string; value: string }[] = [];
      for (const s of items) {
        if (!s.id) continue;
        const label = `${s.stationNo}${s.name ? `（${s.name}）` : ''}`;
        map[s.id] = label;
        opts.push({ label, value: s.id });
      }
      setStationMap(map);
      setStationOptions(opts);
    });
  }, []);

  const saveSchedule = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body = {
        includeSaturday: Boolean(values.includeSaturday),
        includeSunday: Boolean(values.includeSunday),
        amStart: timeToStr(values.amStart),
        amEnd: timeToStr(values.amEnd),
        pmStart: timeToStr(values.pmStart),
        pmEnd: timeToStr(values.pmEnd),
        pipelineCapacityFactor: Number(values.pipelineCapacityFactor ?? 2),
        effectiveLookaheadSlots: Number(values.effectiveLookaheadSlots ?? 1),
        preferHistoricalMedian: Boolean(values.preferHistoricalMedian),
      };
      const res = await updateScheduleConfig(body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存失败'));
        return;
      }
      message.success('排产规则已保存');
      await loadConfig();
    } finally {
      setSaving(false);
    }
  };

  const openCapCreate = () => {
    setCapEditing(null);
    capForm.resetFields();
    capForm.setFieldsValue({
      effectiveFrom: dayjs().format('YYYY-MM-DD'),
      dailyLoadHours: 8,
      pipelineCapacityFactor: 2,
    });
    setCapModalOpen(true);
  };

  const openCapEdit = (record: Record<string, any>) => {
    setCapEditing(record);
    capForm.setFieldsValue({
      workstationId: record.workstationId,
      effectiveFrom: record.effectiveFrom,
      dailyLoadHours: Number(record.dailyLoadHours ?? 0),
      amHours: record.amHours != null ? Number(record.amHours) : undefined,
      pmHours: record.pmHours != null ? Number(record.pmHours) : undefined,
      pipelineCapacityFactor:
        record.pipelineCapacityFactor != null
          ? Number(record.pipelineCapacityFactor)
          : undefined,
    });
    setCapModalOpen(true);
  };

  const submitCapacity = async () => {
    const values = await capForm.validateFields();
    setCapSubmitting(true);
    try {
      const res = await upsertWorkstationCapacity({
        workstationId: values.workstationId,
        effectiveFrom: values.effectiveFrom,
        dailyLoadHours: values.dailyLoadHours,
        amHours: values.amHours ?? null,
        pmHours: values.pmHours ?? null,
        pipelineCapacityFactor: values.pipelineCapacityFactor ?? null,
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '保存产能失败'));
        return;
      }
      message.success(capEditing ? '产能已更新' : '产能已创建');
      setCapModalOpen(false);
      capacityRef.current?.reload();
    } finally {
      setCapSubmitting(false);
    }
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {/* 排期参数 */}
        <Card
          title={<TitleWithHelp title="排期参数" help="控制可排工作日、班次时段与自动生效前瞻窗口。" />}
          loading={loading}
          extra={
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => formRef.current?.submit()}
            >
              保存
            </Button>
          }
        >
          <Alert
            type="info"
            showIcon
            message="排产规则作用于自动引擎：改动后对新一轮调度立即生效；已在途工卡计划时段不会自动回写。"
            style={{ marginBottom: 16 }}
          />
          <ProForm
            form={scheduleForm}
            formRef={formRef}
            layout="vertical"
            submitter={false}
            onFinish={saveSchedule}
          >
            <Row gutter={24}>
              <Col xs={24} md={8}>
                <ProFormSwitch name="includeSaturday" label="包含周六" />
              </Col>
              <Col xs={24} md={8}>
                <ProFormSwitch
                  name="includeSunday"
                  label="包含周日"
                  extra="默认关闭"
                />
              </Col>
              <Col xs={24} md={8}>
                <ProFormSwitch
                  name="preferHistoricalMedian"
                  label={
                    <TitleWithHelp
                      title="优先历史中位数工时"
                      help="开启后，当样本量足够时优先用历史中位数作为排程工时，否则用标准工时。"
                    />
                  }
                />
              </Col>
            </Row>

            <Row gutter={24}>
              <Col xs={12} md={6}>
                <ProFormTimePicker
                  name="amStart"
                  label="上午开始"
                  fieldProps={{ format: 'HH:mm', needConfirm: false }}
                />
              </Col>
              <Col xs={12} md={6}>
                <ProFormTimePicker
                  name="amEnd"
                  label="上午结束"
                  fieldProps={{ format: 'HH:mm', needConfirm: false }}
                />
              </Col>
              <Col xs={12} md={6}>
                <ProFormTimePicker
                  name="pmStart"
                  label="下午开始"
                  fieldProps={{ format: 'HH:mm', needConfirm: false }}
                />
              </Col>
              <Col xs={12} md={6}>
                <ProFormTimePicker
                  name="pmEnd"
                  label="下午结束"
                  fieldProps={{ format: 'HH:mm', needConfirm: false }}
                />
              </Col>
            </Row>

            <Row gutter={24}>
              <Col xs={24} md={8}>
                <ProFormDigit
                  name="pipelineCapacityFactor"
                  label={
                    <TitleWithHelp
                      title="全局管道容量系数"
                      help="管道容量 = 日负荷 × 系数。工位产能表可覆盖单工位系数。"
                    />
                  }
                  min={1}
                  max={10}
                  fieldProps={{ step: 0.5, precision: 1 }}
                  rules={[{ required: true, message: '请填写容量系数' }]}
                />
              </Col>
              <Col xs={24} md={8}>
                <ProFormDigit
                  name="effectiveLookaheadSlots"
                  label={
                    <TitleWithHelp
                      title="自动生效前瞻窗口"
                      help="单位为 0.5 天（半天）。例如 1 = 前瞻 0.5 天，2 = 前瞻 1 天。"
                    />
                  }
                  min={0}
                  max={20}
                  fieldProps={{ precision: 0 }}
                  rules={[{ required: true, message: '请填写前瞻窗口' }]}
                />
              </Col>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 8 }}>
                  <Text>挂起释放管道</Text>
                </div>
                <Space>
                  <Switch checked disabled />
                  <Tag color="blue">固定：释放</Tag>
                </Space>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    文档已固化，不可关闭
                  </Text>
                </div>
              </Col>
            </Row>
          </ProForm>
        </Card>

        {/* 优先级档位 */}
        <Card
          title={
            <TitleWithHelp
              title="优先级档位"
              help="例行 / 非例行 / 紧急插单的相对权重由引擎内置，本页仅展示档位说明。"
            />
          }
        >
          <Row gutter={[16, 16]}>
            {SCHEDULE_PRIORITY_OPTIONS.map((o) => (
              <Col xs={24} sm={8} key={o.value}>
                <Card size="small" type="inner">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="档位">{o.label}</Descriptions.Item>
                    <Descriptions.Item label="代码">
                      <Tag>{o.value}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="内置权重">
                      <Text strong>{PRIORITY_WEIGHTS[o.value] ?? '-'}</Text>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            ))}
          </Row>
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            权重越大越优先占用管道；插队评估与顺延逻辑均按此档位排序。
          </Paragraph>
        </Card>

        {/* 工位产能 */}
        <Card
          title={
            <TitleWithHelp
              title="工位产能（覆盖全局）"
              help="按工位 + 生效日起配置日负荷与管道系数；同工位同生效日重复提交为更新。"
            />
          }
          styles={{ body: { paddingTop: 8 } }}
        >
          <UrlSyncedProTable<Record<string, any>>
            actionRef={capacityRef}
            rowKey="id"
            headerTitle="工位产能记录"
            search={false}
            syncUrl={false}
            options={DEFAULT_PRO_TABLE_OPTIONS}
            pagination={{ pageSize: 10 }}
            toolBarRender={() => [
              <Button
                key="add"
                type="primary"
                className="btn-gradient-primary"
                icon={<PlusOutlined />}
                onClick={openCapCreate}
              >
                新建产能
              </Button>,
            ]}
            columns={[
              {
                title: '工位',
                dataIndex: 'workstationId',
                ellipsis: true,
                render: (_, r) => stationMap[r.workstationId] ?? r.workstationId,
              },
              { title: '生效日', dataIndex: 'effectiveFrom', width: 120 },
              { title: '日负荷(h)', dataIndex: 'dailyLoadHours', width: 100 },
              { title: '上午(h)', dataIndex: 'amHours', width: 90, render: (v) => v ?? '-' },
              { title: '下午(h)', dataIndex: 'pmHours', width: 90, render: (v) => v ?? '-' },
              {
                title: '管道系数',
                dataIndex: 'pipelineCapacityFactor',
                width: 100,
                render: (v) => v ?? <Text type="secondary">沿用全局</Text>,
              },
              {
                ...TABLE_ACTION_COLUMN_BASE,
                width: 1 * 24 + 12 * 2,
                render: (_, record) => (
                  <TableActions>
                    <TableActionButton
                      title="编辑"
                      icon={<EditOutlined />}
                      onClick={() => openCapEdit(record)}
                    />
                  </TableActions>
                ),
              },
            ]}
            request={async () => parseApiListResponse(await listWorkstationCapacity())}
          />
        </Card>
      </Space>

      <Modal
        title={capEditing ? '编辑工位产能' : '新建工位产能'}
        open={capModalOpen}
        onCancel={() => setCapModalOpen(false)}
        onOk={() => void submitCapacity()}
        confirmLoading={capSubmitting}
        destroyOnHidden
        width={520}
      >
        <Form form={capForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="workstationId"
            label="工位"
            rules={[{ required: true, message: '请选择工位' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={stationOptions}
              disabled={!!capEditing}
              placeholder="选择工位"
            />
          </Form.Item>
          <Form.Item
            name="effectiveFrom"
            label="生效日"
            rules={[{ required: true, message: '请填写生效日 YYYY-MM-DD' }]}
            extra="格式 YYYY-MM-DD"
          >
            <Input placeholder="2026-07-23" />
          </Form.Item>
          <Form.Item
            name="dailyLoadHours"
            label="日负荷（小时）"
            rules={[{ required: true, message: '请填写日负荷' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amHours" label="上午工时">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pmHours" label="下午工时">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="pipelineCapacityFactor"
            label="管道容量系数"
            extra="留空则沿用全局系数"
          >
            <InputNumber min={1} max={10} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
