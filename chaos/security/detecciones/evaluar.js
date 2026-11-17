#!/usr/bin/env node
// Deteccion como codigo: cada regla de chaos/security/detecciones/*.json
// contiene el filtro que Terraform publica en Cloud Logging (terraform/seguridad.tf)
// y sus casos de prueba. Este archivo evalua el subconjunto del lenguaje de
// consulta de Cloud Logging que usan las reglas, para demostrar que cada
// regla dispara con la condicion adversa (casos positivos) y no con el
// trafico normal del flujo (casos negativos). Se ejecuta en los tests y con
//   node chaos/security/detecciones/evaluar.js
//
// Subconjunto soportado: campo="valor", campo=~"regex", campo:"subcadena",
// campo:* (existe), AND, OR, NOT y parentesis. Los campos son rutas con punto.
const fs = require('node:fs');
const path = require('node:path');

// Cloud Logging resolves a path through arrays element by element: a filter on
// serviceAccountDelegationInfo.principalSubject matches if ANY element matches.
// So this returns every value reachable by the path, flattening arrays.
function getValues(obj, dotted) {
  let current = [obj];
  for (const key of dotted.split('.')) {
    const next = [];
    for (const item of current) {
      const items = Array.isArray(item) ? item : [item];
      for (const value of items) {
        if (value && typeof value === 'object' && value[key] !== undefined) next.push(value[key]);
      }
    }
    current = next;
  }
  return current.flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => v !== undefined && v !== null);
}

function tokenize(filter) {
  const tokens = [];
  const re = /\s*(\(|\)|AND|OR|NOT|[A-Za-z_][A-Za-z0-9_.]*\s*(?:=~|:\*|:|=)\s*(?:"(?:[^"\\]|\\.)*")?)/y;
  let pos = 0;
  while (pos < filter.length) {
    re.lastIndex = pos;
    const m = re.exec(filter);
    if (!m) {
      if (/^\s*$/.test(filter.slice(pos))) break;
      throw new Error(`No se pudo leer el filtro en: ${filter.slice(pos, pos + 30)}`);
    }
    tokens.push(m[1].trim());
    pos = re.lastIndex;
  }
  return tokens;
}

function parseComparison(token) {
  const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(=~|:\*|:|=)\s*(?:"((?:[^"\\]|\\.)*)")?$/.exec(token);
  if (!m) throw new Error(`Comparacion invalida: ${token}`);
  const [, field, op, raw] = m;
  const value = raw === undefined ? undefined : raw.replace(/\\"/g, '"');
  return (entry) => {
    const values = getValues(entry, field);
    if (op === ':*') return values.length > 0;
    return values.some((actual) => {
      const text = typeof actual === 'object' ? JSON.stringify(actual) : String(actual);
      if (op === '=') return text === value;
      if (op === ':') return text.includes(value);
      if (op === '=~') return new RegExp(value).test(text);
      return false;
    });
  };
}

// Precedencia de Cloud Logging: NOT > AND > OR
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === '(') { const e = or(); if (next() !== ')') throw new Error('Falta )'); return e; }
    if (t === 'NOT') { const e = primary(); return (entry) => !e(entry); }
    return parseComparison(t);
  }
  function and() {
    let left = primary();
    while (peek() === 'AND') { next(); const right = primary(); const l = left; left = (e) => l(e) && right(e); }
    return left;
  }
  function or() {
    let left = and();
    while (peek() === 'OR') { next(); const right = and(); const l = left; left = (e) => l(e) || right(e); }
    return left;
  }
  const expr = or();
  if (i !== tokens.length) throw new Error(`Sobran tokens en el filtro: ${tokens.slice(i).join(' ')}`);
  return expr;
}

function compile(filter) {
  return parse(tokenize(filter));
}

function cargarReglas(dir = __dirname) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ archivo: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

// Devuelve { regla, fallos: [] }; un fallo es un caso positivo que no dispara o
// un caso negativo que si dispara
function probarRegla(regla) {
  const match = compile(regla.filtro);
  const fallos = [];
  for (const caso of regla.casos.positivos) {
    if (!match(caso.entrada)) fallos.push(`positivo no detectado: ${caso.nombre}`);
  }
  for (const caso of regla.casos.negativos) {
    if (match(caso.entrada)) fallos.push(`negativo detectado (falso positivo): ${caso.nombre}`);
  }
  return { regla: regla.id, fallos };
}

if (require.main === module) {
  let total = 0;
  for (const regla of cargarReglas()) {
    const r = probarRegla(regla);
    total += r.fallos.length;
    console.log(`${r.fallos.length ? 'FALLA' : 'OK   '} ${regla.id} (${regla.casos.positivos.length} positivos, ${regla.casos.negativos.length} negativos)`);
    for (const f of r.fallos) console.log(`      ${f}`);
  }
  process.exit(total ? 1 : 0);
}

module.exports = { compile, cargarReglas, probarRegla, tokenize };
