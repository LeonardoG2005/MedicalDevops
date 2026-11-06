-- Expand phase for api/v3: the column accepts NULL, so v3.1.0 (stable) keeps
-- reading and writing notes without knowing it exists and the canary can be
-- rolled back without touching data. Dropping anything belongs to a later
-- Contract migration, once no revision depends on the old shape.
ALTER TABLE notas_medicas ADD COLUMN IF NOT EXISTS prioridad VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_notas_medicas_prioridad') THEN
    ALTER TABLE notas_medicas
      ADD CONSTRAINT ck_notas_medicas_prioridad
      CHECK (prioridad IS NULL OR prioridad IN ('baja', 'media', 'alta', 'critica'));
  END IF;
END $$;
