/**
 * 工位主数据 CRUD → /api/ips/crud/master/Workstation + /workstations
 */
import { request } from '@/utils/request';
import { crudCreate, crudDelete, crudList, crudUpdate } from './crud';

export function listWorkstations(params: { areaType?: string } = {}) {
  const query = new URLSearchParams();
  if (params.areaType) query.set('areaType', params.areaType);
  const qs = query.toString();
  return request(`/api/ips/workstations${qs ? `?${qs}` : ''}`);
}

/** 工位负荷（未来 N 天负荷汇总） */
export function getWorkstationLoad(days = 14) {
  return request(`/api/ips/load/workstations?days=${days}`);
}

/** 工位列表（CRUD 代理，支持分页过滤） */
export function listWorkstationsCrud(params: Record<string, unknown> = {}) {
  return crudList('master', 'Workstation', params);
}

export function createWorkstation(body: Record<string, unknown>) {
  return crudCreate('master', 'Workstation', body);
}

export function updateWorkstation(id: string, body: Record<string, unknown>) {
  return crudUpdate('master', 'Workstation', id, body);
}

export function deleteWorkstation(id: string) {
  return crudDelete('master', 'Workstation', id);
}
