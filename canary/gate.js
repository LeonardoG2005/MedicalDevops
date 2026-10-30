#!/usr/bin/env node
'use strict';

/*
 * Quality gate for the canary: compares the canary revision against the
 * stable one and decides whether to promote, pause or abort, following
 * canary/slo.json.
 *
 * Usage: node canary/gate.js --canary REVISION --stable REVISION [--window 5]
 * Exit code: 0 promote, 10 pause, 20 abort. The promote/rollback workflows
 * read it to decide whether to move on to the next stage.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PROMOTE = 'PROMOTE';
const PAUSE = 'PAUSE';
const ABORT = 'ABORT';
const EXIT_CODES = { [PROMOTE]: 0, [PAUSE]: 10, [ABORT]: 20 };

function emptyMeasurement() {
  return {
    requests: 0,
    errors5xx: 0,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    cpu: null,
    memory: null,
    registered: 0,
    rejected: 0,
  };
}

function errorRate(m) {
  return m.requests ? m.errors5xx / m.requests : 0;
}

function successRate(m) {
  const attempts = m.registered + m.rejected;
  return attempts ? m.registered / attempts : null;
}

function ratio(canaryValue, stableValue) {
  if (canaryValue == null || !stableValue) return 0;
  return canaryValue / stableValue;
}

function isWorse(canary, stable, timesMax, diffMinMs) {
  if (canary.p95Ms == null || stable.p95Ms == null) return false;
  return ratio(canary.p95Ms, stable.p95Ms) > timesMax && canary.p95Ms - stable.p95Ms > diffMinMs;
}

function registeredDrop(canary, stable) {
  const canaryRate = successRate(canary);
  const stableRate = successRate(stable);
  if (canaryRate == null || stableRate == null) return 0;
  return stableRate - canaryRate;
}

// Pure decision function: easy to unit test without touching Cloud Monitoring.
function decide(slo, canary, stable) {
  if (canary.requests < slo.muestraMinima.peticionesCanary) {
    return {
      decision: PAUSE,
      reasons: [`not enough samples: ${canary.requests} requests on the canary, minimum ${slo.muestraMinima.peticionesCanary}`],
    };
  }

  const { abortar: ab, promover: pr, saturacion: sat } = slo;
  const baselineValid = stable.requests >= slo.muestraMinima.peticionesStable;
  const minRegistros = slo.muestraMinima.registros;
  const registroValido = baselineValid
    && canary.registered + canary.rejected >= minRegistros
    && stable.registered + stable.rejected >= minRegistros;

  const abortReasons = [];
  if (registroValido && registeredDrop(canary, stable) > ab.registroCaidaMax) {
    abortReasons.push('success rate dropped too far against the stable revision');
  }
  if (errorRate(canary) > ab.tasaError5xxMax) {
    abortReasons.push(`5xx errors ${(errorRate(canary) * 100).toFixed(1)}% > ${(ab.tasaError5xxMax * 100).toFixed(1)}%`);
  }
  if (canary.p95Ms != null && canary.p95Ms > ab.latenciaP95MsMax) {
    abortReasons.push(`p95 ${canary.p95Ms.toFixed(0)} ms > ${ab.latenciaP95MsMax} ms`);
  }
  if (baselineValid && isWorse(canary, stable, ab.p95VsStableMax, ab.p95DiferenciaMinMs)) {
    abortReasons.push(`p95 ${ratio(canary.p95Ms, stable.p95Ms).toFixed(1)}x the stable one (limit ${ab.p95VsStableMax})`);
  }
  if (abortReasons.length) {
    return { decision: ABORT, reasons: abortReasons };
  }

  const pauseReasons = [];
  if (errorRate(canary) > pr.tasaError5xxMax) {
    pauseReasons.push(`5xx errors ${(errorRate(canary) * 100).toFixed(1)}% > ${(pr.tasaError5xxMax * 100).toFixed(1)}%`);
  }
  if (baselineValid && errorRate(canary) - errorRate(stable) > pr.errorExtraMax) {
    pauseReasons.push('more errors than the stable revision in the same window');
  }
  if (canary.p95Ms != null && canary.p95Ms > pr.latenciaP95MsMax) {
    pauseReasons.push(`p95 ${canary.p95Ms.toFixed(0)} ms > ${pr.latenciaP95MsMax} ms`);
  }
  if (canary.p99Ms != null && canary.p99Ms > pr.latenciaP99MsMax) {
    pauseReasons.push(`p99 ${canary.p99Ms.toFixed(0)} ms > ${pr.latenciaP99MsMax} ms`);
  }
  if (baselineValid && isWorse(canary, stable, pr.p95VsStableMax, pr.p95DiferenciaMinMs)) {
    pauseReasons.push('p95 above the limit relative to the stable revision');
  }
  if (registroValido && registeredDrop(canary, stable) > pr.registroCaidaMax) {
    pauseReasons.push('success rate dropped against the stable revision');
  }
  if (canary.cpu != null && canary.cpu > sat.cpuMax) {
    pauseReasons.push(`CPU ${(canary.cpu * 100).toFixed(0)}% > ${(sat.cpuMax * 100).toFixed(0)}%`);
  }
  if (canary.memory != null && canary.memory > sat.memoriaMax) {
    pauseReasons.push(`memory ${(canary.memory * 100).toFixed(0)}% > ${(sat.memoriaMax * 100).toFixed(0)}%`);
  }

  if (pauseReasons.length) {
    return { decision: PAUSE, reasons: pauseReasons };
  }
  return { decision: PROMOTE, reasons: ['every promotion threshold is met'] };
}

// --- Cloud Monitoring (PromQL compatible API) ---

function accessToken() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
}

async function queryPromQL(project, promql, token) {
  const url = `https://monitoring.googleapis.com/v1/projects/${project}/location/global/prometheus/api/v1/query?${new URLSearchParams({ query: promql })}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  const result = body?.data?.result;
  if (!result?.length) return null;
  const value = Number(result[0].value[1]);
  return Number.isNaN(value) ? null : value;
}

async function measure(project, service, revision, windowMin, token) {
  const filter = `monitored_resource="cloud_run_revision",service_name="${service}",revision_name="${revision}"`;
  const window = `${windowMin}m`;

  const percentile = (metric, q) => queryPromQL(
    project,
    `histogram_quantile(${q}, sum by (le) (increase(run_googleapis_com:${metric}_bucket{${filter}}[${window}])))`,
    token,
  );
  const count = (extra = '') => queryPromQL(
    project,
    `sum(increase(run_googleapis_com:request_count{${filter}${extra}}[${window}]))`,
    token,
  ).then((value) => value || 0);
  const notes = (extra = '') => queryPromQL(
    project,
    `sum(increase(logging_googleapis_com:user_medical_api_notas_registradas{monitored_resource="cloud_run_revision",revision_name="${revision}"${extra}}[${window}]))`,
    token,
  ).then((value) => value || 0);

  const [requests, errors5xx, p50Ms, p95Ms, p99Ms, cpu, memory, registered, rejected] = await Promise.all([
    count(),
    count(',response_code_class="5xx"'),
    percentile('request_latencies', 0.50),
    percentile('request_latencies', 0.95),
    percentile('request_latencies', 0.99),
    percentile('container_cpu_utilizations', 0.95),
    percentile('container_memory_utilizations', 0.95),
    notes(',resultado="registrada"'),
    notes(',resultado="rechazada"'),
  ]);

  return { requests, errors5xx, p50Ms, p95Ms, p99Ms, cpu, memory, registered, rejected };
}

function summaryLine(label, m) {
  const fmt = (value, digits) => (value == null ? '-' : value.toFixed(digits));
  const rate = successRate(m);
  return `${label.padEnd(8)} ${String(m.requests).padStart(8)} `
    + `${(errorRate(m) * 100).toFixed(2).padStart(6)}% ${fmt(m.p50Ms, 0).padStart(7)} `
    + `${fmt(m.p95Ms, 0).padStart(7)} ${fmt(m.p99Ms, 0).padStart(7)} `
    + `${m.cpu == null ? '-' : (m.cpu * 100).toFixed(0) + '%'} `
    + `${rate == null ? '-' : (rate * 100).toFixed(0) + '%'}`;
}

async function main() {
  const args = require('node:util').parseArgs({
    options: {
      project: { type: 'string', default: 'project-40fc41d1-6899-4ce0-9ef' },
      service: { type: 'string', default: 'medical-documents-api' },
      canary: { type: 'string' },
      stable: { type: 'string' },
      window: { type: 'string', default: '5' },
      slo: { type: 'string', default: path.join(__dirname, 'slo.json') },
    },
  }).values;

  if (!args.canary || !args.stable) {
    console.error('Usage: node canary/gate.js --canary REVISION --stable REVISION');
    return 1;
  }

  const slo = require(path.resolve(args.slo));
  const token = accessToken();
  const windowMin = Number(args.window);
  const [canary, stable] = await Promise.all([
    measure(args.project, args.service, args.canary, windowMin, token),
    measure(args.project, args.service, args.stable, windowMin, token),
  ]);

  const { decision, reasons } = decide(slo, canary, stable);
  console.log(summaryLine('stable', stable));
  console.log(summaryLine('canary', canary));
  console.log(`\nDECISION: ${decision}`);
  reasons.forEach((reason) => console.log(`  - ${reason}`));
  return EXIT_CODES[decision];
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  decide, emptyMeasurement, errorRate, successRate, measure, summaryLine,
  PROMOTE, PAUSE, ABORT, EXIT_CODES,
};
