/**
 * 齐套 / 委外接口 → 后端 /api/ips/kit* + CRUD
 */
import { request } from '@/utils/request';
import type { ApiEnvelope } from '@/utils/request';
import { crudList, crudUpdate } from './crud';

export interface KitCheckResult {
  satisfied: boolean;
  total: number;
  satisfiedCount: number;
  missing: number;
}

/** 某工卡齐套需求列表 */
export function getKitRequirements(workCardId: string) {
  return request(`/api/ips/kit/requirements/${workCardId}`);
}

/** 齐套校验 */
export function checkKit(workCardId: string): Promise<ApiEnvelope<KitCheckResult>> {
  return request(`/api/ips/kit/check/${workCardId}`, { method: 'POST' });
}

/** 全量齐套需求（缺项追踪） */
export function listKitRequirements(params: Record<string, unknown> = {}) {
  return crudList('production', 'WorkCardKitRequirement', params);
}

/** 委外记录列表 */
export function listOutsourcing(params: Record<string, unknown> = {}) {
  return crudList('production', 'WorkCardOutsourcing', params);
}

/** 更新委外记录（如标记返回） */
export function updateOutsourcing(id: string, body: Record<string, unknown>) {
  return crudUpdate('production', 'WorkCardOutsourcing', id, body);
}
