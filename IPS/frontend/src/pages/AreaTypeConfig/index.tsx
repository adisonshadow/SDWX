/**
 * 区站分类配置
 *
 * 分类取自系统预置 WorkAreaType；展示各分类下工位数，可跳转工位配置筛选。
 */
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TitleWithHelp from '@/components/TitleWithHelp';
import { WORK_AREA_TYPE_OPTIONS } from '@/constants/enums';
import { listWorkstationsCrud } from '@/services/workstation';
import { parseApiListResponse } from '@/utils/apiResponse';

const { Text } = Typography;

interface AreaStat {
  value: string;
  label: string;
  total: number;
  enabled: number;
  disabled: number;
}

export default function AreaTypeConfigPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<Record<string, any>[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWorkstationsCrud({ pageSize: 500 });
      setStations(parseApiListResponse<Record<string, any>>(res).items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats: AreaStat[] = useMemo(() => {
    return WORK_AREA_TYPE_OPTIONS.map((opt) => {
      const list = stations.filter((s) => s.areaType === opt.value);
      const enabled = list.filter((s) => s.enabled !== false).length;
      return {
        value: opt.value,
        label: opt.label,
        total: list.length,
        enabled,
        disabled: list.length - enabled,
      };
    });
  }, [stations]);

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="区站分类为系统预置（分解线 / 清洗站 / 故检修理线等），工位归属分类后参与管道与负荷统计。"
        />

        <Card
          title={
            <TitleWithHelp
              title="区站分类"
              help="分类编码来自 WorkAreaType 枚举；在此查看各分类下工位数量，并跳转工位配置。"
            />
          }
          extra={
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新统计
            </Button>
          }
        >
          <Table
            size="middle"
            rowKey="value"
            loading={loading}
            dataSource={stats}
            pagination={false}
            columns={[
              {
                title: '分类名称',
                dataIndex: 'label',
                width: 160,
                render: (v: string) => <Text strong>{v}</Text>,
              },
              {
                title: '分类编码',
                dataIndex: 'value',
                width: 160,
                render: (v: string) => <Tag>{v}</Tag>,
              },
              {
                title: '工位总数',
                dataIndex: 'total',
                width: 100,
                render: (v: number) => (v > 0 ? v : <Text type="secondary">0</Text>),
              },
              {
                title: '启用',
                dataIndex: 'enabled',
                width: 90,
                render: (v: number) => <Tag color="green">{v}</Tag>,
              },
              {
                title: '禁用',
                dataIndex: 'disabled',
                width: 90,
                render: (v: number) =>
                  v > 0 ? <Tag color="default">{v}</Tag> : <Text type="secondary">0</Text>,
              },
              {
                title: '操作',
                key: 'action',
                width: 140,
                render: (_, r) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() =>
                      navigate(`/master/workstations?areaType=${encodeURIComponent(r.value)}`)
                    }
                  >
                    查看工位
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </PageContainer>
  );
}
