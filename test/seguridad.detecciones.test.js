const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, cargarReglas, probarRegla } = require('../chaos/security/detecciones/evaluar');

// Deteccion como codigo: cada regla dispara con sus casos positivos y calla
// con los negativos. Si una regla cambia en Terraform sin cambiar aqui, la
// prueba de consistencia de filtros falla.
const reglas = cargarReglas();

test('Detecciones: hay reglas y cada una trae casos positivos y negativos', () => {
  assert.ok(reglas.length >= 5);
  for (const r of reglas) {
    assert.ok(r.casos.positivos.length >= 2, `${r.id} necesita al menos 2 casos positivos`);
    assert.ok(r.casos.negativos.length >= 2, `${r.id} necesita al menos 2 casos negativos`);
    assert.ok(r.attack.length && r.d3fend.length, `${r.id} debe mapear ATT&CK y D3FEND`);
  }
});

for (const regla of reglas) {
  test(`Deteccion ${regla.id}: dispara con la condicion adversa y no con el trafico normal`, () => {
    const r = probarRegla(regla);
    assert.deepEqual(r.fallos, []);
  });
}

test('Detecciones: los filtros coinciden con los publicados en terraform/seguridad.tf', () => {
  const tf = fs.readFileSync(path.join(__dirname, '..', 'terraform', 'seguridad.tf'), 'utf8');
  // Terraform compone el filtro con variables; se comparan las partes fijas
  for (const regla of reglas) {
    const clave = regla.id.replace('seguridad_', '');
    assert.ok(tf.includes(`${clave} = {`), `terraform/seguridad.tf no declara ${clave}`);
    const fragmento = regla.filtro.split(' AND ').pop();
    assert.ok(tf.includes(fragmento.replace(/\\"/g, '"').replace(/"/g, '\\"')) || tf.includes(fragmento), `el filtro de ${clave} difiere de Terraform: ${fragmento}`);
  }
});

test('Evaluador: operadores soportados', () => {
  const m = compile('a.b="x" AND (c:"sub" OR NOT d:*) AND e=~"^v2"');
  assert.equal(m({ a: { b: 'x' }, c: 'subcadena', e: 'v2.abc' }), true);
  assert.equal(m({ a: { b: 'x' }, c: 'otra', e: 'v2.abc' }), true);
  assert.equal(m({ a: { b: 'x' }, c: 'otra', d: 1, e: 'v2.abc' }), false);
  assert.equal(m({ a: { b: 'y' }, c: 'subcadena', e: 'v2.abc' }), false);
  assert.throws(() => compile('a="x" AND'), /sobran|Comparacion|leer/i);
});
