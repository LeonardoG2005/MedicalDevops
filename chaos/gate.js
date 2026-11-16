#!/usr/bin/env node
// Puerta de calidad del experimento (chaos gate). Lee el resumen que escribe
// k6 (handleSummary) y el diario de Chaos Toolkit, los compara con
// chaos/slo.json y termina con codigo 1 si la metrica objetivo no cumple.
// decide() es pura y se prueba sola; main() solo lee archivos e imprime.
//
//   node chaos/gate.js --k6 chaos/results/k6-ronda-0.json --journal chaos/results/journal-ronda-0.json [--slo chaos/slo.json]
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// A missing or truncated file counts as "no evidence" (the gate rejects it),
// never as a crash of the gate itself
function leerJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`No se pudo leer ${file}: ${error.message}`);
    return null;
  }
}

function resumirK6(summary) {
  const metricas = summary?.metrics || {};
  const valor = (nombre, clave) => metricas[nombre]?.values?.[clave];
  const umbralesRotos = [];
  for (const [nombre, metrica] of Object.entries(metricas)) {
    for (const [expresion, estado] of Object.entries(metrica.thresholds || {})) {
      if (estado && estado.ok === false) umbralesRotos.push(`${nombre}: ${expresion}`);
    }
  }
  return {
    peticiones: valor('http_reqs', 'count') ?? 0,
    p95_ms: valor('http_req_duration', 'p(95)') ?? null,
    p99_ms: valor('http_req_duration', 'p(99)') ?? null,
    error_rate: valor('http_req_failed', 'rate') ?? null,
    degradado_rate: valor('flujo_degradado', 'rate') ?? null,
    circuito_abierto_rate: valor('flujo_circuito_abierto', 'rate') ?? null,
    angel_p95_ms: valor('dependencia_angel_ms', 'p(95)') ?? null,
    umbrales_rotos: umbralesRotos,
  };
}

function resumirJournal(journal) {
  if (!journal) return null;
  const rollbacks = journal.rollbacks || [];
  return {
    status: journal.status || 'desconocido',
    deviated: journal.deviated === true,
    rollbacks_fallidos: rollbacks.filter((r) => r.status && r.status !== 'succeeded').map((r) => r.activity?.name || 'rollback'),
    estado_estable_antes: journal['steady_states']?.before?.steady_state_met ?? null,
    estado_estable_despues: journal['steady_states']?.after?.steady_state_met ?? null,
  };
}

// Veredicto: APROBADO solo si hubo carga suficiente, ningun umbral de k6 se
// rompio, la metrica objetivo y la de guarda cumplen el SLO, y el diario de
// Chaos Toolkit no registra desviacion ni rollbacks fallidos. Cualquier dato
// ausente cuenta como fallo: la puerta nunca aprueba por falta de evidencia.
function decide({ summary, journal, slo }) {
  const razones = [];
  const k6 = summary ? resumirK6(summary) : null;
  const ctk = resumirJournal(journal);

  if (!k6) {
    razones.push('No existe el resumen de k6: la carga no se ejecuto o no escribio resultados');
  } else {
    if (k6.peticiones < (slo.peticiones_minimas ?? 1)) razones.push(`Muestra insuficiente: ${k6.peticiones} peticiones (minimo ${slo.peticiones_minimas})`);
    if (k6.p95_ms === null) razones.push('k6 no reporta p95');
    else if (k6.p95_ms >= slo.p95_ms) razones.push(`p95 ${k6.p95_ms.toFixed(0)} ms supera el umbral de ${slo.p95_ms} ms`);
    if (k6.error_rate === null) razones.push('k6 no reporta tasa de error');
    else if (k6.error_rate >= slo.error_rate_max) razones.push(`Tasa de error ${(k6.error_rate * 100).toFixed(2)} % supera el ${(slo.error_rate_max * 100).toFixed(2)} %`);
    for (const umbral of k6.umbrales_rotos) razones.push(`Umbral de k6 incumplido: ${umbral}`);
  }

  if (!ctk) {
    razones.push('No existe el diario de Chaos Toolkit: el experimento no se ejecuto');
  } else {
    if (ctk.status !== 'completed') razones.push(`El experimento termino con estado "${ctk.status}"`);
    if (ctk.deviated) razones.push('Chaos Toolkit marco el experimento como desviado: la hipotesis se refuto');
    for (const nombre of ctk.rollbacks_fallidos) razones.push(`Rollback fallido: ${nombre}`);
  }

  return {
    veredicto: razones.length === 0 ? 'APROBADO' : 'RECHAZADO',
    razones,
    k6,
    chaos_toolkit: ctk,
    slo: { p95_ms: slo.p95_ms, error_rate_max: slo.error_rate_max, peticiones_minimas: slo.peticiones_minimas },
  };
}

function fmt(value, digits = 0, suffix = '') {
  if (value === null || value === undefined) return 'n/d';
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function renderMarkdown(resultado, ronda) {
  const k6 = resultado.k6 || {};
  const ctk = resultado.chaos_toolkit || {};
  const lineas = [
    `### Chaos gate (ronda ${ronda ?? '?'}): ${resultado.veredicto}`,
    '',
    '| Metrica | Valor | Umbral |',
    '|---|---|---|',
    `| p95 del flujo | ${fmt(k6.p95_ms, 0, ' ms')} | < ${resultado.slo.p95_ms} ms |`,
    `| p99 del flujo | ${fmt(k6.p99_ms, 0, ' ms')} | |`,
    `| Tasa de error | ${fmt(k6.error_rate === null ? null : k6.error_rate * 100, 2, ' %')} | < ${(resultado.slo.error_rate_max * 100).toFixed(2)} % |`,
    `| Respuestas degradadas | ${fmt(k6.degradado_rate === null ? null : k6.degradado_rate * 100, 2, ' %')} | informativo |`,
    `| Circuito abierto | ${fmt(k6.circuito_abierto_rate === null ? null : k6.circuito_abierto_rate * 100, 2, ' %')} | informativo |`,
    `| p95 dependencia Angel | ${fmt(k6.angel_p95_ms, 0, ' ms')} | informativo |`,
    `| Peticiones | ${fmt(k6.peticiones)} | >= ${resultado.slo.peticiones_minimas} |`,
    `| Chaos Toolkit | ${ctk.status ?? 'n/d'}${ctk.deviated ? ' (desviado)' : ''} | completed, no desviado |`,
    '',
  ];
  if (resultado.razones.length) {
    lineas.push('Motivos:');
    for (const razon of resultado.razones) lineas.push(`- ${razon}`);
    lineas.push('');
  }
  return lineas.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ronda = args.ronda || process.env.RONDA;
  const k6File = args.k6 || (ronda !== undefined ? `chaos/results/k6-ronda-${ronda}.json` : null);
  const journalFile = args.journal || (ronda !== undefined ? `chaos/results/journal-ronda-${ronda}.json` : null);
  const slo = leerJson(args.slo || path.join(__dirname, 'slo.json'));
  const resultado = decide({ summary: leerJson(k6File), journal: leerJson(journalFile), slo });
  const markdown = renderMarkdown(resultado, ronda);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(resultado, null, 2));
  process.exit(resultado.veredicto === 'APROBADO' ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { decide, resumirK6, resumirJournal, renderMarkdown };
