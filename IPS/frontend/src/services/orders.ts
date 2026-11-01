/**
 * 令号投产接口 → 后端 /api/ips/orders*
 * 对应 backend op.routes.ts 令号投产向导 + 令号总览。
 */
import { request } from '@/utils/request';

export interface LaunchOrderBody {
  factoryOrderId: string;
  productId: string;
  repairMethod: 'OVERHAUL' | 'CHECK' | 'DETECT' | 'OIL_SEAL' | 'TROUBLESHOOT';
  bopSchemeId: string;
  workshopOrderNo?: string;
  planStartDate?: string;
  planEndDate?: string;
}

/** 令号投产向导：创建车间令号 → BOP 实例 → 工卡 → 单台计划 → WBS 根节点 */
export function launchOrder(body: LaunchOrderBody) {
  return request(`/api/ips/orders/launch`, { method: 'POST', data: body });
}

/** 令号总览（令号 + 工卡列表 + 单台计划 + BOP 实例） */
export function getOrderOverview(workshopOrderId: string) {
  return request(`/api/ips/orders/${workshopOrderId}`);
}
