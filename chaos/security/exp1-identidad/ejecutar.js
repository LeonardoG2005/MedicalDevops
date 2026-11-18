#!/usr/bin/env node
// Experimento 1 (Leonardo): identidad de maquina y de agente del coordinador.
// Verifica que los controles de identidad del plano de control del caos
// RECHAZAN y REGISTRAN condiciones no previstas, y mide cuanto tarda la
// deteccion. Todo corre contra la propia API del grupo, con datos sinteticos,
// dentro de la ventana acordada y con interruptor de parada. Es un game day de
// Ingenieria del Caos de Seguridad, no una prueba de penetracion: no busca
// vulnerar nada de terceros ni evadir controles, sino comprobar si los propios
// controles reaccionan.
//
//   node chaos/security/exp1-identidad/ejecutar.js estado-estable
//   node chaos/security/exp1-identidad/ejecutar.js probar --cual replay|alcance|honeytoken|todos
//   node chaos/security/exp1-identidad/ejecutar.js medir
//   node chaos/security/exp1-identidad/ejecutar.js informe
//
// Variables: CHAOS_BASE_URL, CHAOS_TOKEN (el secreto compartido), RONDA (0|1).
const { mintToken } = require('../../../src/chaos/token');
const C = require('../comun');

const BASE_URL = (process.env.CHAOS_BASE_URL || 'http://34.123.58.136').replace(/\/$/, '');
const TOKEN = process.env.CHAOS_TOKEN || '';
const RONDA = process.env.RONDA || '0';
const HONEYTOKEN = 'medical-api-admin-backup-key';
const UA_PRUEBA = 'gameday-identidad/1.0 (origen-no-previsto)';
const archivo = () => `exp1-ronda-${RONDA}.json`;

// Cada condicion lleva su propio trace id (gd-exp1-r<ronda>-<caso>-<sello>): la
// misma cadena aparece como "traceId" en la linea de log que la detecta, asi un
// tercero puede unir la prueba, la bitacora y la alerta.
async function tocar(headers, caso = 'prueba') {
  const started = C.ahora();
  const traceId = `gd-exp1-r${RONDA}-${caso}-${Date.now().toString(36)}`;
  try {
    const r = await fetch(`${BASE_URL}/internal/chaos`, { headers: { accept: 'application/json', 'x-trace-id': traceId, ...headers }, signal: AbortSignal.timeout(15000) });
    const body = await r.json().catch(() => null);
    return { t: started, traceId, status: r.status, motivo: body?.motivo || null, rechazado: r.status === 401 || r.status === 403 };
  } catch (error) {
    return { t: started, traceId, status: 0, motivo: error.message, rechazado: false };
  }
}

const comandos = {
  // Estado estable de seguridad: API sana, sin rechazos recientes, cobertura
  // de telemetria (reglas publicadas, auditoria de acceso a datos activa)
  async 'estado-estable'() {
    const salud = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(10000) }).then((r) => r.status).catch(() => 0);
    const auditoria = C.gcloud(['projects', 'get-iam-policy', C.PROJECT]) || {};
    const servicios = (auditoria.auditConfigs || []).map((a) => a.service);
    const reglas = ['seguridad_chaos_acceso_rechazado', 'seguridad_chaos_acceso_origen_no_previsto', 'seguridad_identidad_coordinador_impersonada', 'seguridad_honeytoken_tocado'];
    const publicadas = reglas.filter((r) => C.metricaExiste(r));
    const rechazosRecientes = C.leerLogs('jsonPayload.evento="chaos_acceso_rechazado"', { freshness: '10m', limit: 20 }).length;
    const estable = {
      t: C.ahora(), ronda: RONDA, salud, auditoria_acceso_datos: servicios,
      reglas_publicadas: publicadas, reglas_esperadas: reglas,
      cobertura: { identidad_app: true, identidad_gcp: servicios.includes('secretmanager.googleapis.com'), senuelo: publicadas.includes('seguridad_honeytoken_tocado') },
      rechazos_ultimos_10m: rechazosRecientes,
    };
    const previo = C.leerResultado(archivo()) || {};
    C.guardarResultado(archivo(), { ...previo, estado_estable: estable });
    C.salida(salud === 200 && rechazosRecientes === 0, estable);
  },

  // Condiciones no previstas; cada una debe quedar rechazada (ronda 1) y, en
  // todas las rondas, registrada. "logrado" = el control dejo pasar (lo que no
  // debe ocurrir en ronda 1).
  async probar(args) {
    const cual = args.cual || 'todos';
    const previo = C.leerResultado(archivo()) || {};
    const bitacora = previo.bitacora || [];
    C.comprobarParada(bitacora);
    const pruebas = previo.pruebas || {};

    if (cual === 'replay' || cual === 'todos') {
      // Condicion: el secreto compartido presentado desde un origen no previsto
      // (ATT&CK T1550.001). En ronda 1 el modo efimero lo rechaza.
      bitacora.push({ t: C.ahora(), evento: 'prueba_inicio', caso: 'replay', attack: 'T1550.001' });
      pruebas.replay = await tocar({ 'x-chaos-token': TOKEN, 'user-agent': UA_PRUEBA }, 'replay');
      pruebas.replay.control_contuvo = pruebas.replay.rechazado;
      bitacora.push({ t: C.ahora(), evento: 'prueba_fin', caso: 'replay', status: pruebas.replay.status, motivo: pruebas.replay.motivo });
    }
    if (cual === 'alcance' || cual === 'todos') {
      // Condicion: token firmado para una audiencia distinta de la del gate
      // (alcance no previsto). Debe rechazarse por audiencia en ronda 1.
      const token = TOKEN.length >= 16 ? mintToken({ key: TOKEN, audience: 'admin-backup', ttlSeconds: 300 }) : 'sin-clave';
      bitacora.push({ t: C.ahora(), evento: 'prueba_inicio', caso: 'alcance', attack: 'T1078.004' });
      pruebas.alcance = await tocar({ 'x-chaos-token': token, 'user-agent': UA_PRUEBA }, 'alcance');
      pruebas.alcance.control_contuvo = pruebas.alcance.rechazado;
      bitacora.push({ t: C.ahora(), evento: 'prueba_fin', caso: 'alcance', status: pruebas.alcance.status, motivo: pruebas.alcance.motivo });
    }
    if (cual === 'honeytoken' || cual === 'todos') {
      // Condicion: lectura del secreto senuelo. Ningun componente legitimo lo
      // usa; leerlo debe disparar la alerta (engano, D3FEND D3-DUC).
      bitacora.push({ t: C.ahora(), evento: 'prueba_inicio', caso: 'honeytoken', attack: 'T1555.006' });
      const leido = C.gcloud(['secrets', 'versions', 'access', 'latest', `--secret=${HONEYTOKEN}`], { json: false, allowFail: true });
      pruebas.honeytoken = { t: C.ahora(), leido: typeof leido === 'string', detalle: typeof leido === 'string' ? 'senuelo accedido (debe alertar)' : leido.error };
      bitacora.push({ t: C.ahora(), evento: 'prueba_fin', caso: 'honeytoken', leido: pruebas.honeytoken.leido });
    }

    C.guardarResultado(archivo(), { ...previo, ronda: RONDA, pruebas, bitacora, probado_en: C.ahora() });
    C.salida(true, { ronda: RONDA, pruebas });
  },

  // MTTD: tiempo entre cada condicion y la primera entrada de deteccion en los
  // logs del grupo. Lee las bitacoras reales, no inventa nada.
  async medir() {
    const r = C.leerResultado(archivo());
    if (!r || !r.pruebas) C.salida(false, { error: 'Ejecute "probar" antes de "medir"' });
    const detecciones = {};
    const rechazos = C.leerLogs('jsonPayload.evento="chaos_acceso_rechazado"', { freshness: '30m', limit: 100 });
    const aceptadosRaros = C.leerLogs('jsonPayload.evento="chaos_acceso" AND NOT jsonPayload.agente=~"^(node|undici|k6-medical-chaos|curl)"', { freshness: '30m', limit: 100 });
    const honey = C.leerLogs(`protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion" AND protoPayload.resourceName:"secrets/${HONEYTOKEN}"`, { freshness: '30m', limit: 20 });

    function mttd(prueba, entradas) {
      if (!prueba || !entradas.length) return { detectado: false };
      // Solo cuentan las detecciones a partir de la condicion (evita emparejar
      // con entradas de una ronda anterior dentro de la misma ventana)
      const posteriores = entradas
        .map((e) => e.receiveTimestamp || e.timestamp)
        .filter((ts) => Date.parse(ts) >= Date.parse(prueba.t) - 1000)
        .sort();
      if (!posteriores.length) return { detectado: false };
      return { detectado: true, mttd_s: C.segundos(prueba.t, posteriores[0]), primera_entrada: posteriores[0] };
    }
    // replay/alcance: si el control rechazo, la deteccion es el log de rechazo;
    // si por el modo estatico fue aceptado, es el log de "acceso raro"
    detecciones.replay = mttd(r.pruebas.replay, r.pruebas.replay?.rechazado ? rechazos : aceptadosRaros);
    detecciones.alcance = mttd(r.pruebas.alcance, rechazos);
    detecciones.honeytoken = mttd(r.pruebas.honeytoken, honey);

    C.guardarResultado(archivo(), { ...r, detecciones, medido_en: C.ahora() });
    C.salida(true, { ronda: RONDA, detecciones });
  },

  async informe() {
    const r0 = C.leerResultado('exp1-ronda-0.json');
    const r1 = C.leerResultado('exp1-ronda-1.json');
    const fila = (r) => r && r.pruebas ? {
      replay_contenido: r.pruebas.replay?.control_contuvo ?? null,
      alcance_contenido: r.pruebas.alcance?.control_contuvo ?? null,
      honeytoken_leido: r.pruebas.honeytoken?.leido ?? null,
      mttd_replay_s: r.detecciones?.replay?.mttd_s ?? null,
      mttd_honeytoken_s: r.detecciones?.honeytoken?.mttd_s ?? null,
    } : null;
    C.salida(true, { experimento: 'identidad de maquina del coordinador', ronda_0: fila(r0), ronda_1: fila(r1) });
  },
};

async function main() {
  const args = C.parseArgs(process.argv.slice(2));
  const cmd = comandos[args._[0]];
  if (!cmd) { console.error(`Comando: ${Object.keys(comandos).join(', ')}`); process.exit(2); }
  try { await cmd(args); } catch (error) { C.salida(false, { error: error.message }); }
}

main();
