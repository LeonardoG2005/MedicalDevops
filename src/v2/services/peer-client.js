async function getJson(url, request) {
  const headers = {
    accept: 'application/json',
  };

  // Propagamos el trace-id si existe
  if (request?.headers?.['x-trace-id']) {
    headers['x-trace-id'] = request.headers['x-trace-id'];
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `La API ${url} respondió ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}


async function getVueloRandom(request) {
  const baseUrl = process.env.JUAN_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('Falta JUAN_API_BASE_URL en las variables de entorno');
  }

  const url =
    `${baseUrl.replace(/\/$/, '')}` +
    '/api/v2/entidades/vuelos/random';

  return getJson(url, request);
}

async function getAnimalRandom(request) {
  const baseUrl = process.env.ANGEL_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('Falta ANGEL_API_BASE_URL en las variables de entorno');
  }

  const url =
    `${baseUrl.replace(/\/$/, '')}` +
    '/api/v2/animals/random';

  return getJson(url, request);
}

module.exports = {
  getVueloRandom,
  getAnimalRandom,
};