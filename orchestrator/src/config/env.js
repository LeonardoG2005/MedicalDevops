const DEFAULT_PORT = 4000;

const parsePort = (value) => {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
};

const parseOptionalUrl = (name, value) => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
};

const loadConfig = (environment = process.env) => ({
  port: parsePort(environment.PORT),
  pssApiUrl: parseOptionalUrl('API_A_URL', environment.API_A_URL),
  petAdoptionApiUrl: parseOptionalUrl('API_C_URL', environment.API_C_URL)
});

module.exports = { loadConfig };