CREATE TABLE IF NOT EXISTS imagenes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  fecha_creacion DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS notas_medicas (
  id SERIAL PRIMARY KEY,
  paciente VARCHAR(255) NOT NULL,
  contenido TEXT NOT NULL,
  fecha DATE NOT NULL,
  imagen_id INTEGER NOT NULL REFERENCES imagenes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documentos_generados (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  fecha_generacion DATE NOT NULL,
  nota_medica_id INTEGER NOT NULL REFERENCES notas_medicas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notas_medicas_imagen_id ON notas_medicas(imagen_id);
CREATE INDEX IF NOT EXISTS idx_documentos_generados_nota_medica_id ON documentos_generados(nota_medica_id);