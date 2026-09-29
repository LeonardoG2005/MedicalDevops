'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('../src/v2/controllers/entities.controller');

function createReply() {
  return {
    statusCode: 200,
    body: undefined,

    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },

    send(body) {
      this.body = body;
      return body;
    }
  };
}

function createRequest({
  collections = {},
  entities = {},
  fetchImpl
} = {}) {
  return {
    id: 'test-trace-id',

    headers: {},

    log: {
      error() {}
    },

    server: {
      async inject(options) {
        const value = options.url;

        if (value.startsWith('/imagenes/')) {
          const id = value.split('/').pop();

          if (!(id in entities)) {
            return {
              statusCode: 404,
              payload: JSON.stringify({
                error: 'Not Found'
              })
            };
          }

          return {
            statusCode: 200,
            payload: JSON.stringify(entities[id])
          };
        }

        if (value in collections) {
          return {
            statusCode: 200,
            payload: JSON.stringify(collections[value])
          };
        }

        return {
          statusCode: 404,
          payload: JSON.stringify({
            error: 'Not Found'
          })
        };
      }
    },

    fetchImpl
  };
}

test('GET randomImagen retorna un registro de imagen', async () => {
  const request = createRequest({
    collections: {
      '/imagenes': [
        { id: 1, nombre: 'imagen-1' },
        { id: 2, nombre: 'imagen-2' }
      ]
    }
  });

  const reply = createReply();

  const result = await controller.randomImagen(request, reply);

  assert.equal(reply.statusCode, 200);

  assert.ok(
    result.id === 1 || result.id === 2
  );
});

test('GET randomNotaMedica retorna un registro de nota médica', async () => {
  const request = createRequest({
    collections: {
      '/notas-medicas': [
        { id: 1, contenido: 'nota-1' },
        { id: 2, contenido: 'nota-2' }
      ]
    }
  });

  const reply = createReply();

  const result = await controller.randomNotaMedica(request, reply);

  assert.equal(reply.statusCode, 200);

  assert.ok(
    result.id === 1 || result.id === 2
  );
});

test('GET randomDocumentoGenerado retorna un documento', async () => {
  const request = createRequest({
    collections: {
      '/documentos-generados': [
        { id: 1, nombre: 'documento-1' },
        { id: 2, nombre: 'documento-2' }
      ]
    }
  });

  const reply = createReply();

  const result = await controller.randomDocumentoGenerado(
    request,
    reply
  );

  assert.equal(reply.statusCode, 200);

  assert.ok(
    result.id === 1 || result.id === 2
  );
});

test('GET imagen/:id compone imagen + vuelo + animal', async () => {
  const originalFetch = global.fetch;

  const calls = [];

  global.fetch = async (url) => {
    calls.push(url);

    if (url.includes('/vuelos/random')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            id: 50,
            numero: 'V-050'
          });
        }
      };
    }

    if (url.includes('/animals/random')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            id: 80,
            nombre: 'Animal de prueba'
          });
        }
      };
    }

    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const request = createRequest({
      entities: {
        10: {
          id: 10,
          nombre: 'imagen-10'
        }
      }
    });

    const reply = createReply();

    const result = await controller.getImagenById(
      {
        ...request,
        headers: {
          'x-trace-id': 'trace-test-001'
        }
      },
      reply
    );

    assert.equal(reply.statusCode, 200);

    assert.equal(result.trace_id, 'trace-test-001');

    assert.deepEqual(result.imagen, {
      id: 10,
      nombre: 'imagen-10'
    });

    assert.deepEqual(result.api_a.entity, {
      id: 50,
      numero: 'V-050'
    });

    assert.deepEqual(result.api_b.entity, {
      id: 80,
      nombre: 'Animal de prueba'
    });

    assert.equal(calls.length, 2);

    assert.ok(
      calls.some((url) => url.includes('/vuelos/random'))
    );

    assert.ok(
      calls.some((url) => url.includes('/animals/random'))
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('GET imagen/:id retorna 404 cuando no existe', async () => {
  const request = createRequest({
    entities: {}
  });

  const reply = createReply();

  await controller.getImagenById(
    request,
    reply
  );

  assert.equal(reply.statusCode, 404);
});