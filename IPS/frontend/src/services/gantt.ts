/**
 * 排产可视化接口 → /api/ips/gantt*
 */
import { request } from '@/utils/request';

export interface GanttOrderData {
  workCards: Record<string, any>[];
  tasks: Record<string, any>[];
}

/** 单令号甘特数据（工卡 + 排产任务） */
export function getGanttByOrder(workshopOrderId: string) {
  return request<GanttOrderData>(`/api/ips/gantt/workshop-order/${workshopOrderId}`);
}
