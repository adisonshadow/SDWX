/**
 * 工卡作业相关接口 → 后端 /api/ips/workcards*
 * 对应 backend op.routes.ts 工卡作业 + 齐套管理 + 非例行插单。
 */
import { request } from '@/utils/request';
import type { ApiEnvelope } from '@/utils/request';

export interface WorkCardListParams {
  workshopOrderId?: string;
  workstationId?: string;
  status?: string;
  priority?: string;
  kitRequired?: boolean;
  page?: number;
  pageSize?: number;
}

export function listWorkCards(params: WorkCardListParams = {}) {
  const query = new URLSearchParams();
  const { page, pageSize, kitRequired, ...rest } = params;
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  }
  if (kitRequired !== undefined) query.set('kitRequired', String(kitRequired));
  // 与 CRUD 一致：page 1-based；pageSize 由后端映射为 limit
  if (page != null && page > 0) query.set('page', String(page));
  if (pageSize != null && pageSize > 0) query.set('pageSize', String(pageSize));
  const qs = query.toString();
  return request(`/api/ips/workcards${qs ? `?${qs}` : ''}`);
}

/** 游离工卡池（待生效） */
export function listFloatingWorkCards(params: { workstationId?: string; priority?: string } = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  }
  const qs = query.toString();
  return request(`/api/ips/workcards/floating${qs ? `?${qs}` : ''}`);
}

/** 工卡详情（聚合 工序/工步/齐套/DAG） */
export function getWorkCard(id: string) {
  return request(`/api/ips/workcards/${id}`);
}

/** 手动生效工卡 */
export function effectWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/effect`, { method: 'POST' });
}

/** 取消工卡（批量） */
export function cancelWorkCards(ids: string[]): Promise<ApiEnvelope<{ cancelled: number }>> {
  return request(`/api/ips/workcards/cancel`, { method: 'POST', data: { ids } });
}

/** 接受工卡 */
export function acceptWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/accept`, { method: 'POST' });
}

/** 更新进度 */
export function updateProgress(id: string, progress: number): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/progress`, {
    method: 'PATCH',
    data: { progress },
  });
}

/** 提交工卡 */
export function submitWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/submit`, { method: 'POST' });
}

/** 齐套挂起 */
export function suspendWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/suspend`, { method: 'POST' });
}

/** 恢复挂起 */
export function resumeWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/resume`, { method: 'POST' });
}

/** 召回工卡 */
export function recallWorkCard(id: string): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/${id}/recall`, { method: 'POST' });
}

/** 创建非例行工卡 */
export function createNonRoutineCard(body: {
  workshopOrderId: string;
  operationInstanceId: string;
  workstationId: string;
  priority?: 'NON_ROUTINE' | 'URGENT';
  pipelineOrder?: number;
  remark?: string;
}): Promise<ApiEnvelope> {
  return request(`/api/ips/workcards/non-routine`, { method: 'POST', data: body });
}
