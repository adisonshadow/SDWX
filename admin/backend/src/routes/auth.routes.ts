/**
 * SSO 认证路由
 *
 * - GET  /auth/sso-config  返回 SSO 配置 (前端据此构造登录跳转)
 * - POST /auth/callback    POST 跳转模式回调
 * - GET  /auth/callback    HEADER 模式回调
 * - GET  /auth/check       检查 token 有效性
 * - GET  /auth/me          当前用户信息
 * - POST /auth/logout      登出
 */
import { Router } from 'express';
import { config } from '../config/env.js';
import { extractToken, verifyUserToken, optionalAuth } from '../middleware/auth.js';

export const authRouter = Router();

/** SSO 配置 (前端构造登录 URL 用) */
authRouter.get('/sso-config', (_req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      eadaf_frontend_url: config.eadaf.frontendUrl,
      application_id: config.eadaf.applicationId,
      callback_url: config.sso.callbackUrl,
      redirect_mode: config.sso.redirectMode,
    },
  });
});

/**
 * 处理 SSO 回调 (POST_REDIRECT 模式)
 * EADAF POST 到此，body 含 access_token / refresh_token / user_info
 */
authRouter.post('/callback', async (req, res) => {
  const { access_token, refresh_token, user_info } = req.body;
  if (!access_token) {
    return res.status(400).json({ code: 400, message: '回调缺少 access_token', data: null });
  }
  // 重定向回前端 /auth/callback，前端组件捕获 token
  const frontCallback = buildFrontendCallback();
  const params = new URLSearchParams({ token: access_token });
  if (refresh_token) params.set('refresh_token', refresh_token);
  if (user_info) params.set('user_info', typeof user_info === 'string' ? user_info : JSON.stringify(user_info));
  res.redirect(302, `${frontCallback}?${params.toString()}`);
});

/**
 * 处理 SSO 回调 (HEADER_REDIRECT 模式, GET)
 */
authRouter.get('/callback', (req, res) => {
  const token = (req.query.access_token ?? req.query.token) as string | undefined;
  const refreshToken = req.query.refresh_token as string | undefined;
  const userInfo = req.query.user_info as string | undefined;
  if (!token) {
    return res.status(400).json({ code: 400, message: '回调缺少 token', data: null });
  }
  const frontCallback = buildFrontendCallback();
  const params = new URLSearchParams({ token });
  if (refreshToken) params.set('refresh_token', refreshToken);
  if (userInfo) params.set('user_info', userInfo);
  res.redirect(302, `${frontCallback}?${params.toString()}`);
});

/** 检查登录状态 — 代理 EADAF /api/v1/auth/check */
authRouter.get('/check', async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ code: 401, message: '未认证', data: null });
  try {
    const resp = await fetch(`${config.eadaf.apiBaseUrl}/api/v1/auth/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) return res.json({ code: 200, message: 'success', data: { valid: true } });
    return res.status(401).json({ code: 401, message: 'token 无效', data: null });
  } catch (e) {
    // EADAF 不可达时降级：本地校验 JWT
    const user = verifyUserToken(token);
    if (user) return res.json({ code: 200, message: 'success', data: { valid: true } });
    return res.status(401).json({ code: 401, message: 'token 无效', data: null });
  }
});

/** 当前用户信息 */
authRouter.get('/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '未认证', data: null });
  }
  res.json({ code: 200, message: 'success', data: req.user });
});

/** 登出 */
authRouter.post('/logout', (_req, res) => {
  // EADAF 侧登出流程待确认；BFF 侧无需状态
  res.json({ code: 200, message: 'success', data: { logged_out: true } });
});

/** 构造前端回调地址 */
function buildFrontendCallback(): string {
  // 重定向到 admin/frontend 的 /auth/callback，前端 AuthCallback 组件接收 token
  return `${config.bff.frontendUrl}/auth/callback`;
}
