const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

const prioridadSchema = { type: 'string', enum: PRIORIDADES };

const notaMedicaV4Schema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    paciente: { type: 'string' },
    contenido: { type: 'string' },
    fecha: { type: 'string', format: 'date' },
    imagen_id: { type: 'integer' },
    // Notes written by v1/v2 have no priority yet
    prioridad: { type: ['string', 'null'], enum: [...PRIORIDADES, null] },
  },
  required: ['id', 'paciente', 'contenido', 'fecha', 'imagen_id', 'prioridad'],
};

const notaMedicaV4InputSchema = {
  type: 'object',
  properties: {
    paciente: { type: 'string', minLength: 1 },
    contenido: { type: 'string', minLength: 1 },
    fecha: { type: 'string', format: 'date' },
    imagen_id: { type: 'integer' },
    prioridad: prioridadSchema,
  },
  required: ['paciente', 'contenido', 'fecha', 'imagen_id', 'prioridad'],
  additionalProperties: false,
};

const prioridadBodySchema = {
  type: 'object',
  properties: { prioridad: prioridadSchema },
  required: ['prioridad'],
  additionalProperties: false,
};

const idParamSchema = {
  type: 'object',
  properties: { id: { type: 'integer' } },
  required: ['id'],
};

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };

module.exports = {
  PRIORIDADES,
  prioridadSchema,
  notaMedicaV4Schema,
  notaMedicaV4InputSchema,
  prioridadBodySchema,
  idParamSchema,
  errorSchema,
};
