const { OUTCOMES } = require('./resilience');

const idParamSchema = {
  type: 'object',
  properties: { imagenId: { type: 'integer', minimum: 1 } },
  required: ['imagenId'],
};

const dependenciaSchema = {
  type: 'object',
  properties: {
    estado: { type: 'string', enum: OUTCOMES },
    duracion_ms: { type: 'integer' },
    nube: { type: 'string' },
    entidad: { type: 'string' },
    detalle: { type: ['string', 'null'] },
  },
};

const dependenciasSchema = {
  type: 'object',
  properties: {
    angel: dependenciaSchema,
    juan: dependenciaSchema,
  },
};

const anyObject = { type: ['object', 'null'], additionalProperties: true };

const flujoResponseSchema = {
  type: 'object',
  properties: {
    traceId: { type: 'string' },
    ronda: { type: 'string', enum: ['0', '1'] },
    degradado: { type: 'boolean' },
    imagen: anyObject,
    animal: anyObject,
    vuelo: anyObject,
    dependencias: dependenciasSchema,
  },
  required: ['traceId', 'ronda', 'degradado', 'imagen', 'dependencias'],
};

const flujoErrorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    traceId: { type: 'string' },
    ronda: { type: 'string' },
    dependencias: dependenciasSchema,
  },
};

const notFoundSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    traceId: { type: 'string' },
  },
};

module.exports = {
  idParamSchema,
  flujoResponseSchema,
  flujoErrorSchema,
  notFoundSchema,
};
