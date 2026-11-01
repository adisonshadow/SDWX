/**
 * 预警 + 统计接口 → 后端 /api/ips/monitor*, /analytics*
 */
import { request } from '@/utils/request';

/** 预警记录列表 */
export function listAlerts(params: { alertType?: string; resolved?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.alertType) query.set('alertType', params.alertType);
  if (params.resolved !== undefined) query.set('resolved', String(params.resolved));
  const qs = query.toString();
  return request(`/api/ips/monitor/alerts${qs ? `?${qs}` : ''}`);
}

/** 工时中位数列表 */
export function listWorkHourMedians() {
  return request(`/api/ips/analytics/work-hour-medians`);
}

/** 管道利用率 */
export function getUtilization() {
  return request(`/api/ips/analytics/utilization`);
}

/** 排产偏差分析 */
export function getDeviation(params: { workshopOrderId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.workshopOrderId) query.set('workshopOrderId', params.workshopOrderId);
  const qs = query.toString();
  return request(`/api/ips/analytics/deviation${qs ? `?${qs}` : ''}`);
}
