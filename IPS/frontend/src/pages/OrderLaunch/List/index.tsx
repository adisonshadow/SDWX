/**
 * 令号投产 — 车间令号列表（模式一）
 *
 * 列表：/api/ips/crud/production/WorkshopOrder；URL 持久化筛选 + 分页。
 * 工具栏「令号投产」渐变按钮跳转向导。
 */
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
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
import { crudList } from '@/services/crud';
import { parseApiListResponse } from '@/utils/apiResponse';
import { workshopOrderColumns } from '../schema';

export default function OrderLaunchList() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('plan.orders');

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<Record<string, any>>
        actionRef={actionRef}
        rowKey="id"
        headerTitle="车间令号列表"
        scroll={{ x: 'max-content' }}
        search={search}
        urlFilterKeys={['workshopOrderNo', 'repairMethod', 'status']}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        columns={[
          ...workshopOrderColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            // 1 按钮 × 24 + 左右内边距 12×2
            width: 1 * 24 + 12 * 2,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="查看详情"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/plan/orders/${record.id}`)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const res = await crudList('production', 'WorkshopOrder', {
            workshopOrderNo: params.workshopOrderNo,
            repairMethod: params.repairMethod,
            status: params.status,
            page: params.current,
            pageSize: params.pageSize,
          });
          return parseApiListResponse(res);
        }}
        toolBarRender={() => [
          <Button
            key="launch"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/plan/orders/launch')}
          >
            令号投产
          </Button>,
        ]}
      />
    </PageContainer>
  );
}
