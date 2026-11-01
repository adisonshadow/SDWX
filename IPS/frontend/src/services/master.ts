/**
 * 主数据接口 → 后端 /api/ips/* 聚合端点 + 通用 CRUD
 * 产品/物料/工序/BOP 方案/工厂令号。
 */
import { request } from '@/utils/request';
import { crudList, crudCreate } from './crud';

// 产品
export function listProducts() {
  return crudList('master', 'Product');
}
export function getProductByNo(productNo: string) {
  return crudList('master', 'Product', { productNo });
}

// 物料
export function listMaterials(params: Record<string, unknown> = {}) {
  return crudList('master', 'Material', params);
}

// 工序定义
export function getProcessOperation(id: string) {
  return request(`/api/ips/process-operations/${id}`);
}

// BOP 方案
export function getBopScheme(id: string) {
  return request(`/api/ips/bop-schemes/${id}`);
}
export function listBopSchemes(params: { productModel?: string; repairMethod?: string; versionStatus?: string } = {}) {
  // 通过通用代理 + 字段过滤
  return crudList('process', 'BopScheme', params);
}

// 工厂令号
export function listFactoryOrders() {
  return crudList('production', 'FactoryOrder');
}
export function createFactoryOrder(body: Record<string, unknown>) {
  return crudCreate('production', 'FactoryOrder', body);
}
