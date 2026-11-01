/**
 * 标准工序库列表
 */
import { CopyOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Select, Switch } from 'antd';
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
import { OPERATION_CATEGORY_OPTIONS } from '@/constants/enums';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { listWorkstationsCrud } from '@/services/workstation';
import {
  cloneProcessOperation,
  createProcessOperation,
  listProcessOperations,
  obsoleteProcessOperation,
  publishProcessOperation,
  reviseProcessOperation,
} from '@/services/craft';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import { processOperationColumns } from '../schema';

export default function ProcessOperationListPage() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('craft.operations');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stations, setStations] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    void listWorkstationsCrud({ pageSize: 200 }).then((res) => {
      const list = parseApiListResponse(res);
      setStations(
        (list.data || []).map((s: any) => ({
          value: s.id,
          label: `${s.stationNo || ''} ${s.name || ''}`.trim(),
        })),
      );
    });
  }, []);

  const reload = () => actionRef.current?.reload();

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="标准工序库"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['operationNo', 'category', 'versionStatus', 'kitRequired']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...processOperationColumns.map((col) =>
            col.dataIndex === 'defaultWorkstationId'
              ? {
                  ...col,
                  render: (_: unknown, r: Record<string, any>) => {
                    const id = r.defaultWorkstationId as string | undefined;
                    if (!id) return '-';
                    return stations.find((s) => s.value === id)?.label || id;
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
                  title="详情"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/craft/operations/${record.id}`)}
                />
                <TableActionButton
                  title="克隆"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const res = await cloneProcessOperation(record.id);
                    if (!isApiSuccess(res)) {
                      message.error(getApiErrorMessage(res) || '克隆失败');
                      return;
                    }
                    const data = getApiData<{ operation?: { id?: string } }>(res);
                    message.success('已克隆');
                    if (data?.operation?.id) navigate(`/craft/operations/${data.operation.id}`);
                    else reload();
                  }}
                />
                <VersionActions
                  compact
                  status={record.versionStatus}
                  loading={submitting}
                  onPublish={async () => {
                    setSubmitting(true);
                    try {
                      const res = await publishProcessOperation(record.id);
                      if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
                      else {
                        message.success('已发布');
                        reload();
                      }
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  onObsolete={async () => {
                    const res = await obsoleteProcessOperation(record.id);
                    if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
                    else {
                      message.success('已作废');
                      reload();
                    }
                  }}
                  onRevise={async () => {
                    setSubmitting(true);
                    try {
                      const res = await reviseProcessOperation(record.id);
                      if (!isApiSuccess(res)) {
                        message.error(getApiErrorMessage(res) || '升版失败');
                        return;
                      }
                      const data = getApiData<{ operation?: { id?: string } }>(res);
                      message.success('已升版');
                      if (data?.operation?.id) navigate(`/craft/operations/${data.operation.id}`);
                      else reload();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const kit =
            params.kitRequired === 'true'
              ? true
              : params.kitRequired === 'false'
                ? false
                : undefined;
          const res = await listProcessOperations({
            operationNo: params.operationNo,
            category: params.category,
            versionStatus: params.versionStatus,
            kitRequired: kit,
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
              form.setFieldsValue({ category: 'ROUTINE', kitRequired: false });
              setCreateOpen(true);
            }}
          >
            新建工序
          </Button>,
        ]}
      />

      <Modal
        title="新建工序"
        open={createOpen}
        confirmLoading={submitting}
        destroyOnHidden
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          setSubmitting(true);
          try {
            const res = await createProcessOperation(values);
            if (!isApiSuccess(res)) {
              message.error(getApiErrorMessage(res) || '创建失败');
              return;
            }
            const data = getApiData<{ operation?: { id?: string } }>(res);
            message.success('已创建');
            setCreateOpen(false);
            if (data?.operation?.id) navigate(`/craft/operations/${data.operation.id}`);
            else reload();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="operationNo" label="工序编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="类别">
            <Select options={OPERATION_CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="standardHours" label="标准工时">
            <Input />
          </Form.Item>
          <Form.Item name="defaultWorkstationId" label="目标工位">
            <Select allowClear showSearch optionFilterProp="label" options={stations} />
          </Form.Item>
          <Form.Item name="kitRequired" label="齐套性" valuePropName="checked">
            <Switch checkedChildren="齐套" unCheckedChildren="非齐套" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
