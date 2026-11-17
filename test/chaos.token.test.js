const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase } = require('./helpers');
const { mintToken, verifyToken, parseWindow, isWithinWindow } = require('../src/chaos/token');

const KEY = 'clave-compartida-de-prueba-0123456789';

test.before(async () => { await resetDatabase(); });

test.beforeEach(() => {
  process.env.CHAOS_ENABLED = 'true';
  process.env.CHAOS_TOKEN = KEY;
  delete process.env.CHAOS_TOKEN_MODE;
  delete process.env.CHAOS_WINDOW;
  delete process.env.CHAOS_AUDIENCE;
});
test.after(() => {
  delete process.env.CHAOS_ENABLED; delete process.env.CHAOS_TOKEN;
  delete process.env.CHAOS_TOKEN_MODE; delete process.env.CHAOS_WINDOW; delete process.env.CHAOS_AUDIENCE;
});

test('Token: un token efimero valido se acepta y uno vencido, alterado o de otra audiencia se rechaza', () => {
  const now = Date.now();
  const token = mintToken({ key: KEY, audience: 'chaos-gate', ttlSeconds: 60, now });

  assert.equal(verifyToken(token, { key: KEY, audience: 'chaos-gate', now }).ok, true);
  assert.equal(verifyToken(token, { key: KEY, audience: 'chaos-gate', now: now + 61_000 }).motivo, 'token_expirado');
  assert.equal(verifyToken(token, { key: KEY, audience: 'demo', now }).motivo, 'audiencia_invalida');
  assert.equal(verifyToken(`${token.slice(0, -2)}xx`, { key: KEY, audience: 'chaos-gate', now }).motivo, 'firma_invalida');
  assert.equal(verifyToken(token, { key: 'otra-clave-distinta-0123456789', audience: 'chaos-gate', now }).motivo, 'firma_invalida');
  assert.equal(verifyToken('v2.a.b', { key: KEY, now }).motivo, 'token_malformado');
  assert.equal(verifyToken('', { key: KEY }).motivo, 'token_ausente');
});

test('Token: el TTL se limita a 15 minutos', () => {
  const now = Date.now();
  const token = mintToken({ key: KEY, audience: 'chaos-gate', ttlSeconds: 99999, now });
  const expira = Number(token.split('.')[2]);
  assert.ok(expira <= Math.floor(now / 1000) + 900);
});

test('Token: en modo estatico el secreto compartido sirve; en modo efimero se rechaza en la red', () => {
  assert.equal(verifyToken(KEY, { key: KEY, mode: 'estatico' }).ok, true);
  assert.equal(verifyToken(KEY, { key: KEY, mode: 'efimero' }).motivo, 'token_estatico_rechazado');
  assert.equal(verifyToken('x'.repeat(KEY.length), { key: KEY, mode: 'estatico' }).motivo, 'token_invalido');
});

test('Ventana: fuera del intervalo acordado no se permite', () => {
  const window = parseWindow('2026-11-18T08:00:00-05:00/2026-11-18T12:00:00-05:00');
  assert.equal(isWithinWindow(window, Date.parse('2026-11-18T10:00:00-05:00')), true);
  assert.equal(isWithinWindow(window, Date.parse('2026-11-18T13:00:00-05:00')), false);
  assert.equal(isWithinWindow(null, 0), true);
  assert.throws(() => parseWindow('2026-11-18T12:00:00Z/2026-11-18T08:00:00Z'), /CHAOS_WINDOW/);
});

test('Ronda 0 del interruptor: el secreto estatico abre la puerta desde cualquier origen y a cualquier hora', async () => {
  const app = await buildApp({ chaos: { cacheTtlMs: 0 } });
  const r = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': KEY, 'user-agent': 'atacante/1.0' } });
  assert.equal(r.statusCode, 200);
});

test('Ronda 1 del interruptor: solo tokens efimeros con la audiencia correcta, dentro de la ventana', async () => {
  process.env.CHAOS_TOKEN_MODE = 'efimero';
  process.env.CHAOS_AUDIENCE = 'chaos-gate';
  const app = await buildApp({ chaos: { cacheTtlMs: 0 } });

  const estatico = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': KEY } });
  assert.equal(estatico.statusCode, 401);
  assert.equal(estatico.json().motivo, 'token_estatico_rechazado');

  const otraAud = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': mintToken({ key: KEY, audience: 'demo' }) } });
  assert.equal(otraAud.json().motivo, 'audiencia_invalida');

  const bueno = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': mintToken({ key: KEY, audience: 'chaos-gate', ttlSeconds: 60 }) } });
  assert.equal(bueno.statusCode, 200);

  const vencido = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': mintToken({ key: KEY, audience: 'chaos-gate', ttlSeconds: 1, now: Date.now() - 10_000 }) } });
  assert.equal(vencido.json().motivo, 'token_expirado');
});

test('Ventana en la API: con CHAOS_WINDOW en el pasado toda llamada responde 403', async () => {
  process.env.CHAOS_WINDOW = '2026-01-01T00:00:00Z/2026-01-01T01:00:00Z';
  const app = await buildApp({ chaos: { cacheTtlMs: 0 } });
  const r = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': KEY } });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().motivo, 'fuera_de_ventana');
});
