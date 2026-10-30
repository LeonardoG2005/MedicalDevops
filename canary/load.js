#!/usr/bin/env node
'use strict';

/*
 * Concurrent load generator to compare stable and canary.
 *
 * Sends parallel requests to the service URL and groups what it sees by the
 * X-Track header. Serves three purposes: checking the real traffic split
 * between revisions, comparing latency under the same load, and gathering
 * enough requests for the quality gate to decide with data.
 *
 * Usage:
 *   node canary/load.js --url https://... --duration 120 --threads 10
 *   node canary/load.js --url https://... --fault "error=0.5"
 */

// Read-only routes common to both versions, so the traffic split does not
// depend on one revision knowing a route the other does not
const READ_ROUTES = ['/notas-medicas', '/imagenes', '/documentos-generados', '/api/v2/imagenes/random'];

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[index];
}

// Groups raw request outcomes by track, with totals, error counts and latencies.
function tally(outcomes) {
  const byTrack = {};
  for (const outcome of outcomes) {
    const track = outcome.track || 'desconocido';
    byTrack[track] ||= { total: 0, errors: 0, latencies: [] };
    byTrack[track].total += 1;
    byTrack[track].latencies.push(outcome.latencyMs);
    if (outcome.statusCode >= 500) byTrack[track].errors += 1;
  }
  return Object.fromEntries(
    Object.entries(byTrack).map(([track, stats]) => [track, {
      total: stats.total,
      errors: stats.errors,
      p50Ms: percentile(stats.latencies, 0.5),
      p95Ms: percentile(stats.latencies, 0.95),
    }]),
  );
}

function printSummary(outcomes, seconds) {
  const stats = tally(outcomes);
  console.log(`\n${outcomes.length} requests in ${seconds}s`);
  for (const [track, { total, errors, p50Ms, p95Ms }] of Object.entries(stats)) {
    console.log(`  ${track.padEnd(10)} total=${total} errors=${errors} p50=${p50Ms.toFixed(0)}ms p95=${p95Ms.toFixed(0)}ms`);
  }
}

async function request(url, path, headers, method = 'GET', body) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      statusCode: response.status,
      track: response.headers.get('x-track'),
      latencyMs: performance.now() - startedAt,
    };
  } catch {
    return { statusCode: 0, track: null, latencyMs: performance.now() - startedAt };
  }
}

async function readCycle(url, headers, outcomes) {
  const path = READ_ROUTES[Math.floor(Math.random() * READ_ROUTES.length)];
  outcomes.push(await request(url, path, headers));
}

// Writes a note under /api/v3, with a deliberately invalid priority once in a
// while so the registration business metric has both outcomes to compare.
async function businessCycle(url, headers, outcomes, imagenId) {
  const valid = Math.random() > 0.15;
  const payload = {
    paciente: 'Carga de prueba',
    contenido: 'Generado por canary/load.js',
    fecha: new Date().toISOString().slice(0, 10),
    imagen_id: imagenId,
    prioridad: valid ? ['baja', 'media', 'alta', 'critica'][Math.floor(Math.random() * 4)] : 'invalida',
  };
  outcomes.push(await request(url, '/api/v3/notas-medicas', headers, 'POST', payload));
}

async function ensureImagen(url, headers) {
  const outcome = await request(url, '/imagenes', headers, 'POST', {
    nombre: 'imagen-canary-load.jpg',
    url: 'https://example.com/imagen-canary-load.jpg',
    fecha_creacion: new Date().toISOString().slice(0, 10),
  });
  return outcome;
}

function headersFor(fault) {
  return fault ? { 'x-fault': fault } : {};
}

async function run({ url, durationSeconds, threads, fault, businessEvery }) {
  const headers = headersFor(fault);
  const outcomes = [];
  const deadline = Date.now() + durationSeconds * 1000;
  let cycles = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      cycles += 1;
      if (businessEvery > 0 && cycles % businessEvery === 0) {
        await businessCycle(url, headers, outcomes, 1);
      } else {
        await readCycle(url, headers, outcomes);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  await Promise.all(Array.from({ length: threads }, worker));
  return outcomes;
}

async function main() {
  const args = require('node:util').parseArgs({
    options: {
      url: { type: 'string' },
      duration: { type: 'string', default: '60' },
      threads: { type: 'string', default: '8' },
      fault: { type: 'string', default: '' },
      'business-every': { type: 'string', default: '5' },
    },
  }).values;

  if (!args.url) {
    console.error('Usage: node canary/load.js --url https://... [--duration 60] [--threads 8]');
    process.exit(1);
  }

  await ensureImagen(args.url, headersFor(args.fault));
  const outcomes = await run({
    url: args.url,
    durationSeconds: Number(args.duration),
    threads: Number(args.threads),
    fault: args.fault,
    businessEvery: Number(args['business-every']),
  });
  printSummary(outcomes, Number(args.duration));
}

if (require.main === module) {
  main();
}

module.exports = { percentile, tally, run };
