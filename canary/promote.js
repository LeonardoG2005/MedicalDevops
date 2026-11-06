#!/usr/bin/env node
'use strict';

/*
 * Promotes the canary by stages and aborts as soon as one stage fails.
 *
 * Each stage raises the traffic percentage, runs load for the bake time,
 * measures both revisions and asks the quality gate (canary/gate.js,
 * thresholds in canary/slo.json) what to do. If a stage does not pass,
 * traffic goes back to 0 % canary / 100 % stable and the process exits with
 * an error so the workflow run is marked as failed.
 *
 * Usage, from the repository root:
 *   node canary/promote.js --url URL --canary REV --stable REV \
 *     --stages 10,50,100 --bake 3 [--fault "error=0.5"]
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const gate = require('./gate');

const EXIT_OK = 0;
const EXIT_ABORTED = 20;
// Cloud Run publishes request_count once a minute and increase() needs two
// samples inside the window, so a 1 minute window always comes back empty
const MIN_WINDOW_MIN = 3;

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Everything that touches the outside world, replaced with fakes in tests.
function buildEnvironment(args) {
  return {
    setTraffic: (split) => {
      const assignment = Object.entries(split).map(([revision, percent]) => `${revision}=${percent}`).join(',');
      execFileSync('gcloud', [
        'run', 'services', 'update-traffic', args.service,
        `--project=${args.project}`, `--region=${args.region}`,
        `--to-revisions=${assignment}`,
      ], { stdio: 'inherit' });
    },
    generateLoad: (seconds) => execFileSync(process.execPath, [
      path.join(__dirname, 'load.js'),
      '--url', args.url, '--duration', String(seconds), '--fault', args.fault || '',
    ], { stdio: 'inherit' }),
    measure: async (windowMin) => {
      const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
      const [canary, stable] = await Promise.all([
        gate.measure(args.project, args.service, args.canary, windowMin, token),
        gate.measure(args.project, args.service, args.stable, windowMin, token),
      ]);
      return { canary, stable };
    },
    sleep,
  };
}

function summary(canary, stable, decision, reasons) {
  return [
    gate.summaryLine('stable', stable),
    gate.summaryLine('canary', canary),
    `  -> ${decision}: ${reasons.join('; ')}`,
  ].join('\n');
}

async function promote(slo, stages, bakeMin, metricsWaitSeconds, canaryRevision, stableRevision, env, log = console.log) {
  const { pausa } = slo;

  for (const percent of stages) {
    log(`\n=== Stage ${percent}% canary, ${bakeMin} min bake ===`);
    await env.setTraffic({ [stableRevision]: 100 - percent, [canaryRevision]: percent });
    await env.generateLoad(bakeMin * 60);
    // Cloud Monitoring takes a moment to publish what just happened
    await env.sleep(metricsWaitSeconds);

    const warmup = slo.calentamientoSegundos || 0;
    const bakeWindowMin = Math.max(MIN_WINDOW_MIN, Math.ceil((bakeMin * 60 - warmup + metricsWaitSeconds) / 60));
    const retryMin = Math.ceil((pausa.esperaSegundos + metricsWaitSeconds) / 60);

    let decision;
    let reasons;
    for (let attempt = 0; attempt <= pausa.reintentosMax; attempt += 1) {
      // A PAUSE adds load to grow the sample, so the window has to grow with
      // it; otherwise the earlier load slides out and the count never adds up
      let { canary, stable } = await env.measure(bakeWindowMin + attempt * retryMin);
      if (percent >= 100) {
        // No baseline in parallel anymore: comparing against it would judge
        // the canary against a past window, not the current one
        stable = gate.emptyMeasurement();
      }
      ({ decision, reasons } = gate.decide(slo, canary, stable));
      log(summary(canary, stable, decision, reasons));
      if (decision !== gate.PAUSE) break;
      if (attempt === pausa.reintentosMax) {
        decision = gate.ABORT;
        reasons = [`not enough evidence after ${attempt + 1} evaluations`];
        log(`  -> ${reasons[0]}`);
        break;
      }
      log(`  -> PAUSE: re-evaluating in ${pausa.esperaSegundos}s with more load`);
      await env.generateLoad(pausa.esperaSegundos);
      await env.sleep(metricsWaitSeconds);
    }

    if (decision === gate.ABORT) {
      log('\nABORTED: 0% canary, 100% stable');
      await env.setTraffic({ [stableRevision]: 100, [canaryRevision]: 0 });
      return EXIT_ABORTED;
    }
    log(`Stage ${percent}% passed`);
  }

  log(`\nPROMOTED: the canary serves ${stages[stages.length - 1]}% of traffic`);
  return EXIT_OK;
}

async function main() {
  const args = require('node:util').parseArgs({
    options: {
      url: { type: 'string' },
      canary: { type: 'string' },
      stable: { type: 'string' },
      stages: { type: 'string', default: '10,50,100' },
      bake: { type: 'string', default: '4' },
      'metrics-wait': { type: 'string', default: '90' },
      fault: { type: 'string', default: '' },
      project: { type: 'string', default: 'project-40fc41d1-6899-4ce0-9ef' },
      region: { type: 'string', default: 'us-central1' },
      service: { type: 'string', default: 'medical-documents-api' },
      slo: { type: 'string', default: path.join(__dirname, 'slo.json') },
    },
  }).values;

  if (!args.url || !args.canary || !args.stable) {
    console.error('Usage: node canary/promote.js --url URL --canary REV --stable REV');
    return 1;
  }

  const slo = require(path.resolve(args.slo));
  const stages = args.stages.split(',').map(Number);
  return promote(slo, stages, Number(args.bake), Number(args['metrics-wait']), args.canary, args.stable, buildEnvironment(args));
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { promote, buildEnvironment };
