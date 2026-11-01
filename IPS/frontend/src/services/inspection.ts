/**
 * 检验项 / 检验记录 CRUD → /api/ips/crud/inspection/*
 */
import { crudCreate, crudDelete, crudList, crudUpdate } from './crud';

export function listInspectionItems(params: Record<string, unknown> = {}) {
  return crudList('inspection', 'InspectionItem', params);
}

export function createInspectionItem(body: Record<string, unknown>) {
  return crudCreate('inspection', 'InspectionItem', body);
}

export function updateInspectionItem(id: string, body: Record<string, unknown>) {
  return crudUpdate('inspection', 'InspectionItem', id, body);
}

export function deleteInspectionItem(id: string) {
  return crudDelete('inspection', 'InspectionItem', id);
}

export function listInspectionRecords(params: Record<string, unknown> = {}) {
  return crudList('inspection', 'InspectionRecord', params);
}

export function createInspectionRecord(body: Record<string, unknown>) {
  return crudCreate('inspection', 'InspectionRecord', body);
}

export function updateInspectionRecord(id: string, body: Record<string, unknown>) {
  return crudUpdate('inspection', 'InspectionRecord', id, body);
}

export function deleteInspectionRecord(id: string) {
  return crudDelete('inspection', 'InspectionRecord', id);
}

/** 更新工步实例检验结果摘要 */
export function updateStepInstance(id: string, body: Record<string, unknown>) {
  return crudUpdate('production', 'StepInstance', id, body);
}
