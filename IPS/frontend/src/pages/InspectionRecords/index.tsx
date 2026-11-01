/**
 * 检验记录查询列表
 * CRUD：/api/ips/crud/inspection/InspectionRecord
 */
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { INSPECTION_RESULT_OPTIONS } from '@/constants/enums';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  deleteInspectionRecord,
  listInspectionItems,
  listInspectionRecords,
  updateInspectionRecord,
} from '@/services/inspection';
import { listMeasurementEquipment } from '@/services/measurementEquipment';
import { crudList } from '@/services/crud';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { buildInspectionRecordColumns, type NameLookup } from './schema';

function imageUrlsToText(imageUrls: unknown): string {
  if (Array.isArray(imageUrls)) return imageUrls.join('\n');
  if (typeof imageUrls === 'string') return imageUrls;
  if (imageUrls && typeof imageUrls === 'object') {
    return Object.values(imageUrls as Record<string, string>)
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export default function InspectionRecordsPage() {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('dispatch.inspectionRecords');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [equipOpts, setEquipOpts] = useState<{ label: string; value: string }[]>([]);
  const [stepNameById, setStepNameById] = useState<NameLookup>({});
  const [itemNameById, setItemNameById] = useState<NameLookup>({});
  const [equipNameById, setEquipNameById] = useState<NameLookup>({});
  const [form] = Form.useForm();

  useEffect(() => {
    void Promise.all([
      listMeasurementEquipment({ pageSize: 200 }),
      listInspectionItems({ pageSize: 200 }),
      crudList('production', 'StepInstance', { pageSize: 200 }),
    ]).then(([equipRes, itemRes, stepRes]) => {
      const equips = (parseApiListResponse(equipRes).data || []) as Record<string, any>[];
      const items = (parseApiListResponse(itemRes).data || []) as Record<string, any>[];
      const steps = (parseApiListResponse(stepRes).data || []) as Record<string, any>[];

      const equipMap: NameLookup = {};
      const equipOptions: { label: string; value: string }[] = [];
      for (const e of equips) {
        if (!e.id) continue;
        const label =
          `${e.name || ''}${e.serialNo ? ` (${e.serialNo})` : ''}`.trim() || e.id;
        equipMap[e.id] = label;
        if (e.status === 'ACTIVE') equipOptions.push({ value: e.id, label });
      }
      setEquipNameById(equipMap);
      setEquipOpts(equipOptions);

      const itemMap: NameLookup = {};
      for (const it of items) {
        if (!it.id) continue;
        const extra =
          it.inspectionType === 'tolerance' && it.nominalValue != null
            ? ` · ${it.nominalValue}${it.unit || ''}`
            : it.remark
              ? ` · ${it.remark}`
              : '';
        itemMap[it.id] = `${it.name || '检验项'}${extra}`;
      }
      setItemNameById(itemMap);

      const stepMap: NameLookup = {};
      for (const s of steps) {
        if (!s.id) continue;
        const label = [s.name, s.stepNo].filter(Boolean).join(' · ') || s.id;
        stepMap[s.id] = label;
      }
      setStepNameById(stepMap);
    });
  }, []);

  const columns = useMemo(
    () =>
      buildInspectionRecordColumns({
        stepNameById,
        itemNameById,
        equipNameById,
      }),
    [stepNameById, itemNameById, equipNameById],
  );

  const openEdit = (record: Record<string, any>) => {
    setEditing(record);
    form.setFieldsValue({
      measuredValue: record.measuredValue,
      result: record.result,
      defectDescription: record.defectDescription,
      equipmentId: record.equipmentId,
      inspector: record.inspector,
      inspectedAt: record.inspectedAt ? dayjs(record.inspectedAt) : undefined,
      imageUrlsText: imageUrlsToText(record.imageUrls),
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!editing?.id) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const urls = String(values.imageUrlsText || '')
        .split(/[\n,]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      const imageUrls =
        urls.length > 0
          ? Object.fromEntries(urls.map((u, i) => [String(i), u]))
          : null;
      const body = {
        measuredValue: values.measuredValue ?? null,
        result: values.result,
        defectDescription: values.defectDescription ?? null,
        equipmentId: values.equipmentId || null,
        inspector: values.inspector ?? null,
        inspectedAt: values.inspectedAt ? values.inspectedAt.toISOString() : null,
        imageUrls,
      };
      const res = await updateInspectionRecord(editing.id, body);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '更新失败'));
        return;
      }
      message.success('已更新');
      setModalOpen(false);
      actionRef.current?.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = (record: Record<string, any>) => {
    modal.confirm({
      title: '确认删除该检验记录？',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!record.id) return;
        const res = await deleteInspectionRecord(record.id);
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
        headerTitle="检验记录"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['result', 'inspector']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...columns,
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
          const res = await listInspectionRecords({
            result: params.result,
            inspector: params.inspector,
            page: params.current,
            pageSize: params.pageSize,
          });
          return parseApiListResponse<Record<string, any>>(res);
        }}
      />

      <Modal
        title="编辑检验记录"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        confirmLoading={submitting}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="measuredValue" label="测量值">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="result"
            label="检验结果"
            rules={[{ required: true, message: '请选择结果' }]}
          >
            <Select options={INSPECTION_RESULT_OPTIONS} />
          </Form.Item>
          <Form.Item name="defectDescription" label="不合格描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="equipmentId" label="测量设备">
            <Select allowClear showSearch optionFilterProp="label" options={equipOpts} />
          </Form.Item>
          <Form.Item name="inspector" label="检验人">
            <Input />
          </Form.Item>
          <Form.Item name="inspectedAt" label="检验时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="imageUrlsText"
            label="拍照图片 URL"
            extra="每行一个 URL，或逗号分隔"
          >
            <Input.TextArea rows={3} placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
