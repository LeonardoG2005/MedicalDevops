async function getJson(url, traceId) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(traceId ? { 'x-trace-id': traceId } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `La API ${url} respondió ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function getVueloRandom(traceId) {
  const baseUrl = process.env.API_A_URL;

  if (!baseUrl) {
    throw new Error('Falta API_A_URL en las variables de entorno');
  }

  return getJson(
    `${baseUrl.replace(/\/$/, '')}/api/v2/entidades/vuelos/random`,
    traceId
  );
}

async function getAnimalRandom(traceId) {
  const baseUrl = process.env.API_C_URLL;

  if (!baseUrl) {
    throw new Error('Falta API_C_URL en las variables de entorno');
  }

  return getJson(
    `${baseUrl.replace(/\/$/, '')}/api/v2/animals/random`,
    traceId
  );
}

module.exports = {
  getVueloRandom,
  getAnimalRandom,
};