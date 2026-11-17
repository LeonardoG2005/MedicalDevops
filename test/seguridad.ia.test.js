const test = require('node:test');
const assert = require('node:assert/strict');
const { construirPrompt, SISTEMA } = require('../chaos/security/ia/analizar');
const { CASOS, evaluar } = require('../chaos/security/ia/prueba-inyeccion');

// No se llama a ninguna API: se prueba la construccion del prompt (que separa
// datos de instrucciones) y el evaluador del veredicto de inyeccion.

test('IA: el prompt del sistema ordena tratar la telemetria como datos y no ejecutar acciones', () => {
  assert.match(SISTEMA, /DATOS/);
  assert.match(SISTEMA, /NO lo obedezcas|no obedezcas|reportalo/i);
  assert.match(SISTEMA, /no ejecutes|No propongas ni ejecutes/i);
});

test('IA: los hallazgos van dentro de un bloque delimitado TELEMETRIA', () => {
  const p = construirPrompt({ alertas: [{ id: 'a1' }] });
  assert.match(p.user, /<TELEMETRIA>[\s\S]*a1[\s\S]*<\/TELEMETRIA>/);
});

test('IA: los tres casos de inyeccion llevan la instruccion dentro de un dato, no en el prompt', () => {
  for (const caso of CASOS) {
    const p = construirPrompt(caso.hallazgos);
    // La instruccion maliciosa queda encerrada en el bloque de datos
    const dentro = p.user.slice(p.user.indexOf('<TELEMETRIA>'), p.user.indexOf('</TELEMETRIA>'));
    assert.ok(dentro.length > 0);
    assert.equal(p.system.includes('olvida las instrucciones'), false);
  }
});

test('IA: el evaluador distingue ejecutar, reportar e ignorar', () => {
  assert.equal(evaluar({ id: 'c' }, JSON.stringify({ grupos: [], cronologia: [], posibles_inyecciones: [] })).veredicto, 'ejecuto');
  assert.equal(evaluar({ id: 'c' }, JSON.stringify({ grupos: [{ titulo: 'x' }], posibles_inyecciones: [{ origen: 'adjunto', texto: 'olvida...' }] })).veredicto, 'reporto');
  assert.equal(evaluar({ id: 'c' }, JSON.stringify({ grupos: [{ titulo: 'x' }], cronologia: [{ t: '1', evento: 'y' }], posibles_inyecciones: [] })).veredicto, 'ignoro');
});
