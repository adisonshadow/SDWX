/**
 * 维修方案（BOP）列表
 */
import { CopyOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { VersionActions } from '@/components/craft/VersionActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { REPAIR_METHOD_OPTIONS } from '@/constants/enums';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  cloneBopScheme,
  createBopScheme,
  listBomSchemes,
  listBopSchemesCrud,
  obsoleteBopScheme,
  publishBopScheme,
  reviseBopScheme,
} from '@/services/craft';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import { bopSchemeColumns } from '../schema';

export default function BopSchemeListPage() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('craft.bop');
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneId, setCloneId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bomOpts, setBomOpts] = useState<{ label: string; value: string }[]>([]);
  const [bomLabelById, setBomLabelById] = useState<Record<string, string>>({});
  const [form] = Form.useForm();
  const [cloneForm] = Form.useForm();

  useEffect(() => {
    void listBomSchemes({ pageSize: 200 }).then((res) => {
      const list = parseApiListResponse(res);
      const all = (list.data || []) as { id?: string; productModel?: string; version?: number; versionStatus?: string }[];
      const labels: Record<string, string> = {};
      const published: { label: string; value: string }[] = [];
      for (const b of all) {
        if (!b.id) continue;
        const label = `${b.productModel || '-'} v${b.version ?? '?'}`;
        labels[b.id] = label;
        if (b.versionStatus === 'PUBLISHED') {
          published.push({ value: b.id, label });
        }
      }
      setBomLabelById(labels);
      setBomOpts(published);
    });
  }, []);

  const reload = () => actionRef.current?.reload();

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="维修方案（BOP）"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['productModel', 'repairMethod', 'versionStatus']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...bopSchemeColumns.map((col) =>
            col.dataIndex === 'bomSchemeId'
              ? {
                  ...col,
                  render: (_: unknown, r: Record<string, any>) => {
                    const id = r.bomSchemeId as string | undefined;
                    if (!id) return '-';
                    return bomLabelById[id] || id;
                  },
                }
              : col,
          ),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 220,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑结构"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/craft/bop/${record.id}/edit`)}
                />
                <TableActionButton
                  title="克隆"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    setCloneId(record.id);
                    cloneForm.setFieldsValue({
                      productModel: record.productModel,
                      repairMethod: record.repairMethod,
                      bomSchemeId: record.bomSchemeId,
                    });
                    setCloneOpen(true);
                  }}
                />
                <VersionActions
                  compact
                  status={record.versionStatus}
                  onPublish={async () => {
                    const res = await publishBopScheme(record.id);
                    if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
                    else {
                      message.success('已发布');
                      reload();
                    }
                  }}
                  onObsolete={async () => {
                    const res = await obsoleteBopScheme(record.id);
                    if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
                    else {
                      message.success('已作废');
                      reload();
                    }
                  }}
                  onRevise={async () => {
                    const res = await reviseBopScheme(record.id);
                    if (!isApiSuccess(res)) {
                      message.error(getApiErrorMessage(res) || '升版失败');
                      return;
                    }
                    const data = getApiData<{ scheme?: { id?: string } }>(res);
                    message.success('已升版');
                    if (data?.scheme?.id) navigate(`/craft/bop/${data.scheme.id}/edit`);
                  }}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const res = await listBopSchemesCrud({
            productModel: params.productModel,
            repairMethod: params.repairMethod,
            versionStatus: params.versionStatus,
            page: params.current,
            pageSize: params.pageSize,
          });
          return parseApiListResponse(res);
        }}
        toolBarRender={() => [
          <Button
            key="new"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ repairMethod: 'OVERHAUL' });
              setCreateOpen(true);
            }}
          >
            新建方案
          </Button>,
        ]}
      />

      <Modal
        title="新建维修方案"
        open={createOpen}
        confirmLoading={submitting}
        destroyOnHidden
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          setSubmitting(true);
          try {
            const res = await createBopScheme(values);
            if (!isApiSuccess(res)) {
              message.error(getApiErrorMessage(res) || '创建失败');
              return;
            }
            const data = getApiData<{ scheme?: { id?: string } }>(res);
            message.success('已创建');
            setCreateOpen(false);
            if (data?.scheme?.id) navigate(`/craft/bop/${data.scheme.id}/edit`);
            else reload();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="productModel" label="装备型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="repairMethod" label="修理方式" rules={[{ required: true }]}>
            <Select options={REPAIR_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="bomSchemeId" label="关联已发布 BOM">
            <Select allowClear showSearch optionFilterProp="label" options={bomOpts} />
          </Form.Item>
          <Form.Item name="batchSerial" label="批架次">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="克隆 BOP（可跨型号）"
        open={cloneOpen}
        confirmLoading={submitting}
        destroyOnHidden
        onCancel={() => setCloneOpen(false)}
        onOk={async () => {
          if (!cloneId) return;
          const values = await cloneForm.validateFields();
          setSubmitting(true);
          try {
            const res = await cloneBopScheme(cloneId, values);
            if (!isApiSuccess(res)) {
              message.error(getApiErrorMessage(res) || '克隆失败');
              return;
            }
            const data = getApiData<{ scheme?: { id?: string }; warnings?: string[] }>(res);
            if (data?.warnings?.length) {
              message.warning(`克隆完成，物料匹配预警 ${data.warnings.length} 条`);
              console.warn(data.warnings);
            } else message.success('已克隆');
            setCloneOpen(false);
            if (data?.scheme?.id) navigate(`/craft/bop/${data.scheme.id}/edit`);
            else reload();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form form={cloneForm} layout="vertical">
          <Form.Item name="productModel" label="目标装备型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="repairMethod" label="修理方式" rules={[{ required: true }]}>
            <Select options={REPAIR_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="bomSchemeId" label="目标 BOM">
            <Select allowClear showSearch optionFilterProp="label" options={bomOpts} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
