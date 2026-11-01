/**
 * 呼叫流水，只读。
 */
import { PageContainer } from '@ant-design/pro-components';
import { Select, Table } from 'antd';
import { useEffect, useState } from 'react';
import { crudList } from '@/services/crud';
import { message } from '@/utils/antdAppApis';

const STATUS: Record<string, string> = {
  sent: '已发出',
  accepted: '已接受',
  completed: '处理完成',
  cancelled: '已取消',
};

interface LogRow {
  id: string;
  callType?: string;
  callContent?: string;
  callerName?: string;
  callTime?: string;
  status?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  completedAt?: string;
}

export default function CallLogsPage() {
  const [status, setStatus] = useState<string>();
  const [items, setItems] = useState<LogRow[]>([]);

  useEffect(() => {
    crudList<LogRow>('service', 'NotificationLog', { pageSize: 100, ...(status ? { status } : {}) })
      .then((res) => setItems(res.data.items ?? []))
      .catch((e: Error) => message.error(e.message));
  }, [status]);

  return (
    <PageContainer extra={<Select allowClear placeholder="状态" style={{ width: 160 }} value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} />}>
      <Table
        rowKey="id"
        dataSource={items}
        pagination={false}
        columns={[
          { title: '时间', dataIndex: 'callTime' },
          { title: '类型', dataIndex: 'callType' },
          { title: '内容', dataIndex: 'callContent' },
          { title: '呼叫人', dataIndex: 'callerName' },
          { title: '状态', dataIndex: 'status', render: (v: string) => STATUS[v] ?? v ?? '已发出' },
          { title: '接受人', dataIndex: 'acceptedBy' },
          { title: '接受时间', dataIndex: 'acceptedAt' },
          { title: '完成时间', dataIndex: 'completedAt' },
        ]}
      />
    </PageContainer>
  );
}
