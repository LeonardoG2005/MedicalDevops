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

// Even business writes go to the v1 route, which both revisions serve, so the
// gate gets a registration success rate on each side to compare. Odd ones go
// to /api/v4, which only the canary knows. Some notes are invalid on purpose
// so the business metric has both outcomes.
function noteRequest(businessCycle, imagenId, valid) {
  const note = {
    paciente: 'Carga de prueba',
    contenido: 'Generado por canary/load.js',
    fecha: new Date().toISOString().slice(0, 10),
    imagen_id: imagenId,
  };
  if (businessCycle % 2 === 0) {
    // v1 rejects unknown fields, so its invalid note is one missing contenido
    const { contenido, ...withoutContent } = note;
    return { path: '/notas-medicas', body: valid ? note : withoutContent };
  }
  const prioridad = valid ? ['baja', 'media', 'alta', 'critica'][Math.floor(Math.random() * 4)] : 'invalida';
  return { path: '/api/v4/notas-medicas', body: { ...note, prioridad } };
}

async function businessCycle(url, headers, outcomes, imagenId, cycle) {
  const { path, body } = noteRequest(cycle, imagenId, Math.random() > 0.15);
  outcomes.push(await request(url, path, headers, 'POST', body));
}

// The business cycle needs a real image id: production ids are not known in
// advance, so the run creates its own image first and uses that one.
async function ensureImagen(url) {
  const response = await fetch(`${url}/imagenes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nombre: 'imagen-canary-load.jpg',
      url: 'https://example.com/imagen-canary-load.jpg',
      fecha_creacion: new Date().toISOString().slice(0, 10),
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not create the load test image: HTTP ${response.status}`);
  }
  return (await response.json()).id;
}

function headersFor(fault) {
  return fault ? { 'x-fault': fault } : {};
}

async function run({ url, durationSeconds, threads, fault, businessEvery, imagenId }) {
  const headers = headersFor(fault);
  const outcomes = [];
  const deadline = Date.now() + durationSeconds * 1000;
  let cycles = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      cycles += 1;
      if (businessEvery > 0 && cycles % businessEvery === 0) {
        await businessCycle(url, headers, outcomes, imagenId, cycles / businessEvery);
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

  const imagenId = await ensureImagen(args.url);
  const outcomes = await run({
    url: args.url,
    durationSeconds: Number(args.duration),
    threads: Number(args.threads),
    fault: args.fault,
    businessEvery: Number(args['business-every']),
    imagenId,
  });
  printSummary(outcomes, Number(args.duration));
}

if (require.main === module) {
  main();
}

module.exports = { percentile, tally, run, noteRequest };
