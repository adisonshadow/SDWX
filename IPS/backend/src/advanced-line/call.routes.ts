/**
 * 呼叫类型用到的角色列表。把当前用户令牌转给 EADAF。
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { ok, fail, handleError } from '../lib/response.js';

export const callConfigRouter = Router();
callConfigRouter.use(authenticate);

callConfigRouter.get('/call-roles', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return fail(res, 401, '未认证');
    const resp = await fetch(`${config.eadaf.apiBaseUrl}/api/v1/roles?page=1&size=100`, {
      headers: { Authorization: auth },
    });
    const json = await resp.json() as { code?: number; message?: string; data?: { items?: unknown[] } };
    if (!resp.ok || (json.code && json.code >= 400)) {
      return fail(res, resp.status || 500, json.message || '读取角色失败');
    }
    const items = (json.data?.items ?? []).map((row) => {
      const role = row as { role_id?: string; role_name?: string; code?: string; status?: string };
      return { id: role.role_id, name: role.role_name, code: role.code, status: role.status };
    }).filter((role) => role.status !== 'DISABLED' && role.status !== 'ARCHIVED');
    ok(res, { items });
  } catch (e) {
    handleError(res, e);
  }
});
