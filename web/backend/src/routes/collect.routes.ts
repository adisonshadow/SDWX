/**
 * 采集回调用路由 — 测量适配程序（measurement-exe）的提交入口
 *
 * 客户要求这个接口**不做认证**：适配程序只发 JSON，不带任何令牌。
 * 所以这里没有 authenticate，改为三道轻量约束：
 *   1. 来源 IP 白名单（COLLECT_ALLOWED_IPS）。未配置则全部拒绝；
 *   2. 请求体形状校验（必须是对象，必须有 taskId/status）；
 *   3. 全量日志（来源 IP + taskId + 上游结果）。
 *
 * 转发：用 BFF 自己的应用令牌 POST 到 EADAF 采集管道（INGEST_ROUTE）。
 * 适配程序的重试语义：非 2xx 视为未送达，任务保留在面板上可重提；
 * 因此上游失败时要如实返回 502/503，不要吞成 200。
 */
import { Router } from 'express';
import { config } from '../config/env.js';
import { eadafClient, EadafError } from '../eadaf/EADAFClient.js';
import { inspectionItemRepo, saveInspectionResultData } from '../eadaf/repositories.js';
import { INGEST_ROUTE } from '@fmms/shared';
import type { InspectionResultItem } from '@fmms/shared';

export const collectRouter = Router();

/** 适配程序回调体（见 measurement-exe/src/tasks.cpp makeFinishJob） */
interface MeasurementCallback {
  taskId?: string;
  deviceType?: string;
  standardRevision?: string;
  status?: string;
  acceptedAt?: string | null;
  completedAt?: string;
  context?: unknown;
  results?: Array<{
    code?: string;
    name?: string;
    valueType?: string;
    unit?: string | null;
    value?: unknown;
    requirement?: unknown;
  }>;
}

function clientIp(req: import('express').Request): string {
  const raw = req.ip ?? req.socket.remoteAddress ?? '';
  // IPv4-mapped IPv6（::ffff:192.168.1.10）统一成 IPv4，便于和配置比对
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function sourceAllowed(ip: string): boolean {
  const allow = config.collect.allowedIps;
  if (allow.length === 0) return false;
  return allow.includes(ip);
}

/**
 * POST /api/collect/measurement
 * 无认证。接收适配程序的测量结果，转发进 EADAF 采集管道。
 */
collectRouter.post('/measurement', async (req, res) => {
  const ip = clientIp(req);
  const payload = req.body as MeasurementCallback | undefined;

  if (!sourceAllowed(ip)) {
    // eslint-disable-next-line no-console
    console.warn(`[collect] 拒绝来源 ${ip}（COLLECT_ALLOWED_IPS 未放行）`);
    return res.status(403).json({ code: 403, message: '来源未授权', data: null });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ code: 400, message: '请求体须为 JSON 对象', data: null });
  }
  if (!payload.taskId || !payload.status) {
    return res.status(400).json({ code: 400, message: '缺少 taskId 或 status', data: null });
  }

  const raw = JSON.stringify(payload);
  const startedAt = Date.now();
  try {
    const mapped = await writeMatchedResults(payload);
    await eadafClient.ingest(INGEST_ROUTE, Buffer.from(raw, 'utf8'), 'text/plain; charset=utf-8');
    // eslint-disable-next-line no-console
    console.log(
      `[collect] ${ip} task=${payload.taskId} device=${payload.deviceType ?? '-'} status=${payload.status} items=${
        payload.results?.length ?? 0
      } matched=${mapped.matched} → EADAF ok (${Date.now() - startedAt}ms)`,
    );
    res.json({
      code: 200,
      message: '已接收',
      data: { task_id: payload.taskId, forwarded: true, matched: mapped.matched, unmatched: mapped.unmatched },
    });
  } catch (e) {
    const message = e instanceof EadafError ? `EADAF ${e.httpStatus}: ${e.message}` : (e as Error).message;
    // eslint-disable-next-line no-console
    console.error(`[collect] ${ip} task=${payload.taskId} 转发失败: ${message}`);
    // 502：让适配程序保留任务并提示"未送达"，而不是误报成功
    res.status(502).json({ code: 502, message: `转发 EADAF 失败：${message}`, data: null });
  }
});

/** 探活：适配程序/运维用，同样不认证，不暴露任何业务数据 */
collectRouter.get('/ping', (_req, res) => {
  res.json({ code: 200, message: 'ok', data: { service: 'fmms-collect', route: INGEST_ROUTE } });
});

function workCardIdOf(context: unknown): string | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const row = context as Record<string, unknown>;
  const id = row.workCardId ?? row.work_card_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** results[].code 对检测项 item_code。对上的数字结果写入检测记录；对不上的只留在采集报文里。 */
async function writeMatchedResults(payload: MeasurementCallback): Promise<{ matched: number; unmatched: string[] }> {
  const workCardId = workCardIdOf(payload.context);
  if (!workCardId || payload.status !== 'completed' || !payload.results?.length) {
    return { matched: 0, unmatched: [] };
  }
  const items: InspectionResultItem[] = [];
  const unmatched: string[] = [];
  for (const row of payload.results) {
    if (!row.code) continue;
    const found = await inspectionItemRepo.getByCode(row.code);
    if (!found?.id) {
      unmatched.push(row.code);
      continue;
    }
    const photoIds = await photoObjectIds(row);
    if (typeof row.value !== 'number' && !photoIds) {
      unmatched.push(row.code);
      continue;
    }
    items.push({
      item_code: row.code,
      inspection_item_id: found.id,
      measured_value: typeof row.value === 'number' ? row.value : undefined,
      photo_object_ids: photoIds,
      result: 'pending',
      collected_by: 'auto',
      collected_at: payload.completedAt,
    });
  }
  if (items.length > 0) {
    await saveInspectionResultData(workCardId, {
      items,
      summary: { total: items.length, qualified: 0, unqualified: 0, pending: items.length },
    });
  }
  return { matched: items.length, unmatched };
}

async function photoObjectIds(row: NonNullable<MeasurementCallback['results']>[number]): Promise<string[] | undefined> {
  if (!Array.isArray(row.value)) return undefined;
  const ids: string[] = [];
  for (const image of row.value) {
    if (!image || typeof image !== 'object') continue;
    const file = image as { contentBase64?: string; fileName?: string };
    if (!file.contentBase64) continue;
    const id = await eadafClient.uploadObject(Buffer.from(file.contentBase64, 'base64'), file.fileName ?? 'photo.jpg');
    if (id) ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}
