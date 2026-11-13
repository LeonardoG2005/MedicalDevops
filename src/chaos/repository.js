const { query: defaultQuery } = require('../db/connection');

const PEERS = ['angel', 'juan'];

// Persistence of the chaos switch. Expiry is decided by the database clock
// (now()), so two pods and the DB can never disagree about whether a fault
// is still active.
function createChaosRepository({ query = defaultQuery } = {}) {
  async function upsertFault({ peer, latencyMs = 0, errorRate = 0, ttlSeconds, creadoPor = null, motivo = null }) {
    const result = await query(
      `INSERT INTO chaos_faults (peer, latency_ms, error_rate, expires_at, creado_por, motivo)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)
       ON CONFLICT (peer) DO UPDATE SET
         latency_ms = EXCLUDED.latency_ms,
         error_rate = EXCLUDED.error_rate,
         expires_at = EXCLUDED.expires_at,
         created_at = now(),
         creado_por = EXCLUDED.creado_por,
         motivo = EXCLUDED.motivo
       RETURNING peer, latency_ms, error_rate::float AS error_rate, expires_at, created_at, creado_por, motivo`,
      [peer, latencyMs, errorRate, ttlSeconds, creadoPor, motivo],
    );
    return result.rows[0];
  }

  async function deleteFaults(peer) {
    const result = peer
      ? await query('DELETE FROM chaos_faults WHERE peer = $1', [peer])
      : await query('DELETE FROM chaos_faults');
    return result.rowCount;
  }

  async function listActive() {
    const result = await query(
      `SELECT peer, latency_ms, error_rate::float AS error_rate, expires_at, created_at, creado_por, motivo,
              GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now())))::int AS segundos_restantes
       FROM chaos_faults
       WHERE expires_at > now()
       ORDER BY peer`,
    );
    return result.rows;
  }

  return { upsertFault, deleteFaults, listActive };
}

// Per-pod cache in front of the table. Requests read the last snapshot and a
// refresh runs in the background when it is older than ttlMs, so the switch
// costs the flow nothing. If the database cannot be read three times in a
// row the cache falls back to "no faults": a DB hiccup must never leave an
// injected fault stuck on.
function createFaultCache({ repository, ttlMs = 3000, metrics, log, maxFailures = 3 } = {}) {
  const empty = () => Object.fromEntries(PEERS.map((peer) => [peer, null]));
  let snapshot = empty();
  let fetchedAt = 0;
  let inflight = null;
  let failures = 0;

  function publish() {
    for (const peer of PEERS) {
      const fault = snapshot[peer];
      metrics?.setFaultActive(peer, 'latencia', Boolean(fault && fault.latency_ms > 0));
      metrics?.setFaultActive(peer, 'error', Boolean(fault && fault.error_rate > 0));
    }
  }

  async function refresh() {
    try {
      const rows = await repository.listActive();
      const next = empty();
      for (const row of rows) next[row.peer] = row;
      snapshot = next;
      failures = 0;
    } catch (error) {
      failures += 1;
      log?.warn({ evento: 'chaos_cache_error', intentos: failures, detalle: error.message });
      if (failures >= maxFailures) snapshot = empty();
    } finally {
      fetchedAt = Date.now();
      publish();
    }
  }

  async function get() {
    if (fetchedAt === 0 || ttlMs <= 0) {
      await refresh();
      return snapshot;
    }
    if (Date.now() - fetchedAt > ttlMs && !inflight) {
      inflight = refresh().finally(() => { inflight = null; });
    }
    return snapshot;
  }

  // Called after a local POST/DELETE so this pod reacts at once; the other
  // pods catch up within ttlMs
  function invalidate() {
    fetchedAt = 0;
  }

  return { get, refresh, invalidate, ttlMs };
}

module.exports = { createChaosRepository, createFaultCache, PEERS };
