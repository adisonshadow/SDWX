/**
 * DAG 无环校验（前端保存前二次校验）
 */
export function hasDagCycle(
  nodeIds: string[],
  edges: Array<{ fromId: string; toId: string }>,
): boolean {
  const nodes = new Set(nodeIds.filter(Boolean));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodes) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!nodes.has(e.fromId) || !nodes.has(e.toId)) continue;
    adj.get(e.fromId)!.push(e.toId);
    indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1);
  }
  const q: string[] = [];
  for (const [id, d] of indeg) {
    if (d === 0) q.push(id);
  }
  let visited = 0;
  while (q.length) {
    const u = q.shift()!;
    visited += 1;
    for (const v of adj.get(u) ?? []) {
      const nd = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, nd);
      if (nd === 0) q.push(v);
    }
  }
  return visited < nodes.size;
}

/** 拓扑排序（用于预览） */
export function topoSort(
  nodeIds: string[],
  edges: Array<{ fromId: string; toId: string }>,
): string[] {
  const nodes = new Set(nodeIds.filter(Boolean));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodes) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!nodes.has(e.fromId) || !nodes.has(e.toId)) continue;
    adj.get(e.fromId)!.push(e.toId);
    indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1);
  }
  const q = [...nodes].filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const v of adj.get(u) ?? []) {
      const nd = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, nd);
      if (nd === 0) q.push(v);
    }
  }
  return order.length === nodes.size ? order : [...nodes];
}
