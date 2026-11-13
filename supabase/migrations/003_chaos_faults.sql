-- Interruptor de fallos de la Ingenieria del Caos (release 5).
-- Una fila por compañero: mientras expires_at este en el futuro, las llamadas
-- salientes hacia ese compañero reciben la latencia o el error indicado.
-- La tabla la leen todas las replicas, asi el fallo es coherente entre pods y
-- caduca solo (reversion automatica) aunque nadie lo borre.
-- Solo agrega objetos: las revisiones anteriores de la API la ignoran.
CREATE TABLE IF NOT EXISTS chaos_faults (
  peer        VARCHAR(20)  PRIMARY KEY CHECK (peer IN ('angel', 'juan')),
  latency_ms  INTEGER      NOT NULL DEFAULT 0 CHECK (latency_ms BETWEEN 0 AND 10000),
  error_rate  NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (error_rate BETWEEN 0 AND 1),
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  creado_por  VARCHAR(100),
  motivo      VARCHAR(200)
);
