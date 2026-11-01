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

function textOf(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function roleKey(key: string): boolean {
  return ['roles', 'roleIds', 'role_ids', 'roleId', 'role_id', 'userRoles', 'user_roles'].includes(key);
}

/** 从登录用户或 EADAF 返回里收集角色 id。 */
function collectRoleIds(node: unknown, out: Set<string>, key = '', depth = 0): void {
  if (depth > 6 || node == null) return;
  if (roleKey(key)) {
    const list = typeof node === 'string' ? [node] : Array.isArray(node) ? node : [node];
    if (typeof node === 'string' || Array.isArray(node)) {
      for (const item of list) {
        if (typeof item === 'string' && item.trim()) out.add(item.trim());
        else if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>;
          const id = textOf(row.role_id) || textOf(row.roleId) || textOf(row.id);
          if (id) out.add(id);
        }
      }
      return;
    }
  }
  if (typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) {
      collectRoleIds(value, out, childKey, depth + 1);
    }
  }
}

function displayNameOf(user: Record<string, unknown>): string {
  return textOf(user.name) || textOf(user.username) || textOf(user.user_name);
}

/** 当前登录用户的角色，通知程序用来判断该不该弹出呼叫。 */
callConfigRouter.get('/my-roles', async (req, res) => {
  try {
    const user = (req.user ?? {}) as Record<string, unknown>;
    const roleIds = new Set<string>();
    collectRoleIds(user, roleIds);
    let name = displayNameOf(user);
    const userId = textOf(user.user_id) || textOf(user.id) || textOf(user.sub) || textOf(user.userId);
    const auth = req.headers.authorization;
    if (auth) {
      const paths = ['/api/v1/auth/me', userId ? `/api/v1/users/${userId}` : '', userId ? `/api/v1/users/${userId}/roles` : '']
        .filter((path) => path);
      for (const path of paths) {
        try {
          const resp = await fetch(`${config.eadaf.apiBaseUrl}${path}`, { headers: { Authorization: auth } });
          const text = await resp.text();
          if (!resp.ok || !text) continue;
          const json = JSON.parse(text) as unknown;
          const before = roleIds.size;
          collectRoleIds(json, roleIds);
          if (!name && json && typeof json === 'object') {
            const data = (json as { data?: Record<string, unknown> }).data ?? (json as Record<string, unknown>);
            if (data && typeof data === 'object') name = displayNameOf(data as Record<string, unknown>) || name;
          }
          if (roleIds.size > before && roleIds.size > 0) break;
        } catch {
          // 下一个地址
        }
      }
    }
    ok(res, { roleIds: Array.from(roleIds), name });
  } catch (e) {
    handleError(res, e);
  }
});
