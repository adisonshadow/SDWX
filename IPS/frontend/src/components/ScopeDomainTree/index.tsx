import { PartitionOutlined } from '@ant-design/icons';
import { Empty, Spin, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useMemo } from 'react';
import { buildScopePrefixTree, type CodePathTreeNode } from '@/utils/buildCodePathTree';

const { Text } = Typography;

const ALL_NODE_KEY = '__all__';

type ScopeItem = { code?: string };

export interface ScopeDomainTreeNode {
  code: string;
  name: string;
  itemCount?: number;
  children?: ScopeDomainTreeNode[];
}

export interface ScopeDomainTreeProps {
  /** 原始 items，组件内部按 code 前缀构建域树并统计数量 */
  items?: ScopeItem[];
  /** 预构建域树（与 items 二选一） */
  treeData?: ScopeDomainTreeNode[];
  selectedScope?: string;
  onSelect: (scope?: string) => void;
  loading?: boolean;
  showAllNode?: boolean;
  allNodeLabel?: string;
  emptyDescription?: string;
  className?: string;
  style?: React.CSSProperties;
}

function fromCodePathTree(nodes: CodePathTreeNode[]): ScopeDomainTreeNode[] {
  return nodes.map((node) => ({
    code: node.code,
    name: node.name,
    itemCount: node.itemCount,
    children: node.children?.length ? fromCodePathTree(node.children) : undefined,
  }));
}

function renderNodeTitle(node: ScopeDomainTreeNode) {
  return (
    <span>
      <PartitionOutlined style={{ marginRight: 6 }} />
      <Text strong>{node.name}</Text>
      {node.itemCount != null ? (
        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
          ({node.itemCount})
        </Text>
      ) : null}
    </span>
  );
}

function toTreeNodes(nodes: ScopeDomainTreeNode[]): DataNode[] {
  return nodes.map((node) => {
    const hasChildren = Boolean(node.children?.length);
    return {
      key: node.code,
      title: renderNodeTitle(node),
      isLeaf: !hasChildren,
      children: hasChildren ? toTreeNodes(node.children!) : undefined,
    };
  });
}

const ScopeDomainTree: React.FC<ScopeDomainTreeProps> = ({
  items,
  treeData: externalTreeData,
  selectedScope,
  onSelect,
  loading = false,
  showAllNode = true,
  allNodeLabel = '全部',
  emptyDescription = '暂无域',
  className,
  style,
}) => {
  const treeData = useMemo(() => {
    if (externalTreeData?.length) return externalTreeData;
    if (items?.length) return fromCodePathTree(buildScopePrefixTree(items));
    return [];
  }, [externalTreeData, items]);

  const antTreeData = useMemo(() => {
    const domainNodes = toTreeNodes(treeData);
    if (showAllNode) {
      return [{ key: ALL_NODE_KEY, title: allNodeLabel, selectable: true }, ...domainNodes];
    }
    return domainNodes;
  }, [allNodeLabel, showAllNode, treeData]);

  if (!loading && !antTreeData.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />;
  }

  return (
    <Spin spinning={loading}>
      <Tree
        className={className}
        style={{ padding: 16, ...style }}
        showLine
        defaultExpandAll
        selectedKeys={[selectedScope ?? (showAllNode ? ALL_NODE_KEY : '')].filter(Boolean)}
        treeData={antTreeData}
        onSelect={(keys) => {
          const key = keys[0] as string | undefined;
          if (!key || key === ALL_NODE_KEY) {
            onSelect(undefined);
            return;
          }
          onSelect(key);
        }}
      />
    </Spin>
  );
};

export default ScopeDomainTree;
