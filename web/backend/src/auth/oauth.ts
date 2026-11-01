/**
 * 授权码 + PKCE，以及用 EADAF JWKS 本地验签。
 * 对齐 /Volumes/dev/EADAF/docs/sso-bff-template/server.mjs
 */
import crypto from 'node:crypto';
import { config } from '../config/env.js';

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  sid?: string;
}

export async function exchangeToken(params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${config.eadaf.apiBaseUrl}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      client_id: config.eadaf.applicationId,
      client_secret: config.eadaf.appSecret,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenSet & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`换票失败：${detail}`);
  }
  return json;
}

/** 用 refresh_token 续期（EADAF 的 /oauth/token 支持 refresh_token grant） */
export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return exchangeToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

let jwksCache: { keys: Jwk[] } | null = null;
let jwksAt = 0;

async function getJwks(): Promise<{ keys: Jwk[] }> {
  if (!jwksCache || Date.now() - jwksAt > 10 * 60 * 1000) {
    const res = await fetch(`${config.eadaf.apiBaseUrl}/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`读取 JWKS 失败 HTTP ${res.status}`);
    jwksCache = (await res.json()) as { keys: Jwk[] };
    jwksAt = Date.now();
  }
  return jwksCache;
}

export interface AccessClaims {
  sub?: string;
  sid?: string;
  azp?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  events?: Record<string, unknown>;
  name?: string;
  preferred_username?: string;
  username?: string;
}

const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/** OIDC logout_token：必须带 back-channel 事件，且不能带 nonce（防止拿 ID Token 重放） */
export async function verifyLogoutToken(token: string): Promise<AccessClaims> {
  const payload = await verifyAccessToken(token);
  if (!payload.events?.[BACKCHANNEL_EVENT]) {
    throw new Error('缺少 back-channel-logout 事件声明');
  }
  if (payload.nonce) throw new Error('logout token 不应带 nonce');
  if (!payload.sid) throw new Error('logout token 缺少 sid');
  return payload;
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!signaturePart) throw new Error('令牌格式错误');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as AccessClaims;
  if (header.alg !== 'RS256') throw new Error(`不接受的签名算法：${header.alg}`);

  const jwks = await getJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) throw new Error('JWKS 中没有可用公钥');

  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!ok) throw new Error('签名校验失败');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('令牌已过期');
  if (payload.aud && payload.aud !== config.eadaf.applicationId) throw new Error('aud 不匹配');
  return payload;
}
