/**
 * 非例行工卡列表（模式一）
 *
 * 筛选非例行/紧急插单；工具栏跳转创建向导；Recall。
 */
import { EyeOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Button } from 'antd';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import {
  TABLE_ACTION_COLUMN_BASE,
  TableActions,
  TableActionButton,
} from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { listWorkCards, recallWorkCard } from '@/services/workcards';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { nonRoutineColumns } from '../schema';

const NR_PRIORITIES = new Set(['NON_ROUTINE', 'URGENT']);

export default function NonRoutineList() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('dispatch.nonRoutine');

  const doRecall = (id: string) => {
    modal.confirm({
      title: '确认 Recall？',
      content: '召回后状态保持「待接受」，可用于调整管道位置。',
      onOk: async () => {
        const res = await recallWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, 'Recall 失败'));
          return;
        }
        message.success('已召回');
        actionRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="非例行工卡"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['status', 'priority', 'workstationId']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...nonRoutineColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 2 * 24 + 12 * 2,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="详情"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/dispatch/workcards/${record.id}`)}
                />
                {record.status === 'PENDING_ACCEPT' && (
                  <TableActionButton
                    title="Recall"
                    icon={<RollbackOutlined />}
                    onClick={() => doRecall(record.id)}
                  />
                )}
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          // 未指定优先级时需本地筛非例行：一次拉满再切片，避免服务端分页与本地过滤错位
          const clientFilter = !params.priority;
          const res = await listWorkCards({
            status: params.status,
            priority: params.priority,
            workstationId: params.workstationId,
            page: clientFilter ? 1 : params.current,
            pageSize: clientFilter ? 100 : params.pageSize,
          });
          const parsed = parseApiListResponse<Record<string, any>>(res);
          if (!clientFilter) return parsed;

          const items = parsed.items.filter(
            (i) => NR_PRIORITIES.has(i.priority) || i.isRoutine === false,
          );
          const pageSize = params.pageSize ?? 20;
          const current = params.current ?? 1;
          const start = (current - 1) * pageSize;
          return {
            ...parsed,
            data: items.slice(start, start + pageSize),
            items: items.slice(start, start + pageSize),
            total: items.length,
          };
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/dispatch/non-routine/create')}
          >
            创建非例行工卡
          </Button>,
        ]}
      />
    </PageContainer>
  );
}
