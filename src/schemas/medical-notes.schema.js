const notaMedicaSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    paciente: { type: 'string' },
    contenido: { type: 'string' },
    fecha: { type: 'string', format: 'date' },
    imagen_id: { type: 'integer' },
  },
  required: ['id', 'paciente', 'contenido', 'fecha', 'imagen_id'],
};

const notaMedicaInputSchema = {
  type: 'object',
  properties: {
    paciente: { type: 'string' },
    contenido: { type: 'string' },
    fecha: { type: 'string', format: 'date' },
    imagen_id: { type: 'integer' },
  },
  required: ['paciente', 'contenido', 'fecha', 'imagen_id'],
  additionalProperties: false,
};

const notaMedicaQuerySchema = {
  type: 'object',
  properties: {
    paciente: { type: 'string' },
    fecha: { type: 'string', format: 'date' },
  },
  additionalProperties: false,
};

module.exports = {
  notaMedicaSchema,
  notaMedicaInputSchema,
  notaMedicaQuerySchema,
  idParamSchema: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
    },
    required: ['id'],
  },
};
