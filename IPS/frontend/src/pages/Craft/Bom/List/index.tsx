/**
 * BOM 方案列表
 */
import {
  CopyOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Table } from 'antd';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { VersionActions } from '@/components/craft/VersionActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  cloneBomScheme,
  createBomScheme,
  listBomSchemes,
  listBopByBomScheme,
  obsoleteBomScheme,
  publishBomScheme,
  reviseBomScheme,
} from '@/services/craft';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import { bomSchemeColumns } from '../schema';

export default function BomSchemeListPage() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('craft.bom');
  const [createOpen, setCreateOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [refs, setRefs] = useState<Record<string, any>[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const reload = () => actionRef.current?.reload();

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const res = await createBomScheme({ productModel: values.productModel });
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res) || '创建失败');
        return;
      }
      const data = getApiData<{ scheme?: { id?: string } }>(res);
      message.success('已创建编制中方案');
      setCreateOpen(false);
      form.resetFields();
      if (data?.scheme?.id) navigate(`/craft/bom/${data.scheme.id}/edit`);
      else reload();
    } catch (e) {
      message.error((e as Error).message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="BOM 方案"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['productModel', 'versionStatus']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...bomSchemeColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 200,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑结构"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/craft/bom/${record.id}/edit`)}
                />
                <TableActionButton
                  title="被引用"
                  icon={<LinkOutlined />}
                  onClick={async () => {
                    const res = await listBopByBomScheme(record.id);
                    const list = parseApiListResponse(res);
                    setRefs((list.data || []) as Record<string, any>[]);
                    setRefsOpen(true);
                  }}
                />
                <TableActionButton
                  title="克隆"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      const res = await cloneBomScheme(record.id);
                      if (!isApiSuccess(res)) {
                        message.error(getApiErrorMessage(res) || '克隆失败');
                        return;
                      }
                      const data = getApiData<{ scheme?: { id?: string } }>(res);
                      message.success('已克隆为编制中');
                      if (data?.scheme?.id) navigate(`/craft/bom/${data.scheme.id}/edit`);
                      else reload();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
                <VersionActions
                  compact
                  status={record.versionStatus}
                  loading={submitting}
                  onPublish={async () => {
                    const res = await publishBomScheme(record.id);
                    if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '发布失败');
                    else {
                      message.success('已发布');
                      reload();
                    }
                  }}
                  onObsolete={async () => {
                    const res = await obsoleteBomScheme(record.id);
                    if (!isApiSuccess(res)) message.error(getApiErrorMessage(res) || '作废失败');
                    else {
                      message.success('已作废');
                      reload();
                    }
                  }}
                  onRevise={async () => {
                    setSubmitting(true);
                    try {
                      const res = await reviseBomScheme(record.id);
                      if (!isApiSuccess(res)) {
                        message.error(getApiErrorMessage(res) || '升版失败');
                        return;
                      }
                      const data = getApiData<{ scheme?: { id?: string } }>(res);
                      message.success('已升版');
                      if (data?.scheme?.id) navigate(`/craft/bom/${data.scheme.id}/edit`);
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
          const res = await listBomSchemes({
            productModel: params.productModel,
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
              setCreateOpen(true);
            }}
          >
            新建 BOM
          </Button>,
        ]}
      />

      <Modal
        title="新建 BOM 方案"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="productModel"
            label="适用装备型号"
            rules={[{ required: true, message: '请输入装备型号' }]}
          >
            <Input placeholder="如 LG-A350-MLG" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="引用本 BOM 的 BOP 方案"
        open={refsOpen}
        onCancel={() => setRefsOpen(false)}
        footer={null}
        width={720}
      >
        <Table
          rowKey="id"
          size="small"
          dataSource={refs}
          pagination={false}
          columns={[
            { title: '装备', dataIndex: 'productModel' },
            { title: '修理方式', dataIndex: 'repairMethod', width: 100 },
            { title: '版本', dataIndex: 'version', width: 80 },
            { title: '状态', dataIndex: 'versionStatus', width: 100 },
          ]}
        />
      </Modal>
    </PageContainer>
  );
}
