/**
 * pipeline — 采集原始帧转发到 BFF /api/op/ingest
 *
 * 带用户 token 认证；失败静默（采集不应阻塞作业）。
 */
import type { CollectFrame } from '@fmms/shared';

/** 转发一帧到 BFF */
export async function pipeline(
  bffBase: string,
  frame: CollectFrame,
  userToken: string | null,
): Promise<void> {
  const url = `${bffBase.replace(/\/$/, '')}/api/op/ingest`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (userToken) headers.Authorization = `Bearer ${userToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(frame),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BFF ingest 失败 (${res.status}): ${text}`);
  }
}
