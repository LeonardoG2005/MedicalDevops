// Archive of the flow: one JSON object per execution in the results bucket
// (flujo/<traceId>.json). These objects are "the data of the flow" for the
// group experiment on data resilience (encrypt, overwrite or delete them in
// one cloud and measure RPO and RTO). The write never blocks or fails the
// HTTP response: an archive problem is logged and counted, nothing else.
const PREFIX = 'flujo';

function createFlowArchive({ bucketName = process.env.FLOW_ARCHIVE_BUCKET, storage, log } = {}) {
  if (!bucketName) {
    return { enabled: false, bucketName: null, guardar: async () => null };
  }

  let bucket = null;
  function getBucket() {
    if (!bucket) {
      const client = storage || new (require('@google-cloud/storage').Storage)();
      bucket = client.bucket(bucketName);
    }
    return bucket;
  }

  async function guardar({ traceId, status, body, ronda }) {
    const name = `${PREFIX}/${traceId}.json`;
    const contenido = JSON.stringify({
      traceId,
      ronda,
      status,
      archivado_en: new Date().toISOString(),
      flujo: body,
    });
    try {
      await getBucket().file(name).save(contenido, {
        contentType: 'application/json',
        resumable: false,
        metadata: { metadata: { traceId, ronda: String(ronda), status: String(status) } },
      });
      return name;
    } catch (error) {
      log?.warn({ evento: 'archivo_flujo_error', objeto: name, detalle: error.message });
      return null;
    }
  }

  return { enabled: true, bucketName, prefix: PREFIX, guardar };
}

module.exports = { createFlowArchive, PREFIX };
