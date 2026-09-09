const imagenSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    nombre: { type: 'string' },
    url: { type: 'string' },
    fecha_creacion: { type: 'string', format: 'date' },
  },
  required: ['id', 'nombre', 'url', 'fecha_creacion'],
};

const imagenInputSchema = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    url: { type: 'string' },
    fecha_creacion: { type: 'string', format: 'date' },
  },
  required: ['nombre', 'url', 'fecha_creacion'],
  additionalProperties: false,
};

const imagenPatchSchema = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    url: { type: 'string' },
    fecha_creacion: { type: 'string', format: 'date' },
  },
  additionalProperties: false,
};

const imagenQuerySchema = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    fecha_creacion: { type: 'string', format: 'date' },
  },
  additionalProperties: false,
};

const idParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
  },
  required: ['id'],
};

module.exports = {
  imagenSchema,
  imagenInputSchema,
  imagenPatchSchema,
  imagenQuerySchema,
  idParamSchema,
};
