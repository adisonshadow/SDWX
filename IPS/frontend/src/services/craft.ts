/**
 * 工艺管理 API → /api/ips/bom-schemes|process-operations|bop-schemes
 */
import { request } from '@/utils/request';
import { crudCreate, crudDelete, crudList, crudUpdate } from './crud';
import type { ListParams } from './crud';

// ── 列表（CRUD 代理）──
export function listBomSchemes(params: ListParams = {}) {
  return crudList('bom', 'BomScheme', params);
}
export function listProcessOperations(params: ListParams = {}) {
  return crudList('process', 'ProcessOperation', params);
}
export function listBopSchemesCrud(params: ListParams = {}) {
  return crudList('process', 'BopScheme', params);
}
export function listBopByBomScheme(bomSchemeId: string) {
  return crudList('process', 'BopScheme', { bomSchemeId, pageSize: 100 });
}
export function listBopByOperation(operationId: string) {
  // 通过节点反查：先查节点再聚合；列表页引用用 crud 节点
  return crudList('process', 'BopOperationNode', { operationId, pageSize: 200 });
}

// ── BOM ──
export function getBomScheme(id: string) {
  return request(`/api/ips/bom-schemes/${id}`);
}
export function createBomScheme(body: { productModel: string; version?: number }) {
  return request('/api/ips/bom-schemes', { method: 'POST', data: body });
}
export function publishBomScheme(id: string) {
  return request(`/api/ips/bom-schemes/${id}/publish`, { method: 'POST' });
}
export function obsoleteBomScheme(id: string) {
  return request(`/api/ips/bom-schemes/${id}/obsolete`, { method: 'POST' });
}
export function reviseBomScheme(id: string) {
  return request(`/api/ips/bom-schemes/${id}/revise`, { method: 'POST' });
}
export function cloneBomScheme(id: string, body: { productModel?: string } = {}) {
  return request(`/api/ips/bom-schemes/${id}/clone`, { method: 'POST', data: body });
}
export function saveBomTree(
  id: string,
  nodes: Array<{
    clientKey: string;
    parentClientKey?: string | null;
    materialId?: string | null;
    nodeType: string;
    quantity?: string | number;
  }>,
) {
  return request(`/api/ips/bom-schemes/${id}/tree`, { method: 'PUT', data: { nodes } });
}

// ── 工序 ──
export function getProcessOperationBundle(id: string) {
  return request(`/api/ips/process-operations/${id}`);
}
export function createProcessOperation(body: Record<string, unknown>) {
  return request('/api/ips/process-operations', { method: 'POST', data: body });
}
export function publishProcessOperation(id: string) {
  return request(`/api/ips/process-operations/${id}/publish`, { method: 'POST' });
}
export function obsoleteProcessOperation(id: string) {
  return request(`/api/ips/process-operations/${id}/obsolete`, { method: 'POST' });
}
export function reviseProcessOperation(id: string) {
  return request(`/api/ips/process-operations/${id}/revise`, { method: 'POST' });
}
export function cloneProcessOperation(id: string, body: { operationNo?: string } = {}) {
  return request(`/api/ips/process-operations/${id}/clone`, { method: 'POST', data: body });
}
export function saveProcessOperationStructure(id: string, body: Record<string, unknown>) {
  return request(`/api/ips/process-operations/${id}/structure`, { method: 'PUT', data: body });
}

export function createProcessStep(body: Record<string, unknown>) {
  return crudCreate('process', 'ProcessStep', body);
}

export function updateProcessStep(id: string, body: Record<string, unknown>) {
  return crudUpdate('process', 'ProcessStep', id, body);
}

export function deleteProcessStep(id: string) {
  return crudDelete('process', 'ProcessStep', id);
}

export function listProcessSteps(params: ListParams = {}) {
  return crudList('process', 'ProcessStep', params);
}

// ── BOP ──
export function getBopSchemeBundle(id: string) {
  return request(`/api/ips/bop-schemes/${id}`);
}
export function createBopScheme(body: Record<string, unknown>) {
  return request('/api/ips/bop-schemes', { method: 'POST', data: body });
}
export function publishBopScheme(id: string) {
  return request(`/api/ips/bop-schemes/${id}/publish`, { method: 'POST' });
}
export function obsoleteBopScheme(id: string) {
  return request(`/api/ips/bop-schemes/${id}/obsolete`, { method: 'POST' });
}
export function reviseBopScheme(id: string) {
  return request(`/api/ips/bop-schemes/${id}/revise`, { method: 'POST' });
}
export function cloneBopScheme(id: string, body: Record<string, unknown> = {}) {
  return request(`/api/ips/bop-schemes/${id}/clone`, { method: 'POST', data: body });
}
export function saveBopStructure(id: string, body: Record<string, unknown>) {
  return request(`/api/ips/bop-schemes/${id}/structure`, { method: 'PUT', data: body });
}
