const documentoGeneradoSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    nombre: { type: 'string' },
    tipo: { type: 'string' },
    url: { type: 'string' },
    fecha_generacion: { type: 'string', format: 'date' },
    nota_medica_id: { type: 'integer' },
  },
  required: ['id', 'nombre', 'tipo', 'url', 'fecha_generacion', 'nota_medica_id'],
};

const documentoGeneradoInputSchema = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    tipo: { type: 'string' },
    url: { type: 'string' },
    fecha_generacion: { type: 'string', format: 'date' },
    nota_medica_id: { type: 'integer' },
  },
  required: ['nombre', 'tipo', 'url', 'fecha_generacion', 'nota_medica_id'],
  additionalProperties: false,
};

module.exports = {
  documentoGeneradoSchema,
  documentoGeneradoInputSchema,
  idParamSchema: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
    },
    required: ['id'],
  },
};
