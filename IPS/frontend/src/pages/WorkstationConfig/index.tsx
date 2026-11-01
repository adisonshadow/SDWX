/**
 * 工位配置 — 增删改 / 启用禁用
 *
 * CRUD：/api/ips/crud/master/Workstation
 */
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { WORK_AREA_TYPE_OPTIONS } from '@/constants/enums';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  createWorkstation,
  deleteWorkstation,
  listWorkstationsCrud,
  updateWorkstation,
} from '@/services/workstation';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { workstationColumns } from './schema';

export default function WorkstationConfigPage() {
  const [searchParams] = useSearchParams();
  const areaTypeFromUrl = searchParams.get('areaType') || undefined;

  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('master.workstations');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    // URL 带入 areaType 时写入搜索表单
    if (areaTypeFromUrl) {
      actionRef.current?.reload();
    }
  }, [areaTypeFromUrl]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      areaType: areaTypeFromUrl || 'DISASSEMBLY',
      dailyLoadHours: 8,
      pipelineCapacityFactor: 2,
      enabled: true,
    });
    setModalOpen(true);
  };

  const openEdit = (record: Record<string, any>) => {
    setEditing(record);
    form.setFieldsValue({
      stationNo: record.stationNo,
      name: record.name,
      areaType: record.areaType,
      dailyLoadHours:
        record.dailyLoadHours != null ? Number(record.dailyLoadHours) : undefined,
      pipelineCapacityFactor:
        record.pipelineCapacityFactor != null
          ? Number(record.pipelineCapacityFactor)
          : undefined,
      enabled: record.enabled !== false,
      remark: record.remark,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const body = {
        stationNo: values.stationNo,
        name: values.name,
        areaType: values.areaType,
        dailyLoadHours: values.dailyLoadHours,
        pipelineCapacityFactor: values.pipelineCapacityFactor,
        enabled: values.enabled !== false,
        remark: values.remark ?? null,
      };
      const res = editing?.id
        ? await updateWorkstation(editing.id, body)
        : await createWorkstation(body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, editing ? '更新失败' : '创建失败'));
        return;
      }
      message.success(editing ? '工位已更新' : '工位已创建');
      setModalOpen(false);
      actionRef.current?.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = (record: Record<string, any>) => {
    const next = record.enabled === false;
    modal.confirm({
      title: next ? '确认启用该工位？' : '确认禁用该工位？',
      content: next
        ? '启用后可出现在管道与排产选择列表中。'
        : '禁用后默认不参与排产选择（历史数据保留）。',
      onOk: async () => {
        if (!record.id) return;
        const res = await updateWorkstation(record.id, { enabled: next });
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '操作失败'));
          return;
        }
        message.success(next ? '已启用' : '已禁用');
        actionRef.current?.reload();
      },
    });
  };

  const doDelete = (record: Record<string, any>) => {
    modal.confirm({
      title: '确认删除该工位？',
      content: `将删除 ${record.stationNo}（${record.name ?? ''}）。若已被工卡引用可能导致引用失效。`,
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!record.id) return;
        const res = await deleteWorkstation(record.id);
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
        headerTitle="工位配置"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['stationNo', 'name', 'areaType', 'enabled']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        form={{
          initialValues: areaTypeFromUrl ? { areaType: areaTypeFromUrl } : undefined,
        }}
        columns={[
          ...workstationColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            // 编辑 + 启停 + 删除
            width: 3 * 24 + 12 * 2,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(record)}
                />
                <TableActionButton
                  title={record.enabled === false ? '启用' : '禁用'}
                  icon={
                    record.enabled === false ? (
                      <CheckCircleOutlined />
                    ) : (
                      <StopOutlined />
                    )
                  }
                  onClick={() => toggleEnabled(record)}
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
          const enabledParam =
            params.enabled === 'true'
              ? true
              : params.enabled === 'false'
                ? false
                : undefined;
          const res = await listWorkstationsCrud({
            stationNo: params.stationNo,
            name: params.name,
            areaType: params.areaType,
            enabled: enabledParam,
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
            新建工位
          </Button>,
        ]}
      />

      <Modal
        title={editing ? '编辑工位' : '新建工位'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        confirmLoading={submitting}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="stationNo"
            label="工位编号"
            rules={[{ required: true, message: '请填写工位编号' }]}
          >
            <Input placeholder="如 WS-DIS-01" disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请填写名称' }]}
          >
            <Input placeholder="如 分解工位 01" />
          </Form.Item>
          <Form.Item
            name="areaType"
            label="区站分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select options={WORK_AREA_TYPE_OPTIONS} placeholder="选择区站类型" />
          </Form.Item>
          <Form.Item name="dailyLoadHours" label="日负荷（小时）">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pipelineCapacityFactor" label="管道容量系数">
            <InputNumber min={1} max={10} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
