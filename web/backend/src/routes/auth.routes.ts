/**
 * SSO：授权码 + PKCE。浏览器只拿 httpOnly 会话 Cookie。
 *
 * - GET  /auth/sso-config   前端拿登录入口
 * - GET  /auth/login        生成 PKCE，302 到 EADAF 授权页
 * - GET  /auth/callback     用 code 换票，写会话，302 回前端
 * - GET  /auth/me           本地 JWKS 验签后返回当前用户
 * - POST /auth/logout       清会话，返回 EADAF 登出地址
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config/env.js';
import { createPkce, exchangeToken, verifyAccessToken, verifyLogoutToken, type AccessClaims } from '../auth/oauth.js';
import {
  LOGIN_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  createId,
  deleteSession,
  deleteSessionsBySid,
  readCookie,
  rememberLogin,
  saveSession,
  setCookie,
  takeLogin,
  type Session,
} from '../auth/session.js';
import { resolveSession } from '../middleware/auth.js';

export const authRouter = Router();

/** 生产（HTTPS）下 Cookie 必须带 Secure；本地 http 调试时关掉 */
const cookieSecure = config.nodeEnv === 'production';

authRouter.get('/sso-config', (_req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      eadaf_frontend_url: config.eadaf.frontendUrl,
      application_id: config.eadaf.applicationId,
      callback_url: config.sso.callbackUrl,
      login_url: loginUrl(),
    },
  });
});

authRouter.get('/login', (req, res) => {
  const { verifier, challenge } = createPkce();
  const state = crypto.randomBytes(16).toString('base64url');
  const loginId = createId();
  const redirectTo = safeRedirect(typeof req.query.redirect === 'string' ? req.query.redirect : '');
  rememberLogin(loginId, { state, verifier, redirectTo, createdAt: Date.now() });
  setCookie(res, LOGIN_COOKIE, loginId, { maxAgeSec: 600, secure: cookieSecure });

  const authorizeUrl = new URL(`${config.eadaf.frontendUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set('client_id', config.eadaf.applicationId);
  authorizeUrl.searchParams.set('redirect_uri', config.sso.callbackUrl);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  res.redirect(302, authorizeUrl.toString());
});

authRouter.get('/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const pending = takeLogin(readCookie(req, LOGIN_COOKIE));
  clearCookie(res, LOGIN_COOKIE, cookieSecure);

  if (!code || !pending || state !== pending.state) {
    res.redirect(302, `${config.bff.frontendUrl}/auth/login?auth_error=state`);
    return;
  }

  try {
    const tokens = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.sso.callbackUrl,
      code_verifier: pending.verifier,
    });
    const claims = await verifyAccessToken(tokens.access_token);
    const session: Omit<Session, 'createdAt'> = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 900) * 1000,
      sid: tokens.sid ?? claims.sid ?? null,
      user: userFromClaims(claims),
    };
    const sessionId = saveSession(session);
    setCookie(res, SESSION_COOKIE, sessionId, { maxAgeSec: 7 * 24 * 3600, secure: cookieSecure });
    res.redirect(302, `${config.bff.frontendUrl}${pending.redirectTo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '换票失败';
    res.redirect(302, `${config.bff.frontendUrl}/auth/login?auth_error=${encodeURIComponent(message)}`);
  }
});

/**
 * 当前用户。这里会**真的用 JWKS 验一次签**（会话续期后令牌是新的），
 * 验不过就作废会话，避免"看着已登录、其实令牌早坏了"。
 */
authRouter.get('/me', async (req, res) => {
  const resolved = await resolveSession(req);
  if (!resolved) {
    res.status(401).json({ code: 401, message: '未认证或会话已过期', data: null, error_code: 'SESSION_EXPIRED' });
    return;
  }
  try {
    await verifyAccessToken(resolved.session.accessToken);
  } catch (e) {
    deleteSession(resolved.id);
    res.status(401).json({
      code: 401,
      message: `会话令牌校验失败：${(e as Error).message}`,
      data: null,
      error_code: 'SESSION_EXPIRED',
    });
    return;
  }
  res.json({
    code: 200,
    message: 'success',
    data: {
      user: resolved.session.user,
      sid: resolved.session.sid,
      verified_locally: true,
    },
  });
});

authRouter.get('/check', async (req, res) => {
  const resolved = await resolveSession(req);
  if (!resolved) {
    res.status(401).json({ code: 401, message: '未认证或会话已过期', data: null, error_code: 'SESSION_EXPIRED' });
    return;
  }
  res.json({ code: 200, message: 'success', data: { valid: true } });
});

/**
 * EADAF 撤销会话时 POST application/x-www-form-urlencoded 的 logout_token。
 * 用 JWKS 验签，按 sid 清掉本机会话。应用 SSO 需配置 backchannel_logout_uri 指向本地址。
 */
authRouter.post('/backchannel-logout', async (req, res) => {
  const logoutToken = typeof req.body?.logout_token === 'string' ? req.body.logout_token : '';
  if (!logoutToken) {
    res.status(400).json({ code: 400, message: '缺少 logout_token', data: null });
    return;
  }
  try {
    const claims = await verifyLogoutToken(logoutToken);
    const removed = deleteSessionsBySid(claims.sid as string);
    res.json({ code: 200, message: 'success', data: { removed } });
  } catch (e) {
    res.status(400).json({ code: 400, message: (e as Error).message, data: null });
  }
});

authRouter.post('/logout', (req, res) => {
  deleteSession(readCookie(req, SESSION_COOKIE));
  clearCookie(res, SESSION_COOKIE, cookieSecure);
  const endSession = new URL(`${config.eadaf.frontendUrl}/auth/logout`);
  endSession.searchParams.set('app', config.eadaf.applicationId);
  endSession.searchParams.set('post_logout_redirect_uri', `${config.bff.frontendUrl}/auth/login`);
  res.json({ code: 200, message: 'success', data: { logged_out: true, end_session_url: endSession.toString() } });
});

function loginUrl(): string {
  // 回调落在前端 5181（与 EADAF 登记的 :5181/auth/callback 一致），由 Vite 转到 BFF。
  // 开始登录必须直接打开 BFF，避免打到前端自己的 /auth/login 页面。
  return `http://localhost:${config.bff.port}/auth/login`;
}

function safeRedirect(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return '/OPWeb';
}

function userFromClaims(claims: AccessClaims): Session['user'] {
  return {
    user_id: claims.sub,
    username: claims.preferred_username ?? claims.username,
    name: claims.name ?? claims.preferred_username ?? claims.username,
  };
}
