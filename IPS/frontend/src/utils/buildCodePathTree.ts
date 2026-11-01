/**
 * 按冒号分层 code 构建域（Scope）前缀树。
 * 移植自 EADAF buildCodePathTree 的 buildScopePrefixTree 部分（供 ScopeDomainTree）。
 */

export interface CodePathTreeNode<T = unknown> {
  code: string;
  name: string;
  isScopeNode?: boolean;
  itemCount?: number;
  children?: CodePathTreeNode<T>[];
  data?: T;
  id?: string;
}

type CodePathItem = { code?: string; id?: string; label?: string };

/** 仅从 code 列表提取 Scope（域）前缀路径，不含叶子项 */
export function buildScopePrefixTree<T extends CodePathItem>(items: T[]): CodePathTreeNode<T>[] {
  const scopeSet = new Set<string>();

  items.forEach((item) => {
    const segments = (item.code || '').split(':').filter(Boolean);
    if (segments.length <= 1) return;
    for (let i = 1; i < segments.length; i += 1) {
      scopeSet.add(segments.slice(0, i).join(':'));
    }
  });

  if (!scopeSet.size) return [];

  const codeMap = new Map<string, CodePathTreeNode<T>>();
  const sorted = [...scopeSet].sort();

  sorted.forEach((code) => {
    const segments = code.split(':');
    codeMap.set(code, {
      code,
      name: segments[segments.length - 1]!,
      isScopeNode: true,
      children: [],
    });
  });

  const roots: CodePathTreeNode<T>[] = [];
  sorted.forEach((code) => {
    const parts = code.split(':');
    const node = codeMap.get(code)!;
    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join(':');
      const parent = codeMap.get(parentPath);
      if (parent && !parent.children?.some((child) => child.code === code)) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
    }
  });

  const countItemsInScope = (scopeCode: string) =>
    items.filter(
      (item) => item.code === scopeCode || item.code?.startsWith(`${scopeCode}:`),
    ).length;

  const sortTree = (nodes: CodePathTreeNode<T>[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    nodes.forEach((node) => {
      node.itemCount = countItemsInScope(node.code);
      if (node.children?.length) sortTree(node.children);
    });
  };
  sortTree(roots);
  return roots;
}
