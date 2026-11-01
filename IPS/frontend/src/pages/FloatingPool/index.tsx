/**
 * 游离工卡池 — 待生效工卡列表（模式一）
 *
 * GET /api/ips/workcards/floating；手动生效 → 待接受；批量取消。
 */
import {
  CloseOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Space } from 'antd';
import { useRef, useState, type Key } from 'react';
import { useNavigate } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  cancelWorkCards,
  effectWorkCard,
  listFloatingWorkCards,
} from '@/services/workcards';
import { listWorkstations } from '@/services/workstation';
import { crudList } from '@/services/crud';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { floatingCardColumns } from './schema';

function stationLabel(s: { stationNo: string; name?: string }) {
  return `${s.stationNo}${s.name ? `（${s.name}）` : ''}`;
}

export default function FloatingPool() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('plan.floating');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [acting, setActing] = useState(false);

  const reload = () => {
    setSelectedRowKeys([]);
    actionRef.current?.reload();
  };

  const doEffect = (id: string) => {
    modal.confirm({
      title: '确认手动生效？',
      content: '生效后工卡将进入「待接受」并推送至工位（绕过引擎自动调度）。',
      onOk: async () => {
        const res = await effectWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '生效失败'));
          return;
        }
        message.success('已生效');
        reload();
      },
    });
  };

  const doCancelOne = (id: string) => {
    modal.confirm({
      title: '确认取消该工卡？',
      content: '取消后状态变为「已取消」，不可在本池恢复。',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await cancelWorkCards([id]);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '取消失败'));
          return;
        }
        message.success('已取消');
        reload();
      },
    });
  };

  const doBatchEffect = () => {
    const ids = selectedRowKeys.map(String);
    if (!ids.length) return;
    modal.confirm({
      title: `确认批量生效 ${ids.length} 张工卡？`,
      content: '生效后进入「待接受」并推送工位。',
      onOk: async () => {
        setActing(true);
        try {
          let okCount = 0;
          for (const id of ids) {
            const res = await effectWorkCard(id);
            if (isApiSuccess(res)) okCount += 1;
          }
          message.success(`已生效 ${okCount}/${ids.length} 张`);
          reload();
        } finally {
          setActing(false);
        }
      },
    });
  };

  const doBatchCancel = () => {
    const ids = selectedRowKeys.map(String);
    if (!ids.length) return;
    modal.confirm({
      title: `确认批量取消 ${ids.length} 张工卡？`,
      content: '取消后状态变为「已取消」。',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActing(true);
        try {
          const res = await cancelWorkCards(ids);
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, '批量取消失败'));
            return;
          }
          const data = getApiData<{ cancelled?: number }>(res);
          message.success(`已取消 ${data?.cancelled ?? ids.length} 张`);
          reload();
        } finally {
          setActing(false);
        }
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="游离工卡池（待生效）"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['workstationId', 'priority', 'kitRequired']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          preserveSelectedRowKeys: true,
        }}
        tableAlertRender={({ selectedRowKeys: keys }) => (
          <Space>
            <span>已选 {keys.length} 项</span>
            <Button type="link" size="small" loading={acting} onClick={doBatchEffect}>
              批量生效
            </Button>
            <Button type="link" size="small" danger loading={acting} onClick={doBatchCancel}>
              批量取消
            </Button>
          </Space>
        )}
        columns={[
          ...floatingCardColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            // 详情 + 生效 + 取消
            width: 3 * 24 + 12 * 2,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="详情"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/dispatch/workcards/${record.id}`)}
                />
                <TableActionButton
                  title="手动生效"
                  icon={<PlayCircleOutlined />}
                  onClick={() => doEffect(record.id)}
                />
                <TableActionButton
                  title="取消"
                  icon={<CloseOutlined />}
                  danger
                  onClick={() => doCancelOne(record.id)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const [res, ordersRes, wsRes] = await Promise.all([
            listFloatingWorkCards({
              workstationId: params.workstationId,
              priority: params.priority,
            }),
            crudList('production', 'WorkshopOrder', { pageSize: 500 }),
            listWorkstations(),
          ]);
          const parsed = parseApiListResponse<Record<string, any>>(res);
          const { items: orders } = parseApiListResponse<{
            id?: string;
            workshopOrderNo: string;
          }>(ordersRes);
          const { items: stations } = parseApiListResponse<{
            id?: string;
            stationNo: string;
            name?: string;
          }>(wsRes);
          const orderNoById = new Map(
            orders.filter((o) => o.id).map((o) => [o.id!, o.workshopOrderNo]),
          );
          const stationById = new Map(
            stations.filter((s) => s.id).map((s) => [s.id!, stationLabel(s)]),
          );

          let items = parsed.items.map((row) => ({
            ...row,
            workshopOrderNo: orderNoById.get(row.workshopOrderId) ?? row.workshopOrderNo,
            operationName: row.operationName || row.name || null,
            workstationName: row.workstationId
              ? stationById.get(row.workstationId) ?? null
              : null,
          }));
          // 齐套筛选：后端 floating 未支持该字段，前端过滤
          if (params.kitRequired === 'true') {
            items = items.filter((i) => i.kitRequired === true);
          } else if (params.kitRequired === 'false') {
            items = items.filter((i) => !i.kitRequired);
          }
          return {
            ...parsed,
            data: items,
            items,
            total: items.length,
          };
        }}
        toolBarRender={() => [
          <Button
            key="effect"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlayCircleOutlined />}
            disabled={!selectedRowKeys.length}
            loading={acting}
            onClick={doBatchEffect}
          >
            批量生效
          </Button>,
          <Button
            key="cancel"
            danger
            icon={<StopOutlined />}
            disabled={!selectedRowKeys.length}
            loading={acting}
            onClick={doBatchCancel}
          >
            批量取消
          </Button>,
        ]}
      />
    </PageContainer>
  );
}
