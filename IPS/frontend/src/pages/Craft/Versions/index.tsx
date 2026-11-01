/**
 * 版本与发布总览
 */
import { PageContainer } from '@ant-design/pro-components';
import { Button, Modal, Space, Table, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';
import { VERSION_STATUS_OPTIONS } from '@/constants/enums';
import {
  getBomScheme,
  getBopSchemeBundle,
  getProcessOperationBundle,
  listBomSchemes,
  listBopSchemesCrud,
  listProcessOperations,
} from '@/services/craft';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { Select } from 'antd';

function useVersionList(
  loader: (status?: string) => Promise<any>,
) {
  const [status, setStatus] = useState<string | undefined>();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try {
      const res = await loader(status);
      setData(parseApiListResponse(res).data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return { status, setStatus, data, loading, reload };
}

export default function CraftVersionsPage() {
  const bom = useVersionList((versionStatus) =>
    listBomSchemes({ versionStatus, pageSize: 100 }),
  );
  const ops = useVersionList((versionStatus) =>
    listProcessOperations({ versionStatus, pageSize: 100 }),
  );
  const bop = useVersionList((versionStatus) =>
    listBopSchemesCrud({ versionStatus, pageSize: 100 }),
  );

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffText, setDiffText] = useState('');

  const statusFilter = (ctl: ReturnType<typeof useVersionList>) => (
    <Select
      allowClear
      placeholder="状态"
      style={{ width: 140 }}
      options={VERSION_STATUS_OPTIONS}
      value={ctl.status}
      onChange={(v) => ctl.setStatus(v)}
    />
  );

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Tabs
        items={[
          {
            key: 'bom',
            label: 'BOM 方案',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>{statusFilter(bom)}</div>
                <Table
                  rowKey="id"
                  loading={bom.loading}
                  dataSource={bom.data}
                  columns={[
                    { title: '装备型号', dataIndex: 'productModel' },
                    { title: '版本', dataIndex: 'version', width: 80 },
                    {
                      title: '状态',
                      dataIndex: 'versionStatus',
                      width: 110,
                      render: (v) => <VersionStatusTag status={v} />,
                    },
                    {
                      title: '操作',
                      width: 160,
                      render: (_, r) => (
                        <Space>
                          <Link to={`/craft/bom/${r.id}/edit`}>打开</Link>
                          <Button
                            type="link"
                            size="small"
                            onClick={async () => {
                              const res = await getBomScheme(r.id);
                              if (!isApiSuccess(res)) return;
                              const d = getApiData<{ scheme: any; nodes: any[] }>(res);
                              setDiffText(
                                JSON.stringify(
                                  {
                                    productModel: d?.scheme?.productModel,
                                    version: d?.scheme?.version,
                                    versionStatus: d?.scheme?.versionStatus,
                                    nodeCount: d?.nodes?.length ?? 0,
                                  },
                                  null,
                                  2,
                                ),
                              );
                              setDiffOpen(true);
                            }}
                          >
                            摘要
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'ops',
            label: '标准工序',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>{statusFilter(ops)}</div>
                <Table
                  rowKey="id"
                  loading={ops.loading}
                  dataSource={ops.data}
                  columns={[
                    { title: '编码', dataIndex: 'operationNo' },
                    { title: '版本', dataIndex: 'version', width: 80 },
                    {
                      title: '状态',
                      dataIndex: 'versionStatus',
                      width: 110,
                      render: (v) => <VersionStatusTag status={v} />,
                    },
                    {
                      title: '操作',
                      width: 160,
                      render: (_, r) => (
                        <Space>
                          <Link to={`/craft/operations/${r.id}`}>打开</Link>
                          <Button
                            type="link"
                            size="small"
                            onClick={async () => {
                              const res = await getProcessOperationBundle(r.id);
                              if (!isApiSuccess(res)) return;
                              const d = getApiData<{
                                operation: any;
                                steps: any[];
                              }>(res);
                              setDiffText(
                                JSON.stringify(
                                  {
                                    operationNo: d?.operation?.operationNo,
                                    version: d?.operation?.version,
                                    versionStatus: d?.operation?.versionStatus,
                                    standardHours: d?.operation?.standardHours,
                                    stepCount: d?.steps?.length ?? 0,
                                  },
                                  null,
                                  2,
                                ),
                              );
                              setDiffOpen(true);
                            }}
                          >
                            摘要
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'bop',
            label: '维修方案 BOP',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>{statusFilter(bop)}</div>
                <Table
                  rowKey="id"
                  loading={bop.loading}
                  dataSource={bop.data}
                  columns={[
                    { title: '装备', dataIndex: 'productModel' },
                    { title: '修理方式', dataIndex: 'repairMethod', width: 100 },
                    { title: '版本', dataIndex: 'version', width: 80 },
                    {
                      title: '状态',
                      dataIndex: 'versionStatus',
                      width: 110,
                      render: (v) => <VersionStatusTag status={v} />,
                    },
                    {
                      title: '操作',
                      width: 160,
                      render: (_, r) => (
                        <Space>
                          <Link to={`/craft/bop/${r.id}/edit`}>打开</Link>
                          <Button
                            type="link"
                            size="small"
                            onClick={async () => {
                              const res = await getBopSchemeBundle(r.id);
                              if (!isApiSuccess(res)) return;
                              const d = getApiData<{
                                scheme: any;
                                nodes: any[];
                                edges: any[];
                              }>(res);
                              setDiffText(
                                JSON.stringify(
                                  {
                                    productModel: d?.scheme?.productModel,
                                    repairMethod: d?.scheme?.repairMethod,
                                    version: d?.scheme?.version,
                                    versionStatus: d?.scheme?.versionStatus,
                                    bomSchemeId: d?.scheme?.bomSchemeId,
                                    nodeCount: d?.nodes?.length ?? 0,
                                    edgeCount: d?.edges?.length ?? 0,
                                  },
                                  null,
                                  2,
                                ),
                              );
                              setDiffOpen(true);
                            }}
                          >
                            摘要
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title="版本摘要"
        open={diffOpen}
        onCancel={() => setDiffOpen(false)}
        footer={null}
        width={560}
      >
        <pre style={{ maxHeight: 400, overflow: 'auto' }}>{diffText}</pre>
      </Modal>
    </PageContainer>
  );
}
