/**
 * 统一响应工具
 *
 * 信封：{ code, message, data }
 * - 成功：code 200, message 'success', data 任意
 * - 列表：data 为 { items, pagination }（EADAF Skill §3.2.1）；兼容附带 total/page/size
 * - 错误：data 为 null，code 为业务码（通常等于 HTTP 状态码）
 */
import type { Response } from 'express';
import { EadafError } from '../eadaf/EADAFClient.js';

/** 成功响应 */
export function ok<T>(res: Response, data: T, message = 'success'): Response {
  return res.json({ code: 200, message, data });
}

/** 失败响应 */
export function fail(
  res: Response,
  status: number,
  message: string,
  data: unknown = null,
): Response {
  return res.status(status).json({ code: status, message, data });
}

/** 统一错误处理：EadafError 透传 httpStatus（200→500），其余 500 */
export function handleError(res: Response, e: unknown): Response {
  if (e instanceof EadafError) {
    const status = e.httpStatus === 200 ? 500 : e.httpStatus;
    return fail(res, status, e.message, null);
  }
  const message = e instanceof Error ? e.message : '服务器错误';
  return fail(res, 500, message, null);
}
