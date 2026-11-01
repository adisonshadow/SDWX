/**
 * 请求校验工具（基于 zod）
 *
 * 用法：
 *   const body = parseOr400(req, res, LaunchOrderSchema);
 *   if (!body) return; // 校验失败已响应 400
 */
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { fail } from './response.js';

/** 解析并校验 body；失败返回 null 并已响应 400 */
export function parseOr400<T>(
  req: Request,
  res: Response,
  schema: ZodType<T>,
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first ? `${first.path.join('.') || 'body'}: ${first.message}` : '请求参数校验失败';
    fail(res, 400, message, null);
    return null;
  }
  return result.data;
}

/** 解析并校验 query；失败返回 null 并已响应 400 */
export function parseQueryOr400<T>(
  req: Request,
  res: Response,
  schema: ZodType<T>,
): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first
      ? `${first.path.join('.') || 'query'}: ${first.message}`
      : '查询参数校验失败';
    fail(res, 400, message, null);
    return null;
  }
  return result.data;
}
