import { Card, Empty, Tag, Typography } from 'antd';
import { DAG_EDGE_TYPE_VALUE_ENUM } from '@/constants/enums';
import { topoSort } from '@/utils/dagCycleCheck';

export type DagPreviewNode = { id: string; label: string };
export type DagPreviewEdge = { fromId: string; toId: string; edgeType?: string };

const EDGE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  PASS: 'success',
  FAIL: 'error',
  REWORK: 'warning',
};

/** 只读拓扑预览：节点顺序 + 边列表 */
export function DagPreview({
  nodes,
  edges,
  title = '拓扑预览',
}: {
  nodes: DagPreviewNode[];
  edges: DagPreviewEdge[];
  title?: string;
}) {
  if (!nodes.length) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点" />
      </Card>
    );
  }
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const order = topoSort(
    nodes.map((n) => n.id),
    edges.map((e) => ({ fromId: e.fromId, toId: e.toId })),
  );

  return (
    <Card size="small" title={title}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        拓扑序
      </Typography.Paragraph>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {order.map((id, i) => (
          <Tag key={id} color="blue">
            {i + 1}. {labelOf(id)}
          </Tag>
        ))}
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        有向边
      </Typography.Paragraph>
      {edges.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无边（默认可视为孤立/串行未连）" />
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {edges.map((e, i) => {
            const t = e.edgeType || 'NORMAL';
            const meta = DAG_EDGE_TYPE_VALUE_ENUM[t];
            const text =
              typeof meta === 'object' && meta && 'text' in meta ? String(meta.text) : t;
            return (
              <li key={`${e.fromId}-${e.toId}-${i}`} style={{ marginBottom: 4 }}>
                {labelOf(e.fromId)} → {labelOf(e.toId)}{' '}
                <Tag color={EDGE_COLOR[t] ?? 'default'}>{text}</Tag>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
