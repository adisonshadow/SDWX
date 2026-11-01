/**
 * 工步新建/编辑独立表单；检验点可维护 InspectionItem 子表
 */
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { INSPECTION_TYPE_OPTIONS } from '@/constants/enums';
import {
  createProcessStep,
  getProcessOperationBundle,
  listProcessSteps,
  updateProcessStep,
} from '@/services/craft';
import {
  createInspectionItem,
  deleteInspectionItem,
  listInspectionItems,
  updateInspectionItem,
} from '@/services/inspection';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';

export default function ProcessStepFormPage() {
  const { operationId = '', stepId } = useParams();
  const isNew = !stepId || stepId === 'new';
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operation, setOperation] = useState<Record<string, any> | null>(null);
  const [step, setStep] = useState<Record<string, any> | null>(null);
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, any> | null>(null);
  const [itemSubmitting, setItemSubmitting] = useState(false);

  const isInspectionPoint = Form.useWatch('isInspectionPoint', form);
  const itemType = Form.useWatch('inspectionType', itemForm);
  const readonly = operation?.versionStatus !== 'DRAFT';

  const backTo = `/craft/operations/${operationId}`;

  const loadItems = useCallback(async (processStepId: string) => {
    const res = await listInspectionItems({ processStepId, pageSize: 200 });
    const list = parseApiListResponse<Record<string, any>>(res);
    setItems(
      [...(list.data || [])].sort(
        (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bundleRes = await getProcessOperationBundle(operationId);
      if (!isApiSuccess(bundleRes)) {
        message.error(getApiErrorMessage(bundleRes) || '加载工序失败');
        return;
      }
      const data = getApiData<{ operation: any; steps: any[] }>(bundleRes);
      setOperation(data?.operation ?? null);

      if (isNew) {
        const nextNo = `S${String((data?.steps?.length ?? 0) + 1).padStart(2, '0')}`;
        form.setFieldsValue({
          stepNo: nextNo,
          name: '',
          sortOrder: data?.steps?.length ?? 0,
          standardHours: '',
          isInspectionPoint: false,
          isMandatoryInspection: false,
          inspectionSpec: '',
          remark: '',
        });
        setStep(null);
        setItems([]);
        return;
      }

      let found = (data?.steps ?? []).find((s: any) => s.id === stepId);
      if (!found) {
        const listRes = await listProcessSteps({ operationId, pageSize: 200 });
        const list = parseApiListResponse(listRes).data || [];
        found = list.find((s: any) => s.id === stepId);
      }
      if (!found) {
        message.error('工步不存在');
        navigate(backTo);
        return;
      }
      setStep(found);
      form.setFieldsValue({
        stepNo: found.stepNo,
        name: found.name,
        sortOrder: found.sortOrder ?? 0,
        standardHours: found.standardHours,
        isInspectionPoint: !!found.isInspectionPoint,
        isMandatoryInspection: !!found.isMandatoryInspection,
        inspectionSpec: found.inspectionSpec,
        remark: found.remark,
      });
      await loadItems(found.id);
    } finally {
      setLoading(false);
    }
  }, [operationId, stepId, isNew, form, loadItems, navigate, backTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        operationId,
        stepNo: values.stepNo,
        name: values.name || null,
        sortOrder: values.sortOrder ?? 0,
        standardHours: values.standardHours || null,
        isInspectionPoint: !!values.isInspectionPoint,
        isMandatoryInspection: values.isInspectionPoint
          ? !!values.isMandatoryInspection
          : false,
        inspectionSpec: values.isInspectionPoint ? values.inspectionSpec || null : null,
        remark: values.remark || null,
      };
      if (isNew) {
        const res = await createProcessStep(body);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '创建失败'));
          return;
        }
        const created = getApiData<any>(res);
        const newId = created?.id ?? created?.item?.id;
        message.success('工步已创建');
        if (newId) {
          navigate(`/craft/operations/${operationId}/steps/${newId}`, { replace: true });
        } else {
          navigate(backTo);
        }
        return;
      }
      if (!stepId) return;
      const res = await updateProcessStep(stepId, body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '更新失败'));
        return;
      }
      message.success('已保存');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openItemCreate = () => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      inspectionType: 'manual',
      sortOrder: items.length,
      name: '',
      remark: '',
    });
    setItemModalOpen(true);
  };

  const openItemEdit = (record: Record<string, any>) => {
    setEditingItem(record);
    itemForm.setFieldsValue({
      name: record.name,
      inspectionType: record.inspectionType || 'manual',
      sortOrder: record.sortOrder ?? 0,
      nominalValue: record.nominalValue,
      upperTolerance: record.upperTolerance,
      lowerTolerance: record.lowerTolerance,
      unit: record.unit,
      remark: record.remark,
    });
    setItemModalOpen(true);
  };

  const submitItem = async () => {
    if (!stepId || isNew) {
      message.warning('请先保存工步后再维护检验项');
      return;
    }
    const values = await itemForm.validateFields();
    setItemSubmitting(true);
    try {
      const isTolerance = values.inspectionType === 'tolerance';
      const body: Record<string, unknown> = {
        processStepId: stepId,
        name: values.name,
        inspectionType: values.inspectionType,
        sortOrder: values.sortOrder ?? 0,
      };
      if (values.remark) body.remark = values.remark;
      if (isTolerance) {
        body.nominalValue = values.nominalValue;
        body.upperTolerance = values.upperTolerance;
        body.lowerTolerance = values.lowerTolerance;
        if (values.unit) body.unit = values.unit;
      }
      const res = editingItem?.id
        ? await updateInspectionItem(editingItem.id, body)
        : await createInspectionItem(body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, editingItem ? '更新失败' : '创建失败'));
        return;
      }
      message.success(editingItem ? '检验项已更新' : '检验项已创建');
      setItemModalOpen(false);
      await loadItems(stepId);
    } finally {
      setItemSubmitting(false);
    }
  };

  const removeItem = (record: Record<string, any>) => {
    modal.confirm({
      title: '确认删除该检验项？',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!record.id) return;
        const res = await deleteInspectionItem(record.id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '删除失败'));
          return;
        }
        message.success('已删除');
        if (stepId) await loadItems(stepId);
      },
    });
  };

  return (
    <PageContainer
      loading={loading}
      title={
        <PageContainerTitleWithBack
          title={isNew ? '新建工步' : `编辑工步 · ${step?.stepNo ?? ''}`}
          backTo={backTo}
        />
      }
      subTitle={operation?.operationNo ? `工序 ${operation.operationNo}` : undefined}
      extra={
        <Space>
          <Button onClick={() => navigate(backTo)}>取消</Button>
          {!readonly && (
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Card title="工步属性">
          <Form form={form} layout="vertical" disabled={readonly} style={{ maxWidth: 560 }}>
            <Form.Item
              name="stepNo"
              label="工步号"
              rules={[{ required: true, message: '请填写工步号' }]}
            >
              <Input placeholder="如 S01" />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
              <Input placeholder="工步名称" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序号">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="standardHours" label="标准工时（小时）">
              <Input placeholder="如 0.5" />
            </Form.Item>
            <Form.Item name="isInspectionPoint" label="检验点" valuePropName="checked">
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
            <Form.Item
              name="isMandatoryInspection"
              label="强制检验点"
              valuePropName="checked"
              extra="仅检验点可设为强制；工序完工需全部强制检验点合格"
            >
              <Switch disabled={!isInspectionPoint} checkedChildren="强制" unCheckedChildren="可选" />
            </Form.Item>
            <Form.Item
              name="inspectionSpec"
              label="检验项目/验收标准摘要"
              extra="结构化检验项在下方维护；此处为摘要说明"
            >
              <Input.TextArea
                rows={3}
                disabled={!isInspectionPoint}
                placeholder={isInspectionPoint ? '检验项目与验收标准摘要' : '仅检验点可填'}
              />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Card>

        {isInspectionPoint && (
          <Card
            title="检验项定义"
            extra={
              !readonly && !isNew ? (
                <Button size="small" type="primary" onClick={openItemCreate}>
                  新建检验项
                </Button>
              ) : null
            }
          >
            {isNew ? (
              <p style={{ color: '#666', margin: 0 }}>请先保存工步，再维护检验项。</p>
            ) : (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={items}
                locale={{ emptyText: '暂无检验项' }}
                columns={[
                  { title: '名称', dataIndex: 'name', ellipsis: true },
                  {
                    title: '类型',
                    dataIndex: 'inspectionType',
                    width: 110,
                    render: (v: string) =>
                      INSPECTION_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
                  },
                  { title: '排序', dataIndex: 'sortOrder', width: 70 },
                  {
                    title: '公差',
                    width: 200,
                    render: (_: any, r: Record<string, any>) =>
                      r.inspectionType === 'tolerance'
                        ? `${r.nominalValue ?? '—'} ${r.unit ?? ''} [${r.lowerTolerance ?? '?'}, ${r.upperTolerance ?? '?'}]`
                        : '—',
                  },
                  {
                    title: '备注',
                    dataIndex: 'remark',
                    ellipsis: true,
                    render: (v: string) => v || '—',
                  },
                  {
                    title: '操作',
                    width: readonly ? 60 : 120,
                    render: (_: any, r: Record<string, any>) =>
                      readonly ? (
                        <Tag>只读</Tag>
                      ) : (
                        <Space size={0}>
                          <Button type="link" size="small" onClick={() => openItemEdit(r)}>
                            编辑
                          </Button>
                          <Button type="link" size="small" danger onClick={() => removeItem(r)}>
                            删除
                          </Button>
                        </Space>
                      ),
                  },
                ]}
              />
            )}
          </Card>
        )}
      </Space>

      <Modal
        title={editingItem ? '编辑检验项' : '新建检验项'}
        open={itemModalOpen}
        onCancel={() => setItemModalOpen(false)}
        onOk={() => void submitItem()}
        confirmLoading={itemSubmitting}
        destroyOnHidden
        width={560}
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label="检验项名称"
            rules={[{ required: true, message: '请填写名称' }]}
          >
            <Input placeholder="如 孔径测量" />
          </Form.Item>
          <Form.Item
            name="inspectionType"
            label="检验类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={INSPECTION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序号">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {itemType === 'tolerance' && (
            <>
              <Form.Item
                name="nominalValue"
                label="标称值"
                rules={[{ required: true, message: '请填写标称值' }]}
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="upperTolerance"
                label="上公差"
                rules={[{ required: true, message: '请填写上公差' }]}
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="lowerTolerance"
                label="下公差"
                rules={[{ required: true, message: '请填写下公差' }]}
                extra="通常为负偏差，如 -0.02"
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="unit" label="单位">
                <Input placeholder="如 mm" />
              </Form.Item>
            </>
          )}
          <Form.Item name="remark" label="备注/检验要求">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
