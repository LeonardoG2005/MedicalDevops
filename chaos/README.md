# Ingenieria del Caos (release 5)

Todo lo que necesita el experimento de latencia saliente vive en esta carpeta:

| Archivo | Que es |
|---|---|
| `experiments/latencia-salida-angel.json` | Experimento declarativo de Chaos Toolkit: estado estable, hipotesis, metodo (inyeccion + carga), rollbacks. |
| `k6/flujo.js` | Generador de carga con el perfil fijo (10 VU, 30 s subida, 4 min sostenido, 30 s bajada) y los umbrales. |
| `probes.js` | Sondas y acciones que Chaos Toolkit ejecuta con el proveedor `process` (salud, flujo, activar, revertir, sin-fallos). |
| `gate.js` | Puerta de calidad: lee el resumen de k6 y el diario de Chaos Toolkit y falla si la metrica objetivo no cumple `slo.json`. |
| `slo.json` | Metrica objetivo y umbrales declarados antes de medir. |
| `mocks/peer-mock.js` | Doble de las APIs de Angel y Juan para las rondas locales y las pruebas. |
| `grafana/dashboard-caos.json` | Tablero de Grafana Cloud (importar con Dashboards > New > Import). |
| `results/` | Resumenes de k6, diarios y veredictos de las rondas locales del 2026-11-16 (versionados como evidencia; en CI se suben ademas como artefactos). |

El interruptor de fallos propio esta en `src/chaos/` (tabla `chaos_faults` + rutas
`/internal/chaos`) y se aplica en `src/v5/peer-client.js`, sobre la llamada saliente.

## Requisitos

- Node 22+.
- k6 (`winget install GrafanaLabs.k6` o <https://grafana.com/docs/k6/latest/set-up/install-k6/>).
- Chaos Toolkit 1.19 en un entorno de Python 3.12 (`python -m venv %USERPROFILE%\.venvs\chaostoolkit` y `pip install chaostoolkit==1.19.0`; activar con `Scripts\Activate.ps1`).
  En Windows exportar `PYTHONUTF8=1` antes de `chaos run` para que el diario se escriba en UTF-8.

## Variables

| Variable | Uso | Valor por defecto |
|---|---|---|
| `CHAOS_BASE_URL` | URL del coordinador | `http://34.123.58.136` (GKE) |
| `CHAOS_TOKEN` | Token del interruptor (Secret Manager `medical-api-chaos-token`) | obligatorio |
| `RONDA` | `0` o `1`; debe coincidir con `RESILIENCE_ENABLED` del despliegue | `0` |
| `IMAGEN_ID` | Imagen del flujo (`random` o un id) | `random` |
| `LATENCIA_MS` | Latencia inyectada hacia Angel | `3000` |
| `TTL_SECONDS` | Caducidad del fallo (reversion automatica) | `420` |
| `PERFIL` | `completo` (5 min) o `humo` (15 s, solo para validar) | `completo` |

## Ejecutar una ronda

```bash
export CHAOS_BASE_URL=http://34.123.58.136 CHAOS_TOKEN=<token> RONDA=0 PYTHONUTF8=1
chaos validate chaos/experiments/latencia-salida-angel.json
chaos run --rollback-strategy=always --journal-path chaos/results/journal-ronda-$RONDA.json chaos/experiments/latencia-salida-angel.json
node chaos/gate.js --ronda $RONDA
```

Pasos que ejecuta Chaos Toolkit, en orden:

1. Hipotesis de estado estable: `/health` responde 200 y `GET /api/v5/flujo/random` responde 200 en menos de 2000 ms.
2. Metodo: comprueba que no hay fallos activos, activa 3000 ms de latencia hacia Angel con TTL de 420 s,
   espera 5 s (cache del interruptor), hace una peticion de muestra y lanza k6 con el perfil declarado.
3. Vuelve a evaluar la hipotesis con el fallo todavia activo. Ronda 0: se refuta (desviado). Ronda 1: se mantiene.
4. Rollbacks (siempre, aunque algo falle): borra el fallo, verifica que la lista quede vacia y que el flujo
   vuelva a responder a tiempo.

La puerta (`gate.js`) rechaza si falta evidencia, si k6 rompio un umbral, si el p95 o la tasa de error superan
`slo.json`, o si el diario registra desviacion, estado distinto de `completed` o un rollback fallido.

## Cambiar de ronda

La ronda es `RESILIENCE_ENABLED` en el coordinador. En GKE: workflow `deploy-gke.yml` con
`resilience_enabled=true`, o a mano `kubectl patch configmap medical-api-config --type merge -p '{"data":{"RESILIENCE_ENABLED":"true"}}'`
seguido de `kubectl rollout restart deployment/medical-documents-api`. La cabecera `X-Ronda` de cualquier
respuesta del flujo dice en que ronda esta el servicio; `chaos-gate.yml` lo comprueba antes de medir.

## Rondas locales (sin nube)

```bash
docker start medical-pg-test
node chaos/mocks/peer-mock.js 4101 angel &
node chaos/mocks/peer-mock.js 4102 juan &
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/medical_test \
API_C_URL=http://127.0.0.1:4101 API_A_URL=http://127.0.0.1:4102 \
CHAOS_ENABLED=true CHAOS_TOKEN=token-local-de-desarrollo-123 RESILIENCE_ENABLED=false node src/server.js &
curl -s -X POST localhost:3000/imagenes -H 'content-type: application/json' \
  -d '{"nombre":"rx_caos.jpg","url":"https://example.com/rx_caos.jpg","fecha_creacion":"2026-11-16"}'
export CHAOS_BASE_URL=http://localhost:3000 CHAOS_TOKEN=token-local-de-desarrollo-123 RONDA=0 PYTHONUTF8=1
chaos run --rollback-strategy=always --journal-path chaos/results/journal-ronda-0.json chaos/experiments/latencia-salida-angel.json
node chaos/gate.js --ronda 0
```

Para la ronda 1 se reinicia `node src/server.js` con `RESILIENCE_ENABLED=true` y se repite con `RONDA=1`.
`docker compose up` levanta la API y los dos dobles con la misma configuracion.

## Comparar las dos rondas

Los dos resumenes (`chaos/results/k6-ronda-0.json` y `k6-ronda-1.json`) traen la misma metrica medida con
el mismo instrumento, el mismo perfil, el mismo fallo y la misma duracion. La variacion porcentual es

```
variacion = (valor_ronda_1 - valor_ronda_0) / valor_ronda_0 * 100
```

Ejemplo con las rondas locales del 2026-11-16 (dobles de los compañeros, 3000 ms hacia Angel):

| Metrica | Ronda 0 | Ronda 1 | Variacion |
|---|---|---|---|
| p95 del flujo | 3046 ms | 12 ms | -99.6 % |
| Tasa de error | 0 % | 0 % | 0 |
| Respuestas degradadas | 0 % | 100 % | respuesta parcial en lugar de espera |
| Hipotesis | refutada | se mantiene | |

El informe completo, con las rondas sobre la nube, esta en `docs/chaos/INFORME_EXPERIMENTO.md`.

## Coordinacion de ventanas entre los tres experimentos

Los tres experimentos comparten el flujo `GET /api/v5/flujo` y dos de ellos tocan la misma dependencia (la
llamada del coordinador a la API de adopcion). Si se solapan, cada uno contamina la medicion del otro.

Que pasa durante la ronda 0 de Angel (unos 5 minutos de carga, hasta 7 de TTL):

- Su interruptor hace fallar el 100 % de las consultas `animal.findRandom`, asi que
  `GET /api/v2/animals/random` responde 500. Su `/api/health` sigue en 200 y RDS no se modifica.
- El coordinador ve `dependencias.angel.estado = "error"` (detalle "respondio 500").
  Con el coordinador en ronda 0 el flujo responde 502 y **no llega a llamar a Juan** (fallo en cascada).
  Con el coordinador en ronda 1 el circuito hacia Angel se abre tras 5 fallos y el flujo responde 200
  degradado con `animal: null`; Juan si se llama.
- En la ronda 1 de Angel su API responde 200 con el ultimo animal conocido (`degradado: true`), y el
  coordinador lo ve como `estado = "ok"`.
- Mientras Juan siga en 404 el flujo ya responde 502 en ronda 0 por Juan; lo que distingue la ventana de
  Angel es `dependencias.angel.estado`.

Reglas acordadas:

1. Ventanas sin solapamiento, una tras otra, de unos 15 minutos cada una (5 de carga, hasta 7 de TTL y
   las comprobaciones): Angel ronda 0, Angel ronda 1, Leonardo ronda 0, Leonardo ronda 1, Juan ronda 0,
   Juan ronda 1. Los experimentos de seguridad van en otra ventana.
2. Durante la ventana de un integrante, los otros dos no generan carga contra el flujo ni contra su API
   (sin k6, sin `chaos-gate.yml`). La carga extra cambiaria el perfil P declarado por quien mide.
3. El coordinador queda fijo en la ronda que se acuerde para la ventana (por defecto ronda 0 durante
   la ronda 0 del companero). Se confirma con la cabecera `X-Ronda` antes de empezar.
4. Prefijo de trace id por ventana para correlacionar en Grafana y en los logs de las tres nubes:
   `gameday-<integrante>-r<ronda>-...`.
5. Cada uno sabe parar a los demas: Angel con `DELETE /internal/chaos` en su API o el TTL; Leonardo con
   `node chaos/probes.js revertir` o el TTL; Juan con su interruptor. Al terminar, `sin-fallos` en verde.
6. Mi experimento de latencia sobre la nube necesita a Juan en linea (con Juan en 404 la ronda 0 siempre
   responde 502 y la metrica deja de ser comparable). Hasta entonces la evidencia es la de las rondas
   locales. Al 2026-11-17 Juan no tiene despliegue publico (su informe dice que corrio en local); su
   codigo cumple el contrato y falta que despliegue con `terraform-oci.yml`.

## En CI

`.github/workflows/chaos-gate.yml` (manual, con `ventana_autorizada=true`) instala k6 y Chaos Toolkit,
valida los archivos, comprueba la ronda desplegada (`X-Ronda`), ejecuta `chaos run`, revierte el fallo
en un paso `if: always()` que falla si el interruptor no queda vacio, corre `gate.js` y sube
`chaos/results/*.json` como artefacto. Ronda 0 termina en rojo a proposito: es la evidencia de que el
sistema sin protecciones no cumple; ronda 1 debe terminar en verde.
