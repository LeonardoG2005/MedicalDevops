// Utilidades compartidas por los experimentos del game day de seguridad:
// bitacora con sello de tiempo, interruptor de parada, llamadas a gcloud y
// escritura de resultados. Sin dependencias fuera de Node.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RESULTS_DIR = process.env.SEC_RESULTS_DIR || path.join(__dirname, 'results');
const STOP_FILE = path.join(RESULTS_DIR, 'STOP');
const PROJECT = process.env.GCP_PROJECT || 'project-40fc41d1-6899-4ce0-9ef';

function ahora() {
  return new Date().toISOString();
}

// Interruptor de parada de las reglas de compromiso: si existe el archivo
// results/STOP ninguna accion adversa arranca (crear con: echo > chaos/security/results/STOP)
function comprobarParada(bitacora) {
  if (fs.existsSync(STOP_FILE)) {
    bitacora?.push({ t: ahora(), evento: 'parada_solicitada', detalle: `existe ${STOP_FILE}` });
    throw new Error('Interruptor de parada activado (chaos/security/results/STOP)');
  }
}

function gcloud(args, { json = true, allowFail = false } = {}) {
  const win = process.platform === 'win32';
  const exe = win ? 'gcloud.cmd' : 'gcloud';
  const env = { ...process.env, CLOUDSDK_CORE_PROJECT: PROJECT };
  if (win && !env.CLOUDSDK_PYTHON && fs.existsSync('C:\\Python315\\python.exe')) {
    env.CLOUDSDK_PYTHON = 'C:\\Python315\\python.exe';
  }
  try {
    // Node 26 refuses to spawn a .cmd without a shell on Windows. With a shell,
    // args with spaces must be quoted; cmd.exe escapes an inner " by doubling it.
    const full = json ? [...args, '--format=json'] : args;
    const finalArgs = win ? full.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)) : full;
    const out = execFileSync(exe, finalArgs, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, shell: win });
    return json ? JSON.parse(out || 'null') : out;
  } catch (error) {
    if (allowFail) return { error: (error.stderr || error.message || '').toString().trim().split('\n').slice(-2).join(' ') };
    throw new Error(`gcloud ${args.slice(0, 3).join(' ')}: ${(error.stderr || error.message).toString().trim().split('\n').slice(-3).join(' ')}`);
  }
}

// Lee la bitacora de Cloud Logging con un filtro, devolviendo las entradas
// mas recientes primero (timestamp = cuando ocurrio, receiveTimestamp = cuando
// la plataforma la ingirio: la diferencia con el ataque es el MTTD tecnico)
function leerLogs(filtro, { freshness = '30m', limit = 50 } = {}) {
  return gcloud(['logging', 'read', filtro, `--freshness=${freshness}`, `--limit=${limit}`, '--order=desc']) || [];
}

function metricaExiste(nombre) {
  const lista = gcloud(['logging', 'metrics', 'list', `--filter=name:${nombre}`]) || [];
  return lista.some((m) => m.name === nombre);
}

function guardarResultado(nombre, datos) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, nombre);
  fs.writeFileSync(file, JSON.stringify(datos, null, 2));
  return file;
}

function leerResultado(nombre) {
  const file = path.join(RESULTS_DIR, nombre);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function segundos(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 100) / 10;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1] ?? true; i += 1; } else args._.push(argv[i]);
  }
  return args;
}

function salida(ok, data) {
  console.log(JSON.stringify({ ok, ...data }, null, 2));
  process.exit(ok ? 0 : 1);
}

module.exports = { RESULTS_DIR, STOP_FILE, PROJECT, ahora, comprobarParada, gcloud, leerLogs, metricaExiste, guardarResultado, leerResultado, segundos, parseArgs, salida };
