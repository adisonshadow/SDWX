/**
 * 工卡作业 — 列表（模式一）
 *
 * 列表：/api/ips/workcards；URL 持久化筛选（workstationId/status/priority）+ 分页。
 * 操作列：详情；生效（PENDING_EFFECTIVE）/接受（PENDING_ACCEPT）/挂起+提交（REPAIRING）。
 */
import {
  CheckOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
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
import {
  acceptWorkCard,
  effectWorkCard,
  listWorkCards,
  submitWorkCard,
  suspendWorkCard,
} from '@/services/workcards';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { workCardColumns } from '../schema';

export default function WorkCardsList() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('dispatch.workcards');

  const doEffect = (id: string) => {
    modal.confirm({
      title: '确认生效该工卡？',
      content: '生效后工卡将进入「待接受」状态并推送到工位。',
      onOk: async () => {
        const res = await effectWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '生效失败'));
          return;
        }
        message.success('已生效');
        actionRef.current?.reload();
      },
    });
  };

  const doAccept = (id: string) => {
    modal.confirm({
      title: '确认接受该工卡？',
      content: '接受后工卡将进入「修理中」状态。',
      onOk: async () => {
        const res = await acceptWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '接受失败'));
          return;
        }
        message.success('已接受');
        actionRef.current?.reload();
      },
    });
  };

  const doSuspend = (id: string) => {
    modal.confirm({
      title: '确认齐套挂起该工卡？',
      onOk: async () => {
        const res = await suspendWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '挂起失败'));
          return;
        }
        message.success('已挂起');
        actionRef.current?.reload();
      },
    });
  };

  const doSubmit = (id: string) => {
    modal.confirm({
      title: '确认提交该工卡？',
      content: '提交后工卡将进入「修理结束」状态。',
      onOk: async () => {
        const res = await submitWorkCard(id);
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '提交失败'));
          return;
        }
        message.success('已提交');
        actionRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="工卡作业列表"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['workshopOrderId', 'workstationId', 'status', 'priority']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...workCardColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            // 最多 3 按钮 × 24 + 左右内边距 12×2
            width: 3 * 24 + 12 * 2,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="详情"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/dispatch/workcards/${record.id}`)}
                />
                {record.status === 'PENDING_EFFECTIVE' && (
                  <TableActionButton
                    title="生效"
                    icon={<PlayCircleOutlined />}
                    onClick={() => doEffect(record.id)}
                  />
                )}
                {record.status === 'PENDING_ACCEPT' && (
                  <TableActionButton
                    title="接受"
                    icon={<CheckOutlined />}
                    onClick={() => doAccept(record.id)}
                  />
                )}
                {record.status === 'REPAIRING' && (
                  <>
                    <TableActionButton
                      title="齐套挂起"
                      icon={<PauseCircleOutlined />}
                      onClick={() => doSuspend(record.id)}
                    />
                    <TableActionButton
                      title="提交"
                      icon={<StopOutlined />}
                      onClick={() => doSubmit(record.id)}
                    />
                  </>
                )}
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const res = await listWorkCards({
            workshopOrderId: params.workshopOrderId,
            workstationId: params.workstationId,
            status: params.status,
            priority: params.priority,
            page: params.current,
            pageSize: params.pageSize,
          });
          return parseApiListResponse(res);
        }}
      />
    </PageContainer>
  );
}
