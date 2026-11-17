const crypto = require('node:crypto');

// Identity of the chaos control plane (experiment 1 of the security game day).
//
// Round 0: a static shared token, valid forever, from anywhere, for anything.
// Round 1 (CHAOS_TOKEN_MODE=efimero): every call carries a short lived token
// minted from the shared secret, bound to an audience and to an expiry of at
// most 15 minutes; the static secret itself is rejected on the wire, so a
// leaked value can no longer be replayed. Optionally the whole switch only
// works inside an agreed execution window (CHAOS_WINDOW).
//
// Token format: v2.<audience>.<expires unix s>.<nonce>.<hmac sha256 base64url>

const MAX_TOKEN_TTL_SECONDS = 900;
const MODES = ['estatico', 'efimero'];

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(key, payload) {
  return base64url(crypto.createHmac('sha256', key).update(payload).digest());
}

function mintToken({ key, audience, ttlSeconds = 300, now = Date.now() }) {
  if (!key || key.length < 16) throw new Error('Falta la clave para firmar el token');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(audience || '')) throw new Error('Audiencia invalida');
  const ttl = Math.min(Math.max(Number(ttlSeconds) || 0, 1), MAX_TOKEN_TTL_SECONDS);
  const expires = Math.floor(now / 1000) + ttl;
  const nonce = base64url(crypto.randomBytes(9));
  const payload = `${audience}.${expires}.${nonce}`;
  return `v2.${payload}.${sign(key, payload)}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Returns { ok, motivo, tipo, audiencia, expira }. "motivo" names the reason a
// call is refused and is what the detection rules match on.
function verifyToken(provided, { key, mode = 'estatico', audience, now = Date.now() }) {
  if (typeof provided !== 'string' || provided.length === 0) {
    return { ok: false, motivo: 'token_ausente', tipo: 'ninguno' };
  }
  if (provided.startsWith('v2.')) {
    const parts = provided.split('.');
    if (parts.length !== 5) return { ok: false, motivo: 'token_malformado', tipo: 'efimero' };
    const [, aud, expiresRaw, nonce, signature] = parts;
    const payload = `${aud}.${expiresRaw}.${nonce}`;
    if (!safeEqual(signature, sign(key, payload))) return { ok: false, motivo: 'firma_invalida', tipo: 'efimero', audiencia: aud };
    const expires = Number(expiresRaw);
    if (!Number.isFinite(expires) || expires * 1000 < now) return { ok: false, motivo: 'token_expirado', tipo: 'efimero', audiencia: aud, expira: expires };
    if (audience && aud !== audience) return { ok: false, motivo: 'audiencia_invalida', tipo: 'efimero', audiencia: aud, expira: expires };
    return { ok: true, tipo: 'efimero', audiencia: aud, expira: expires };
  }
  if (!safeEqual(provided, key)) return { ok: false, motivo: 'token_invalido', tipo: 'estatico' };
  if (mode === 'efimero') return { ok: false, motivo: 'token_estatico_rechazado', tipo: 'estatico' };
  return { ok: true, tipo: 'estatico' };
}

// CHAOS_WINDOW = "<inicio ISO 8601>/<fin ISO 8601>", e.g.
// "2026-11-18T08:00:00-05:00/2026-11-18T12:00:00-05:00". Empty = no window.
function parseWindow(value) {
  if (!value) return null;
  const [start, end] = String(value).split('/');
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error('CHAOS_WINDOW debe ser "<inicio>/<fin>" en ISO 8601 con fin posterior al inicio');
  }
  return { from, to };
}

function isWithinWindow(window, now = Date.now()) {
  if (!window) return true;
  return now >= window.from && now <= window.to;
}

function readTokenConfig(env = process.env) {
  const mode = MODES.includes(env.CHAOS_TOKEN_MODE) ? env.CHAOS_TOKEN_MODE : 'estatico';
  return {
    mode,
    audience: env.CHAOS_AUDIENCE || 'chaos-gate',
    window: parseWindow(env.CHAOS_WINDOW),
  };
}

module.exports = { mintToken, verifyToken, parseWindow, isWithinWindow, readTokenConfig, MAX_TOKEN_TTL_SECONDS, MODES };
