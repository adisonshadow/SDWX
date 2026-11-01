/**
 * 令号投产向导（FixHeaderPage）
 *
 * 步骤：选工厂令号 → 选产品/修理方式 → 匹配已发布 BOP 方案 → 填计划起止 → 预览说明
 * 提交：POST /api/ips/orders/launch → 成功跳令号详情。
 */
import {
  ProForm,
  ProFormDatePicker,
  ProFormDependency,
  ProFormInstance,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { Alert, Button, Card, Descriptions, Space } from 'antd';
import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FixHeaderPage from '@/components/FixHeaderPage';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { REPAIR_METHOD_OPTIONS } from '@/constants/enums';
import { launchOrder } from '@/services/orders';
import { listBopSchemes, listFactoryOrders, listProducts } from '@/services/master';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';

function toDateStr(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string') return v.slice(0, 10);
  if (dayjs.isDayjs(v)) return v.format('YYYY-MM-DD');
  return dayjs(v as string | number | Date).format('YYYY-MM-DD');
}

export default function OrderLaunchWizard() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<ProFormInstance>(null);

  const submit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const res = await launchOrder({
        factoryOrderId: String(values.factoryOrderId),
        productId: String(values.productId),
        repairMethod: values.repairMethod as
          | 'OVERHAUL'
          | 'CHECK'
          | 'DETECT'
          | 'OIL_SEAL'
          | 'TROUBLESHOOT',
        bopSchemeId: String(values.bopSchemeId),
        workshopOrderNo: values.workshopOrderNo
          ? String(values.workshopOrderNo)
          : undefined,
        planStartDate: toDateStr(values.planStartDate),
        planEndDate: toDateStr(values.planEndDate),
      });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '投产失败'));
        return;
      }
      const data = getApiData<{ workshopOrder?: { id?: string }; workCards?: unknown[] }>(res);
      const cardCount = data?.workCards?.length ?? 0;
      message.success(`投产成功，已生成 ${cardCount} 张工卡`);
      navigate(data?.workshopOrder?.id ? `/plan/orders/${data.workshopOrder.id}` : '/plan/orders');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FixHeaderPage
      title={<PageContainerTitleWithBack title="令号投产" backTo="/plan/orders" />}
      extra={
        <Space>
          <Button onClick={() => navigate('/plan/orders')}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => formRef.current?.submit()}>
            确认投产
          </Button>
        </Space>
      }
    >
      <div style={{ padding: '0 24px 24px', maxWidth: 900 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="投产向导将创建车间令号、生成 BOP 实例并批量生成例行工卡（待生效），同时建立单台计划与 WBS 根节点。"
        />

        <ProForm
          formRef={formRef}
          layout="vertical"
          submitter={false}
          onFinish={submit}
          initialValues={{ repairMethod: 'OVERHAUL' }}
        >
          <Card title="基础信息" style={{ marginBottom: 16 }}>
            <ProFormSelect
              name="factoryOrderId"
              label="工厂令号"
              placeholder="请选择工厂令号"
              rules={[{ required: true, message: '请选择工厂令号' }]}
              request={async () => {
                const res = await listFactoryOrders();
                const { items } = parseApiListResponse<{
                  id?: string;
                  factoryOrderNo: string;
                  name?: string;
                }>(res);
                return items.map((i) => ({
                  label: `${i.factoryOrderNo}（${i.name ?? ''}）`,
                  value: i.id,
                }));
              }}
              fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
            />
            <ProFormSelect
              name="productId"
              label="产品"
              placeholder="请选择产品"
              rules={[{ required: true, message: '请选择产品' }]}
              request={async () => {
                const res = await listProducts();
                const { items } = parseApiListResponse<{
                  id?: string;
                  productNo: string;
                  name?: string;
                  model?: string;
                }>(res);
                return items.map((i) => ({
                  label: `${i.productNo}（${i.name ?? ''}）`,
                  value: i.id,
                  model: i.model,
                }));
              }}
              fieldProps={{
                showSearch: true,
                optionFilterProp: 'label',
                onChange: () => {
                  formRef.current?.setFieldsValue({ bopSchemeId: undefined });
                },
              }}
            />
            <ProFormSelect
              name="repairMethod"
              label="修理方式"
              rules={[{ required: true, message: '请选择修理方式' }]}
              options={REPAIR_METHOD_OPTIONS}
              fieldProps={{
                onChange: () => {
                  formRef.current?.setFieldsValue({ bopSchemeId: undefined });
                },
              }}
            />
          </Card>

          <Card title="BOP 方案与计划" style={{ marginBottom: 16 }}>
            <ProFormDependency name={['repairMethod']}>
              {({ repairMethod }) => (
                <ProFormSelect
                  name="bopSchemeId"
                  label="已发布 BOP 方案"
                  placeholder="按修理方式匹配已发布方案"
                  rules={[{ required: true, message: '请选择 BOP 方案' }]}
                  params={{ repairMethod }}
                  request={async (params) => {
                    const res = await listBopSchemes({
                      versionStatus: 'PUBLISHED',
                      repairMethod: params.repairMethod || undefined,
                    });
                    const { items } = parseApiListResponse<{
                      id?: string;
                      productModel: string;
                      repairMethod: string;
                      name?: string;
                    }>(res);
                    return items.map((i) => ({
                      label: `${i.productModel}/${i.repairMethod}（${i.name ?? ''}）`,
                      value: i.id,
                    }));
                  }}
                  fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
                />
              )}
            </ProFormDependency>
            <ProFormText
              name="workshopOrderNo"
              label="令号编号（可选）"
              placeholder="留空则自动生成"
            />
            <Space size="large" wrap>
              <ProFormDatePicker
                name="planStartDate"
                label="计划开始日期"
                fieldProps={{ format: 'YYYY-MM-DD' }}
              />
              <ProFormDatePicker
                name="planEndDate"
                label="计划结束日期"
                fieldProps={{ format: 'YYYY-MM-DD' }}
              />
            </Space>
          </Card>

          <ProFormDependency
            name={['factoryOrderId', 'productId', 'repairMethod', 'bopSchemeId', 'planStartDate', 'planEndDate']}
          >
            {(vals) => {
              const ready = Boolean(vals.factoryOrderId && vals.productId && vals.repairMethod && vals.bopSchemeId);
              if (!ready) return null;
              const methodLabel =
                REPAIR_METHOD_OPTIONS.find((o) => o.value === vals.repairMethod)?.label ??
                vals.repairMethod;
              return (
                <Card title="投产预览">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="将执行">
                      创建车间令号 → 冻结 BOP 实例 → 按方案工序批量生成例行工卡（状态：待生效）→ 建立单台计划与 WBS 根节点
                    </Descriptions.Item>
                    <Descriptions.Item label="修理方式">{methodLabel}</Descriptions.Item>
                    <Descriptions.Item label="计划窗口">
                      {toDateStr(vals.planStartDate) ?? '未填'} ~ {toDateStr(vals.planEndDate) ?? '未填'}
                    </Descriptions.Item>
                  </Descriptions>
                  <Alert
                    style={{ marginTop: 12 }}
                    type="warning"
                    showIcon
                    message="工卡数量取决于所选 BOP 方案的工序节点数，确认后不可在本页撤销。"
                  />
                </Card>
              );
            }}
          </ProFormDependency>
        </ProForm>
      </div>
    </FixHeaderPage>
  );
}
