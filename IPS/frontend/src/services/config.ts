/**
 * 排产配置接口 → 后端 /api/ips/config*
 */
import { request } from '@/utils/request';

/** 排产配置（默认） */
export function getScheduleConfig() {
  return request(`/api/ips/config/schedule`);
}

export function updateScheduleConfig(body: Record<string, unknown>) {
  return request(`/api/ips/config/schedule`, { method: 'PATCH', data: body });
}

/** 工位产能列表 */
export function listWorkstationCapacity() {
  return request(`/api/ips/config/workstation-capacity`);
}

export function upsertWorkstationCapacity(body: {
  workstationId: string;
  effectiveFrom: string;
  dailyLoadHours: number | string;
  amHours?: number | string | null;
  pmHours?: number | string | null;
  pipelineCapacityFactor?: number | string | null;
}) {
  return request(`/api/ips/config/workstation-capacity`, { method: 'PUT', data: body });
}
