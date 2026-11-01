/**
 * 齐套管理
 *
 * - 齐套工卡：需齐套工卡列表 + 校验 / 挂起 / 恢复
 * - 缺项追踪：未满足齐套需求
 * - 委外看板：在途委外 + 标记返回 / 重新接受
 */
import {
  CheckCircleOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Drawer, Progress, Table, Tag, Tabs } from 'antd';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import {
  KIT_DIMENSION_OPTIONS,
  OUTSOURCING_STATUS_OPTIONS,
  OUTSOURCING_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { usePatchSearchParams } from '@/hooks/useUrlQueryState';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  checkKit,
  getKitRequirements,
  listKitRequirements,
  listOutsourcing,
  updateOutsourcing,
} from '@/services/kit';
import {
  acceptWorkCard,
  listWorkCards,
  resumeWorkCard,
  suspendWorkCard,
} from '@/services/workcards';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { kitCardColumns } from './schema';

type KitExtra = {
  _kitTotal?: number;
  _kitSatisfied?: number;
  _kitMissing?: number;
  _kitPercent?: number;
};

export default function KitPage() {
  const navigate = useNavigate();
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const tab = searchParams.get('tab') || 'cards';

  const cardsRef = useRef<ActionType | undefined>(undefined);
  const missingRef = useRef<ActionType | undefined>(undefined);
  const outRef = useRef<ActionType | undefined>(undefined);
  const cardsSearch = useProTableSearchCollapse('dispatch.kit.cards');
  const missingSearch = useProTableSearchCollapse('dispatch.kit.missing');
  const outSearch = useProTableSearchCollapse('dispatch.kit.outsourcing');

  const [kitCache, setKitCache] = useState<Record<string, KitExtra>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerCard, setDrawerCard] = useState<Record<string, any> | null>(null);
  const [drawerReqs, setDrawerReqs] = useState<Record<string, any>[]>([]);
  const [drawerKit, setDrawerKit] = useState<KitExtra | null>(null);

  const mergeKit = (id: string, kit: KitExtra) => {
    setKitCache((prev) => ({ ...prev, [id]: kit }));
  };

  const runCheck = async (id: string, silent = false) => {
    const res = await checkKit(id);
    if (!isApiSuccess(res)) {
      if (!silent) message.error(getApiErrorMessage(res, '齐套校验失败'));
      return null;
    }
    const data = getApiData<{
      satisfied: boolean;
      total: number;
      satisfiedCount: number;
      missing: number;
    }>(res);
    if (!data) return null;
    const extra: KitExtra = {
      _kitTotal: data.total,
      _kitSatisfied: data.satisfiedCount,
      _kitMissing: data.missing,
      _kitPercent: data.total > 0 ? Math.round((data.satisfiedCount / data.total) * 100) : 100,
    };
    mergeKit(id, extra);
    if (!silent) {
      message.success(
        data.satisfied ? '齐套已满足' : `齐套未满足，缺 ${data.missing} 项`,
      );
      cardsRef.current?.reload();
    }
    return extra;
  };

  const openDetail = async (record: Record<string, any>) => {
    if (!record.id) return;
    setDrawerCard(record);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const [reqRes, kit] = await Promise.all([
        getKitRequirements(record.id),
        runCheck(record.id, true),
      ]);
      setDrawerReqs(parseApiListResponse<Record<string, any>>(reqRes).items);
      setDrawerKit(kit);
    } finally {
      setDrawerLoading(false);
    }
  };

  const doSuspend = (id: string) => {
    modal.confirm({
      title: '确认齐套挂起？',
      content: '挂起后释放管道占用，待齐套满足后可恢复。',
      onOk: async () => {
        const res = await suspendWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '挂起失败'));
          return;
        }
        message.success('已挂起');
        cardsRef.current?.reload();
      },
    });
  };

  const doResume = (id: string) => {
    modal.confirm({
      title: '确认恢复？',
      content: '将先校验齐套；未满足时无法恢复。',
      onOk: async () => {
        const res = await resumeWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '恢复失败'));
          return;
        }
        message.success('已恢复为待修理');
        cardsRef.current?.reload();
      },
    });
  };

  const markReturned = (id: string, workCardId?: string) => {
    modal.confirm({
      title: '确认委外件已返回？',
      onOk: async () => {
        const res = await updateOutsourcing(id, {
          status: 'RETURNED',
          returnedAt: new Date().toISOString(),
        });
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '更新失败'));
          return;
        }
        message.success('已标记返回');
        if (workCardId) await runCheck(workCardId, true);
        outRef.current?.reload();
      },
    });
  };

  const reAccept = (workCardId: string) => {
    modal.confirm({
      title: '重新接受工卡？',
      content: '委外返回后重新接受，并刷新齐套状态。',
      onOk: async () => {
        const kitRes = await checkKit(workCardId);
        if (!isApiSuccess(kitRes)) {
          message.error(getApiErrorMessage(kitRes, '齐套校验失败'));
          return;
        }
        const kit = getApiData<{ satisfied: boolean; missing: number }>(kitRes);
        if (kit && !kit.satisfied) {
          message.warning(`齐套仍缺 ${kit.missing} 项，暂不可接受`);
          return;
        }
        const res = await acceptWorkCard(workCardId);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '接受失败'));
          return;
        }
        message.success('已重新接受');
        outRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Tabs
        activeKey={tab}
        onChange={(key) => patchSearchParams({ tab: key === 'cards' ? null : key })}
        items={[
          {
            key: 'cards',
            label: '齐套工卡',
            children: (
              <UrlSyncedProTable<Record<string, any>>
                actionRef={cardsRef}
                rowKey="id"
                headerTitle="需齐套工卡"
                scroll={{ x: 'max-content' }}
                search={cardsSearch}
                urlFilterKeys={['status', 'workstationId']}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                columns={[
                  ...kitCardColumns,
                  {
                    ...TABLE_ACTION_COLUMN_BASE,
                    width: 4 * 24 + 12 * 2,
                    render: (_, record) => (
                      <TableActions>
                        <TableActionButton
                          title="缺项明细"
                          icon={<EyeOutlined />}
                          onClick={() => openDetail(record)}
                        />
                        <TableActionButton
                          title="齐套校验"
                          icon={<CheckCircleOutlined />}
                          onClick={() => runCheck(record.id)}
                        />
                        {record.status !== 'KIT_SUSPENDED' &&
                          record.status !== 'REPAIR_DONE' &&
                          record.status !== 'CANCELLED' && (
                            <TableActionButton
                              title="齐套挂起"
                              icon={<PauseCircleOutlined />}
                              onClick={() => doSuspend(record.id)}
                            />
                          )}
                        {record.status === 'KIT_SUSPENDED' && (
                          <TableActionButton
                            title="恢复"
                            icon={<UndoOutlined />}
                            onClick={() => doResume(record.id)}
                          />
                        )}
                      </TableActions>
                    ),
                  },
                ]}
                request={async (params) => {
                  const res = await listWorkCards({
                    status: params.status,
                    workstationId: params.workstationId,
                    kitRequired: true,
                    page: params.current,
                    pageSize: params.pageSize,
                  });
                  const parsed = parseApiListResponse<Record<string, any>>(res);
                  const items = parsed.items.map((i) => ({
                    ...i,
                    ...(i.id ? kitCache[i.id] : {}),
                  }));
                  return { ...parsed, data: items, items };
                }}
              />
            ),
          },
          {
            key: 'missing',
            label: '缺项追踪',
            children: (
              <UrlSyncedProTable<Record<string, any>>
                actionRef={missingRef}
                rowKey="id"
                headerTitle="未满足齐套需求"
                scroll={{ x: 'max-content' }}
                search={missingSearch}
                urlFilterKeys={['dimension', 'workCardId']}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                columns={[
                  {
                    title: '工卡',
                    dataIndex: 'workCardId',
                    width: 180,
                    ellipsis: true,
                    render: (_, r) =>
                      r.workCardId ? (
                        <Link to={`/dispatch/workcards/${r.workCardId}`}>{r.workCardId}</Link>
                      ) : (
                        '-'
                      ),
                  },
                  {
                    title: '维度',
                    dataIndex: 'dimension',
                    width: 110,
                    valueType: 'select',
                    fieldProps: { options: KIT_DIMENSION_OPTIONS, allowClear: true },
                    render: (_, r) =>
                      KIT_DIMENSION_OPTIONS.find((o) => o.value === r.dimension)?.label ??
                      r.dimension,
                  },
                  { title: '物料', dataIndex: 'materialId', ellipsis: true, hideInSearch: true },
                  {
                    title: '委外',
                    dataIndex: 'outsourcingId',
                    ellipsis: true,
                    hideInSearch: true,
                    render: (v) => v || '-',
                  },
                  {
                    title: '状态',
                    dataIndex: 'satisfied',
                    width: 90,
                    hideInSearch: true,
                    render: () => <Tag color="red">未满足</Tag>,
                  },
                  {
                    ...TABLE_ACTION_COLUMN_BASE,
                    width: 1 * 24 + 12 * 2,
                    render: (_, record) => (
                      <TableActions>
                        <TableActionButton
                          title="打开工卡"
                          icon={<EyeOutlined />}
                          onClick={() => navigate(`/dispatch/workcards/${record.workCardId}`)}
                        />
                      </TableActions>
                    ),
                  },
                ]}
                request={async (params) => {
                  const res = await listKitRequirements({
                    workCardId: params.workCardId,
                    dimension: params.dimension,
                    satisfied: false,
                    page: params.current,
                    pageSize: params.pageSize,
                  });
                  return parseApiListResponse(res);
                }}
              />
            ),
          },
          {
            key: 'outsourcing',
            label: '委外看板',
            children: (
              <UrlSyncedProTable<Record<string, any>>
                actionRef={outRef}
                rowKey="id"
                headerTitle="委外件齐套"
                scroll={{ x: 'max-content' }}
                search={outSearch}
                urlFilterKeys={['status', 'workCardId']}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                columns={[
                  {
                    title: '工卡',
                    dataIndex: 'workCardId',
                    width: 180,
                    ellipsis: true,
                    render: (_, r) =>
                      r.workCardId ? (
                        <Link to={`/dispatch/workcards/${r.workCardId}`}>{r.workCardId}</Link>
                      ) : (
                        '-'
                      ),
                  },
                  { title: '物料', dataIndex: 'materialId', ellipsis: true, hideInSearch: true },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 110,
                    valueType: 'select',
                    fieldProps: { options: OUTSOURCING_STATUS_OPTIONS, allowClear: true },
                    valueEnum: OUTSOURCING_STATUS_VALUE_ENUM as any,
                    render: (_, r) => {
                      const e = OUTSOURCING_STATUS_VALUE_ENUM[r.status];
                      return e ? (
                        <Tag
                          color={
                            e.status === 'Success'
                              ? 'green'
                              : e.status === 'Warning'
                                ? 'gold'
                                : e.status === 'Processing'
                                  ? 'blue'
                                  : 'default'
                          }
                        >
                          {e.text}
                        </Tag>
                      ) : (
                        r.status
                      );
                    },
                  },
                  {
                    title: '发出时间',
                    dataIndex: 'issuedAt',
                    width: 160,
                    hideInSearch: true,
                    render: (_, r) =>
                      r.issuedAt ? new Date(r.issuedAt).toLocaleString() : '-',
                  },
                  {
                    title: '返回时间',
                    dataIndex: 'returnedAt',
                    width: 160,
                    hideInSearch: true,
                    render: (_, r) =>
                      r.returnedAt ? new Date(r.returnedAt).toLocaleString() : '-',
                  },
                  {
                    ...TABLE_ACTION_COLUMN_BASE,
                    width: 3 * 24 + 12 * 2,
                    render: (_, record) => (
                      <TableActions>
                        <TableActionButton
                          title="打开工卡"
                          icon={<EyeOutlined />}
                          onClick={() => navigate(`/dispatch/workcards/${record.workCardId}`)}
                        />
                        {(record.status === 'ISSUED' || record.status === 'IN_PROGRESS') && (
                          <TableActionButton
                            title="标记返回"
                            icon={<ReloadOutlined />}
                            onClick={() => markReturned(record.id, record.workCardId)}
                          />
                        )}
                        {record.status === 'RETURNED' && record.workCardId && (
                          <TableActionButton
                            title="重新接受"
                            icon={<CheckCircleOutlined />}
                            onClick={() => reAccept(record.workCardId)}
                          />
                        )}
                      </TableActions>
                    ),
                  },
                ]}
                request={async (params) => {
                  const res = await listOutsourcing({
                    status: params.status,
                    workCardId: params.workCardId,
                    page: params.current,
                    pageSize: params.pageSize,
                  });
                  return parseApiListResponse(res);
                }}
              />
            ),
          },
        ]}
      />

      <Drawer
        title={`齐套明细 · ${drawerCard?.workCardNo ?? ''}`}
        width={520}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
      >
        {drawerKit && (
          <div style={{ marginBottom: 16 }}>
            <Progress
              percent={drawerKit._kitPercent ?? 0}
              status={
                (drawerKit._kitMissing ?? 0) > 0 ? 'exception' : 'success'
              }
              format={() =>
                `${drawerKit._kitSatisfied ?? 0}/${drawerKit._kitTotal ?? 0}`
              }
            />
          </div>
        )}
        <Table
          size="small"
          rowKey="id"
          loading={drawerLoading}
          pagination={false}
          dataSource={drawerReqs}
          columns={[
            {
              title: '维度',
              dataIndex: 'dimension',
              width: 100,
              render: (v: string) =>
                KIT_DIMENSION_OPTIONS.find((o) => o.value === v)?.label ?? v,
            },
            { title: '物料', dataIndex: 'materialId', ellipsis: true },
            {
              title: '满足',
              dataIndex: 'satisfied',
              width: 80,
              render: (v: boolean) => (
                <Tag color={v ? 'green' : 'red'}>{v ? '是' : '否'}</Tag>
              ),
            },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
}
