/**
 * 分拣可视化引导 — 管理端接口
 */
import instance, { request } from '@/utils/request';
import type { ApiEnvelope } from '@/utils/request';

export type HotZoneShape = 'rect' | 'square' | 'circle';

export interface HotZone {
  shape?: HotZoneShape;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideSlot {
  id?: string;
  materialId?: string;
  materialNo?: string;
  materialName?: string;
  partCode?: string;
  instanceNo?: number;
  slotCode?: string;
  hotZone?: HotZone | null;
  required?: boolean;
  sortOrder?: number;
  slotStatus?: string;
}

export interface GuideTemplate {
  id?: string;
  templateCode?: string;
  templateName?: string;
  workstationType?: string;
  photoObjectId?: string | null;
  bopSchemeId?: string | null;
  materialClassId?: string | null;
  status?: string;
  schemeName?: string;
  className?: string;
}

export interface ClassOption {
  id: string;
  name: string;
  items: Array<{
    nodeId: string;
    materialId: string;
    materialNo: string;
    name: string;
    quantity: number;
  }>;
}

export function listSortingGuides() {
  return request<{ items: GuideTemplate[]; total: number }>('/api/ips/sorting-guides');
}

export function getSortingGuide(id: string) {
  return request<{ template: GuideTemplate; slots: GuideSlot[] }>(`/api/ips/sorting-guides/${id}`);
}

export function guideOptions(bopSchemeId: string) {
  return request<{ classes: ClassOption[] }>(`/api/ips/sorting-guides/options?bopSchemeId=${encodeURIComponent(bopSchemeId)}`);
}

export function saveSortingGuide(id: string | undefined, body: Record<string, unknown>) {
  if (!id || id === 'new') return request<{ id: string }>('/api/ips/sorting-guides', { method: 'POST', data: body });
  return request<{ id: string; status: string }>(`/api/ips/sorting-guides/${id}`, { method: 'PUT', data: body });
}

export async function uploadGuidePhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await request<{ object_id: string }>('/api/ips/sorting-guides/upload', {
    method: 'POST',
    data: form,
  });
  return res.data.object_id;
}

export async function guidePhotoUrl(objectId: string): Promise<string> {
  const res = await instance.get<Blob>(`/api/ips/sorting-guides/preview/${objectId}`, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

export type { ApiEnvelope };
