/**
 * 排产引擎接口 → /api/ips/engine*
 */
import { request } from '@/utils/request';
import type { ApiEnvelope } from '@/utils/request';

export interface EngineStatus {
  running: boolean;
  lastRunAt: string | null;
  lastRunError: string | null;
  runCount: number;
  effected?: number;
  total?: number;
}

export function getEngineStatus(): Promise<ApiEnvelope<EngineStatus>> {
  return request(`/api/ips/engine/status`);
}

/** 触发一次全量重算 */
export function runEngine(): Promise<ApiEnvelope<EngineStatus>> {
  return request(`/api/ips/engine/run`, { method: 'POST' });
}
