#!/usr/bin/env node
// Sondas y acciones del experimento, usadas por Chaos Toolkit a traves del
// proveedor "process" (mismo comportamiento en Windows y en el runner de CI).
// Cada subcomando imprime un JSON y termina con codigo 0 (tolerancia cumplida)
// o 1 (tolerancia incumplida), que es lo que Chaos Toolkit evalua.
//
//   node chaos/probes.js salud                      GET /health responde 200
//   node chaos/probes.js flujo [--max-ms 2000]      GET /api/v5/flujo/<id> responde 200 en menos de max-ms
//   node chaos/probes.js sin-fallos                 GET /internal/chaos devuelve una lista vacia
//   node chaos/probes.js activar --peer angel --latencia 3000 --ttl 420
//   node chaos/probes.js revertir [--peer angel]
//
// Variables: CHAOS_BASE_URL (o BASE_URL), IMAGEN_ID, CHAOS_TOKEN, RONDA.
const BASE_URL = (process.env.CHAOS_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.CHAOS_TOKEN || '';
const IMAGEN_ID = process.env.IMAGEN_ID || 'random';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function salida(ok, data) {
  console.log(JSON.stringify({ ok, ...data }, null, 2));
  process.exit(ok ? 0 : 1);
}

async function pedir(method, path, { body, auth = false, timeoutMs = 15000 } = {}) {
  const headers = { accept: 'application/json' };
  if (auth) headers['x-chaos-token'] = TOKEN;
  if (body) headers['content-type'] = 'application/json';
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (error) { json = null; }
  return { status: response.status, ms: Date.now() - startedAt, json, text, traceId: response.headers.get('x-trace-id') };
}

const comandos = {
  async salud() {
    const r = await pedir('GET', '/health');
    salida(r.status === 200, { status: r.status, ms: r.ms, cuerpo: r.json });
  },

  async flujo(args) {
    const maxMs = Number(args['max-ms'] || 2000);
    const r = await pedir('GET', `/api/v5/flujo/${args.imagen || IMAGEN_ID}`, { timeoutMs: 30000 });
    const ok = r.status === 200 && r.ms <= maxMs;
    salida(ok, {
      status: r.status,
      ms: r.ms,
      max_ms: maxMs,
      traceId: r.traceId,
      ronda: r.json?.ronda ?? null,
      degradado: r.json?.degradado ?? null,
      dependencias: r.json?.dependencias ?? null,
    });
  },

  async 'sin-fallos'() {
    const r = await pedir('GET', '/internal/chaos', { auth: true });
    const vacio = r.status === 200 && Array.isArray(r.json) && r.json.length === 0;
    salida(vacio, { status: r.status, activos: r.json });
  },

  async activar(args) {
    const body = {
      peer: args.peer || 'angel',
      latency_ms: Number(args.latencia || 0),
      error_rate: Number(args.error || 0),
      ttl_seconds: Number(args.ttl || 420),
      motivo: args.motivo || `experimento ronda ${process.env.RONDA || '?'}`,
    };
    const r = await pedir('POST', '/internal/chaos', { auth: true, body });
    salida(r.status === 201, { status: r.status, fallo: r.json });
  },

  async revertir(args) {
    const path = args.peer ? `/internal/chaos/${args.peer}` : '/internal/chaos';
    const r = await pedir('DELETE', path, { auth: true });
    salida(r.status === 200, { status: r.status, resultado: r.json });
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const comando = comandos[args._[0]];
  if (!comando) {
    console.error(`Comando desconocido: ${args._[0]}. Opciones: ${Object.keys(comandos).join(', ')}`);
    process.exit(2);
  }
  try {
    await comando(args);
  } catch (error) {
    salida(false, { error: error.message, base_url: BASE_URL });
  }
}

main();
