/**
 * 令号详情 — 总览（令号信息 + 工卡列表 + BOP 实例/单台计划）
 */
import { PageContainer, ProDescriptions } from '@ant-design/pro-components';
import { Alert, Card, Empty, Spin, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOrderOverview } from '@/services/orders';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { REPAIR_METHOD_OPTIONS, WORK_CARD_STATUS_VALUE_ENUM } from '@/constants/enums';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';

interface OrderOverview {
  workshopOrder?: Record<string, any>;
  workCards?: Record<string, any>[];
  singleUnitPlanId?: string | null;
  singleUnitPlanName?: string | null;
  bopInstanceId?: string | null;
  bopInstanceName?: string | null;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OrderOverview>({});

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    getOrderOverview(id)
      .then((res) => {
        if (!active) return;
        if (isApiSuccess(res)) setData(getApiData<OrderOverview>(res) ?? {});
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const order = data.workshopOrder ?? {};

  return (
    <PageContainer
      pageHeaderRender={() => <></>}
      title={<PageContainerTitleWithBack title={`令号详情 · ${order.workshopOrderNo ?? ''}`} backTo="/plan/orders" />}
    >
      <Spin spinning={loading}>
        <Card style={{ marginBottom: 16 }}>
          <ProDescriptions column={3} dataSource={order}>
            <ProDescriptions.Item label="令号编号" dataIndex="workshopOrderNo" />
            <ProDescriptions.Item label="名称" dataIndex="name" />
            <ProDescriptions.Item
              label="修理方式"
              dataIndex="repairMethod"
              render={(v) => REPAIR_METHOD_OPTIONS.find((o) => o.value === v)?.label ?? v}
            />
            <ProDescriptions.Item label="状态" dataIndex="status" render={(v) => <Tag>{v}</Tag>} />
            <ProDescriptions.Item label="计划开始" dataIndex="planStartDate" />
            <ProDescriptions.Item label="计划结束" dataIndex="planEndDate" />
            <ProDescriptions.Item label="BOP 实例">
              {data.bopInstanceName || data.bopInstanceId || '-'}
            </ProDescriptions.Item>
            <ProDescriptions.Item label="单台计划">
              {data.singleUnitPlanName || data.singleUnitPlanId || '-'}
            </ProDescriptions.Item>
          </ProDescriptions>
        </Card>

        <Card title={`工卡列表（${data.workCards?.length ?? 0}）`}>
          <Table
            size="small"
            rowKey="id"
            dataSource={data.workCards ?? []}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: <Empty description="暂无工卡" /> }}
            columns={[
              {
                title: '工卡号',
                dataIndex: 'workCardNo',
                width: 180,
                render: (v: string, r: Record<string, any>) =>
                  r.id ? <Link to={`/dispatch/workcards/${r.id}`}>{v}</Link> : v,
              },
              {
                title: '工序',
                dataIndex: 'name',
                ellipsis: true,
                render: (_: unknown, r: Record<string, any>) =>
                  r.operationName || r.name || r.remark || '-',
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (v: string) => {
                  const e = WORK_CARD_STATUS_VALUE_ENUM[v];
                  return e ? (
                    <Tag
                      color={
                        e.status === 'Success'
                          ? 'green'
                          : e.status === 'Error'
                            ? 'red'
                            : e.status === 'Warning'
                              ? 'gold'
                              : 'blue'
                      }
                    >
                      {e.text}
                    </Tag>
                  ) : (
                    v
                  );
                },
              },
              { title: '优先级', dataIndex: 'priority', width: 100 },
              { title: '计划日期', dataIndex: 'plannedDate', width: 120 },
            ]}
          />
        </Card>

        <Alert style={{ marginTop: 16 }} type="info" showIcon message="工卡生成后默认「待生效」，可在工卡作业页接受并推进。" />
      </Spin>
    </PageContainer>
  );
}
