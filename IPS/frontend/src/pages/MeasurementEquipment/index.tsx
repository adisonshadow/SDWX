/**
 * 测量设备 — 增删改
 * CRUD：/api/ips/crud/master/MeasurementEquipment
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { MEASUREMENT_EQUIPMENT_STATUS_OPTIONS } from '@/constants/enums';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  createMeasurementEquipment,
  deleteMeasurementEquipment,
  listMeasurementEquipment,
  updateMeasurementEquipment,
} from '@/services/measurementEquipment';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { measurementEquipmentColumns } from './schema';

export default function MeasurementEquipmentPage() {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('master.measurementEquipment');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', calibrationCycle: 365 });
    setModalOpen(true);
  };

  const openEdit = (record: Record<string, any>) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      model: record.model,
      serialNo: record.serialNo,
      status: record.status || 'ACTIVE',
      calibrationDate: record.calibrationDate ? dayjs(record.calibrationDate) : undefined,
      calibrationCycle:
        record.calibrationCycle != null ? Number(record.calibrationCycle) : undefined,
      remark: record.remark,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const body = {
        name: values.name,
        model: values.model ?? null,
        serialNo: values.serialNo ?? null,
        status: values.status,
        calibrationDate: values.calibrationDate
          ? values.calibrationDate.toISOString()
          : null,
        calibrationCycle: values.calibrationCycle ?? null,
        remark: values.remark ?? null,
      };
      const res = editing?.id
        ? await updateMeasurementEquipment(editing.id, body)
        : await createMeasurementEquipment(body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, editing ? '更新失败' : '创建失败'));
        return;
      }
      message.success(editing ? '设备已更新' : '设备已创建');
      setModalOpen(false);
      actionRef.current?.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = (record: Record<string, any>) => {
    modal.confirm({
      title: '确认删除该测量设备？',
      content: `将删除 ${record.name ?? ''}（${record.serialNo ?? record.bizNo ?? ''}）。`,
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!record.id) return;
        const res = await deleteMeasurementEquipment(record.id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '删除失败'));
          return;
        }
        message.success('已删除');
        actionRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="测量设备"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['bizNo', 'name', 'serialNo', 'status']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...measurementEquipmentColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 2 * 24 + 12,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(record)}
                />
                <TableActionButton
                  title="删除"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => doDelete(record)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const res = await listMeasurementEquipment({
            bizNo: params.bizNo,
            name: params.name,
            serialNo: params.serialNo,
            status: params.status,
            page: params.current,
            pageSize: params.pageSize,
          });
          return parseApiListResponse<Record<string, any>>(res);
        }}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            新建设备
          </Button>,
        ]}
      />

      <Modal
        title={editing ? '编辑测量设备' : '新建测量设备'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        confirmLoading={submitting}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label="设备名称"
            rules={[{ required: true, message: '请填写名称' }]}
          >
            <Input placeholder="如 外径千分尺" />
          </Form.Item>
          <Form.Item name="model" label="型号/规格">
            <Input placeholder="如 0-25mm" />
          </Form.Item>
          <Form.Item name="serialNo" label="设备编号">
            <Input placeholder="资产/出厂编号" />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select options={MEASUREMENT_EQUIPMENT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="calibrationDate" label="最近校准日期">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="calibrationCycle" label="校准周期（天）">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
