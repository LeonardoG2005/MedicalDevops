#!/usr/bin/env node
// Experimento 4 (grupal, ejecuta Leonardo en GCP): resiliencia de los datos del
// flujo. Los objetos flujo/<traceId>.json del bucket de resultados son los
// datos. El experimento los borra o sobrescribe de forma controlada en una
// nube y mide el RPO (cuanto se pierde) y el RTO (cuanto tarda la restauracion)
// reales. El grupo autorizo explicitamente la perdida de datos sinteticos.
//
//   node chaos/security/exp4-datos/ejecutar.js estado-estable
//   node chaos/security/exp4-datos/ejecutar.js sembrar --n 20
//   node chaos/security/exp4-datos/ejecutar.js destruir --modo borrar|sobrescribir
//   node chaos/security/exp4-datos/ejecutar.js restaurar --desde versiones|copia
//   node chaos/security/exp4-datos/ejecutar.js informe
//
// Variables: FLOW_ARCHIVE_BUCKET (origen), SEC_COPIA_BUCKET (copia aislada),
// CHAOS_BASE_URL, RONDA (0 sin WORM ni copia, 1 con WORM y copia), GCP_PROJECT.
const C = require('../comun');

const BUCKET = process.env.FLOW_ARCHIVE_BUCKET || 'medical-devops-400345348270-results';
const COPIA = process.env.SEC_COPIA_BUCKET || `${BUCKET}-copia-aislada`;
const BASE_URL = (process.env.CHAOS_BASE_URL || 'http://34.123.58.136').replace(/\/$/, '');
const RONDA = process.env.RONDA || '0';
const PREFIJO = 'flujo/';
const archivo = () => `exp4-ronda-${RONDA}.json`;

function listar(bucket, prefijo = PREFIJO) {
  const out = C.gcloud(['storage', 'ls', '--recursive', `gs://${bucket}/${prefijo}**`], { json: false, allowFail: true });
  if (typeof out !== 'string') return [];
  return out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('gs://') && l.endsWith('.json'));
}

const comandos = {
  async 'estado-estable'() {
    const objetos = listar(BUCKET);
    const bucket = C.gcloud(['storage', 'buckets', 'describe', `gs://${BUCKET}`]) || {};
    const copia = C.gcloud(['storage', 'buckets', 'describe', `gs://${COPIA}`], { allowFail: true });
    const estable = {
      t: C.ahora(), ronda: RONDA, objetos_flujo: objetos.length,
      versioning: bucket.versioning?.enabled === true,
      retencion_bloqueada: bucket.retentionPolicy?.isLocked === true,
      retencion_s: bucket.retentionPolicy ? Number(bucket.retentionPolicy.retentionPeriod) : 0,
      copia_aislada: copia && !copia.error ? { existe: true, region: copia.location, versioning: copia.versioning?.enabled === true } : { existe: false },
    };
    const previo = C.leerResultado(archivo()) || {};
    C.guardarResultado(archivo(), { ...previo, estado_estable: estable });
    C.salida(objetos.length >= 0, estable);
  },

  // Genera datos sinteticos ejecutando el flujo varias veces; cada ejecucion
  // deja un objeto flujo/<traceId>.json (requiere una imagen sembrada)
  async sembrar(args) {
    const n = Number(args.n || 20);
    await fetch(`${BASE_URL}/imagenes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre: 'rx_exp4.jpg', url: 'https://example.com/rx_exp4.jpg', fecha_creacion: '2026-11-16' }) }).catch(() => {});
    const ids = [];
    for (let i = 0; i < n; i += 1) {
      const traceId = `exp4-${RONDA}-${Date.now().toString(36)}-${i}`;
      await fetch(`${BASE_URL}/api/v5/flujo/random`, { headers: { 'x-trace-id': traceId }, signal: AbortSignal.timeout(30000) }).catch(() => {});
      ids.push(traceId);
    }
    // El archivo se escribe sin bloquear; esperar la ingesta
    await new Promise((r) => setTimeout(r, 8000));
    C.salida(true, { sembrados: ids.length, objetos_ahora: listar(BUCKET).length });
  },

  // Destruccion controlada. Antes mide el "ultimo respaldo" para el RPO.
  async destruir(args) {
    const modo = args.modo || 'borrar';
    const previo = C.leerResultado(archivo()) || {};
    const bitacora = previo.bitacora || [];
    C.comprobarParada(bitacora);
    const antes = listar(BUCKET);
    const copiaAntes = listar(COPIA);
    const inicio = C.ahora();
    bitacora.push({ t: inicio, evento: 'destruccion_inicio', modo, objetos: antes.length, attack: modo === 'borrar' ? 'T1485' : 'T1486' });

    let resultado;
    if (modo === 'borrar') {
      resultado = C.gcloud(['storage', 'rm', `gs://${BUCKET}/${PREFIJO}**`], { json: false, allowFail: true });
    } else {
      // Sobrescritura: subir basura sobre cada objeto (simula cifrado por ransomware)
      const tmp = require('node:path').join(C.RESULTS_DIR, 'ransom.txt');
      require('node:fs').mkdirSync(C.RESULTS_DIR, { recursive: true });
      require('node:fs').writeFileSync(tmp, 'CIFRADO-POR-SIMULACION-DE-RANSOMWARE');
      resultado = { intentos: [] };
      for (const obj of antes) resultado.intentos.push(C.gcloud(['storage', 'cp', tmp, obj], { json: false, allowFail: true }));
    }
    const fin = C.ahora();
    const despues = listar(BUCKET);
    const bloqueado = typeof resultado === 'object' && JSON.stringify(resultado).match(/retention|locked|Precondition|403/i);
    bitacora.push({ t: fin, evento: 'destruccion_fin', objetos_restantes: despues.length, bloqueado_por_retencion: Boolean(bloqueado) });

    C.guardarResultado(archivo(), {
      ...previo, ronda: RONDA, bitacora,
      destruccion: {
        modo, inicio, fin,
        objetos_antes: antes.length, objetos_despues: despues.length,
        // RPO = objetos del origen que no estaban aun en la copia aislada
        rpo_objetos: Math.max(0, antes.length - copiaAntes.length),
        copia_intacta: listar(COPIA).length,
        worm_contuvo: Boolean(bloqueado),
      },
    });
    C.salida(true, { modo, objetos_antes: antes.length, objetos_despues: despues.length, worm_contuvo: Boolean(bloqueado) });
  },

  // Restauracion y RTO real
  async restaurar(args) {
    const desde = args.desde || (RONDA === '1' ? 'copia' : 'versiones');
    const previo = C.leerResultado(archivo()) || {};
    if (!previo.destruccion) C.salida(false, { error: 'Ejecute "destruir" antes de "restaurar"' });
    const inicio = C.ahora();
    let detalle;
    if (desde === 'copia') {
      detalle = C.gcloud(['storage', 'cp', '--recursive', `gs://${COPIA}/${PREFIJO}**`, `gs://${BUCKET}/${PREFIJO}`], { json: false, allowFail: true });
    } else {
      // Restaurar desde versiones no actuales: por cada objeto borrado queda
      // una version con numero de generacion; se copia la mas reciente de vuelta
      const salida = C.gcloud(['storage', 'ls', '--all-versions', `gs://${BUCKET}/${PREFIJO}**`], { json: false, allowFail: true });
      const generaciones = typeof salida === 'string'
        ? salida.split('\n').map((l) => l.trim()).filter((l) => /#\d+$/.test(l))
        : [];
      // Agrupar por objeto base y quedarse con la generacion mas alta de cada uno
      const porObjeto = new Map();
      for (const g of generaciones) {
        const base = g.replace(/#\d+$/, '');
        const num = Number(g.match(/#(\d+)$/)[1]);
        if (!porObjeto.has(base) || num > porObjeto.get(base).num) porObjeto.set(base, { num, uri: g });
      }
      const copiados = [];
      for (const [base, v] of porObjeto) {
        const r = C.gcloud(['storage', 'cp', v.uri, base], { json: false, allowFail: true });
        copiados.push({ base, ok: typeof r === 'string' });
      }
      detalle = { nota: 'restauracion desde versiones', objetos: porObjeto.size, copiados: copiados.filter((c) => c.ok).length };
    }
    const fin = C.ahora();
    const restaurados = listar(BUCKET).length;
    const rto = C.segundos(inicio, fin);
    C.guardarResultado(archivo(), { ...previo, restauracion: { desde, inicio, fin, rto_s: rto, objetos_restaurados: restaurados } });
    C.salida(restaurados > 0, { desde, rto_s: rto, objetos_restaurados: restaurados });
  },

  async informe() {
    const r0 = C.leerResultado('exp4-ronda-0.json');
    const r1 = C.leerResultado('exp4-ronda-1.json');
    const fila = (r) => r ? {
      objetos: r.estado_estable?.objetos_flujo ?? null,
      worm: r.estado_estable?.retencion_bloqueada ?? null,
      copia: r.estado_estable?.copia_aislada?.existe ?? null,
      objetos_perdidos: r.destruccion ? r.destruccion.objetos_antes - r.destruccion.objetos_despues : null,
      worm_contuvo: r.destruccion?.worm_contuvo ?? null,
      rpo_objetos: r.destruccion?.rpo_objetos ?? null,
      rto_s: r.restauracion?.rto_s ?? null,
      objetos_restaurados: r.restauracion?.objetos_restaurados ?? null,
    } : null;
    C.salida(true, { experimento: 'resiliencia de los datos del flujo', ronda_0: fila(r0), ronda_1: fila(r1) });
  },
};

async function main() {
  const args = C.parseArgs(process.argv.slice(2));
  const cmd = comandos[args._[0]];
  if (!cmd) { console.error(`Comando: ${Object.keys(comandos).join(', ')}`); process.exit(2); }
  try { await cmd(args); } catch (error) { C.salida(false, { error: error.message }); }
}

main();
