/**
 * 分拣示意图列表
 */
import { PlusOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSortingGuides, type GuideTemplate } from './api';
import { message } from '@/utils/antdAppApis';

export default function SortingGuideListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GuideTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    listSortingGuides()
      .then((res) => setItems(res.data.items ?? []))
      .catch((e: Error) => message.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <PageContainer
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/line/sorting-guide/new')}>新建</Button>}
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        onRow={(record) => ({ onClick: () => record.id && navigate(`/line/sorting-guide/${record.id}`) })}
        columns={[
          { title: '编码', dataIndex: 'templateCode' },
          { title: '名称', dataIndex: 'templateName' },
          { title: '维修方案', dataIndex: 'schemeName' },
          { title: '物料分类', dataIndex: 'className' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: string) => (
              <Tag color={status === 'published' ? 'green' : 'default'}>{status === 'published' ? '已发布' : '草稿'}</Tag>
            ),
          },
          {
            title: '示意图',
            dataIndex: 'photoObjectId',
            render: (id: string) => (id ? '已上传' : '未上传'),
          },
        ]}
      />
    </PageContainer>
  );
}
