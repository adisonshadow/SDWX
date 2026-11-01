/**
 * WBS 接口 → 后端 /api/ips/wbs*
 */
import { request } from '@/utils/request';

/** WBS 多级树（按令号） */
export function getWbsTree(workshopOrderId: string) {
  return request(`/api/ips/wbs/trees/${workshopOrderId}`);
}

export interface WbsNodeUpdateBody {
  code?: string;
  name?: string;
  level?: number;
  nodeType?: 'ROOT' | 'TASK' | 'GROUP' | 'PHASE' | 'PACKAGE';
  parentId?: string | null;
  sortOrder?: number;
  workstationId?: string | null;
  status?: string;
  remark?: string | null;
}

/** 更新 WBS 节点 */
export function updateWbsNode(id: string, body: WbsNodeUpdateBody) {
  return request(`/api/ips/wbs/nodes/${id}`, { method: 'PATCH', data: body });
}

/** 批量顺延 */
export function postponeWbsNodes(nodeIds: string[], days: number) {
  return request(`/api/ips/wbs/nodes/postpone`, { method: 'POST', data: { nodeIds, days } });
}
