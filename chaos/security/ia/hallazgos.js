#!/usr/bin/env node
// Arma la entrada de la IA de defensa con la evidencia real de los cuatro
// experimentos del game day del grupo. Solo copia hechos medidos (horas,
// estados, MTTD, MTTC, RPO, RTO, bitacoras) y anota de que archivo sale cada
// uno, para que el contraste humano pueda verificar cada afirmacion del modelo.
//
//   node chaos/security/ia/hallazgos.js \
//     --angel <ruta a Api_Pet_Adoption/chaos/security/results> \
//     --juan  <ruta a clic_kiusys/chaos/security/results> \
//     --salida chaos/security/results/hallazgos-grupo.json
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  }
  return a;
}

function leer(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

const NUESTROS = path.join(__dirname, '..', 'results');

function exp1() {
  const fuente = (r) => `MedicalDevops/chaos/security/results/exp1-ronda-${r}.json`;
  return ['0', '1'].map((r) => {
    const d = leer(path.join(NUESTROS, `exp1-ronda-${r}.json`));
    if (!d) return null;
    return {
      fuente: fuente(r),
      ronda: r,
      pruebas: Object.fromEntries(Object.entries(d.pruebas || {}).map(([k, v]) => [k, { t: v.t, status: v.status ?? null, motivo: v.motivo ?? null, contenido: v.control_contuvo ?? null, leido: v.leido ?? null }])),
      detecciones: d.detecciones || null,
      bitacora: (d.bitacora || []).map((b) => ({ t: b.t, evento: b.evento, caso: b.caso || null, status: b.status ?? null, motivo: b.motivo ?? null })),
    };
  }).filter(Boolean);
}

function exp2(dir) {
  return ['0', '1'].map((r) => {
    const d = dir && leer(path.join(dir, `exp2-ronda-${r}.json`));
    if (!d) return null;
    return {
      fuente: `Api_Pet_Adoption/chaos/security/results/exp2-ronda-${r}.json`,
      ronda: r,
      // El resumen por tecnica esta en "resumen" (en versiones previas, en "mediciones")
      tecnicas: (d.resumen?.tecnicas || d.mediciones?.tecnicas || []).map((t) => ({ caso: t.caso, attack: t.attack, t_inicio: t.t_inicio, expuesto: t.expuesto, senales: t.senales, detectado: t.detectado, detectado_por: t.detectado_por, mttd_s: t.mttd_s, contenido: t.contenido, mttc_s: t.mttc_s })),
      salida: d.salida ? { prohibido_conecta: d.salida.prohibido_conecta, permitido_conecta: d.salida.permitido_conecta } : null,
      bitacora: (d.bitacora || []).map((b) => ({ t: b.t, evento: b.evento, detalle: b.detalle || b.caso || null })),
    };
  }).filter(Boolean);
}

function exp3(dir) {
  const d = dir && leer(path.join(dir, 'game-day.json'));
  if (!d) return null;
  return { fuente: 'clic_kiusys/chaos/security/results/game-day.json', ...d };
}

function exp4() {
  return ['0', '1'].map((r) => {
    const d = leer(path.join(NUESTROS, `exp4-ronda-${r}.json`));
    if (!d) return null;
    return {
      fuente: `MedicalDevops/chaos/security/results/exp4-ronda-${r}.json`,
      ronda: r,
      destruccion: d.destruccion || null,
      restauracion: d.restauracion || null,
      worm_copia: d.worm_copia || null,
      bitacora: (d.bitacora || []).map((b) => ({ t: b.t, evento: b.evento })),
    };
  }).filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const hallazgos = {
    generado: new Date().toISOString(),
    nota: 'Evidencia real del game day del grupo MedicalDevOps. Cada bloque cita su archivo de origen.',
    experimento_1_identidad_gcp: exp1(),
    experimento_2_red_aws: exp2(args.angel),
    experimento_3_telemetria_oci: exp3(args.juan),
    experimento_4_datos_gcp: exp4(),
  };
  const salida = args.salida || path.join(NUESTROS, 'hallazgos-grupo.json');
  fs.writeFileSync(salida, JSON.stringify(hallazgos, null, 2));
  const n = (x) => (Array.isArray(x) ? x.length : (x ? 1 : 0));
  console.log(JSON.stringify({ ok: true, salida, rondas: { exp1: n(hallazgos.experimento_1_identidad_gcp), exp2: n(hallazgos.experimento_2_red_aws), exp3: n(hallazgos.experimento_3_telemetria_oci), exp4: n(hallazgos.experimento_4_datos_gcp) } }));
}

if (require.main === module) main();
