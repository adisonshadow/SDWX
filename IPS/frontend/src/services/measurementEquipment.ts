/**
 * 测量设备 CRUD → /api/ips/crud/master/MeasurementEquipment
 */
import { crudCreate, crudDelete, crudList, crudUpdate } from './crud';

export function listMeasurementEquipment(params: Record<string, unknown> = {}) {
  return crudList('master', 'MeasurementEquipment', params);
}

export function createMeasurementEquipment(body: Record<string, unknown>) {
  return crudCreate('master', 'MeasurementEquipment', body);
}

export function updateMeasurementEquipment(id: string, body: Record<string, unknown>) {
  return crudUpdate('master', 'MeasurementEquipment', id, body);
}

export function deleteMeasurementEquipment(id: string) {
  return crudDelete('master', 'MeasurementEquipment', id);
}
