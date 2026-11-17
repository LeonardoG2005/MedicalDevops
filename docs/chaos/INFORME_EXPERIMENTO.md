# Informe de experimento: latencia inyectada en la llamada saliente hacia la API de Angel

Medical Documents API (coordinador, GCP / GKE). Release 5, Ingeniería del Caos.
Autor: Leonardo Guevara. Estado del documento: **borrador con mediciones locales**.
Las celdas marcadas `PENDIENTE` se completan cuando las tres APIs estén en línea y
se ejecuten las rondas sobre la nube (fecha prevista: antes del 18 de noviembre de 2026).

## 1. Sistema y estado estable

El flujo `GET /api/v5/flujo/:imagenId` del coordinador en GKE (2 réplicas) consulta una imagen
local, llama en cadena a la API de adopción de Angel (AWS, `GET /api/v2/animals/random`) y a la
API de vuelos de Juan (OCI, `GET /api/v2/entidades/vuelos/random`) y responde con las tres entidades,
propagando `X-Trace-Id` extremo a extremo.

Estado estable declarado (medido con el perfil P sin fallo, mismo instrumento):

| Indicador | Valor medido (local, dobles) | Valor medido (nube) |
|---|---|---|
| Tasa de éxito del flujo | 100 % (900/900 en ronda 0 sin contar el fallo) | PENDIENTE |
| p95 extremo a extremo | 13 ms hacia Juan, 45 ms hacia Angel en la primera llamada; flujo completo por debajo de 60 ms | PENDIENTE |
| Sondas de Chaos Toolkit antes del fallo | `salud` 200, `flujo` 200 en menos de 2000 ms (las dos rondas) | PENDIENTE |

Umbrales declarados antes de medir (`chaos/slo.json`): p95 < 2000 ms, tasa de error < 5 %, mínimo 300
peticiones por ronda.

## 2. Hipótesis

"Dado el perfil de carga P (10 usuarios virtuales en bucle cerrado durante 5 minutos: 30 s de subida,
4 min sostenidos, 30 s de bajada), cuando se inyecten 3000 ms de latencia en la llamada saliente hacia la
API de Angel durante la duración de la carga, el flujo `GET /api/v5/flujo` mantendrá la latencia p95
extremo a extremo por debajo de 2000 ms y la tasa de error por debajo del 5 %."

Métrica objetivo única: **p95 de `http_req_duration` medido por k6** durante los 5 minutos del perfil.
Instrumento: k6 (`chaos/k6/flujo.js`, `handleSummary` a JSON). Ventana de observación: la carga completa.

## 3. Método

| Elemento | Valor |
|---|---|
| Herramienta declarativa | Chaos Toolkit 1.19, `chaos/experiments/latencia-salida-angel.json` |
| Interruptor propio | tabla `chaos_faults` + `POST/DELETE /internal/chaos` con token y TTL (`src/chaos/`) |
| Inyección | `latency_ms=3000` para `peer=angel`, aplicada en `src/v5/peer-client.js` antes de `fetch`, con la misma señal de aborto |
| Carga | k6, perfil fijo, `GET /api/v5/flujo/random` con `X-Trace-Id` por petición |
| Radio de impacto | solo la dependencia `angel` del flujo v5 en los pods del coordinador; nada más se toca |
| Duración | 5 min de carga; TTL del fallo 420 s (reversión automática si la ejecución muere) |
| Condiciones de aborto | k6 detiene la carga si `http_req_failed > 50 %` durante 60 s; `chaos run --rollback-strategy=always` |
| Reversión | `DELETE /internal/chaos/angel`, verificación de lista vacía y de estado estable; paso `if: always()` en CI; TTL |
| Diferencia entre rondas | solo `RESILIENCE_ENABLED` (`false` ronda 0, `true` ronda 1) |

Orden de ejecución: hipótesis antes, comprobación de que no hay fallos, activación, pausa de 5 s (caché),
petición de muestra, k6, hipótesis después (con el fallo aún activo), rollbacks.

## 4. Ronda 0 (sin protecciones)

Ejecución local del 2026-11-16 (14:55 a 15:01 UTC), coordinador en Node 26 contra los dobles de los
compañeros (`chaos/mocks/peer-mock.js`), 900 peticiones, 3 por segundo.

| Métrica | Valor |
|---|---|
| p95 del flujo | 3046 ms |
| p99 | 3232 ms |
| mediana | 3017 ms |
| Tasa de error | 0 % |
| p95 de la dependencia Angel | 3020 ms |
| p95 de la dependencia Juan | 13 ms |
| Hipótesis después del fallo | **refutada** (sonda `flujo` 3053 ms > 2000 ms, estado `deviated`) |
| Puerta de calidad | RECHAZADO |

Ejecución sobre la nube: PENDIENTE (p95, p99, error, estado del diario, enlace al artefacto del workflow).

### Modo de fallo observado y diagnóstico

Toda la latencia del compañero se suma al flujo: el coordinador espera los 3000 ms de Angel, luego llama
a Juan, y el usuario recibe la respuesta completa pero tardía. Con 10 usuarios en bucle cerrado el
throughput cae a 3 peticiones por segundo (cada usuario queda bloqueado 3 s por petición): es
**saturación por timeouts demasiado largos**, el primer paso de un fallo en cascada. No hubo errores porque
no existía ningún timeout: la ausencia de errores es precisamente el síntoma de que nada protegía al flujo.
Si la dependencia hubiera respondido 5xx en lugar de tardar, el flujo habría devuelto 502 sin llamar a Juan
(`test/v5.flujo.test.js`, "si Angel falla el flujo responde 502 y no llama a Juan"): fallo en cascada.

Evidencia: `chaos/results/k6-ronda-0.json`, `journal-ronda-0.json`, `gate-ronda-0.json`; logs con
`evento: flujo_completado` y `dependencias.angel.duracion_ms` alrededor de 3000; en la nube, trazas de
Tempo con el span hacia Angel de 3 s (PENDIENTE: capturas).

## 5. Mejora aplicada

Elegida a partir del diagnóstico (latencia, no error):

1. **Timeout por dependencia (2000 ms)**: `AbortSignal.timeout` compartido por la espera inyectada y
   `fetch`. Acota el costo máximo de un compañero lento.
2. **Circuit breaker por compañero** (opossum: 5 llamadas, 50 % de fallos, 10 s de reposo): tras los
   primeros timeouts deja de llamar a Angel y el flujo responde de inmediato; cada 10 s prueba una llamada.
3. **Degradación elegante**: el flujo completa la cadena (sigue llamando a Juan) y responde 200 con
   `animal: null` y `degradado: true` en lugar de 502.

Descartado a propósito: reintentos. Contra una latencia, reintentar duplica la presión sobre el compañero
lento y la latencia propia (tormenta de reintentos). Pendiente de backlog: mamparo de concurrencia por
dependencia y estado del breaker compartido entre réplicas.

## 6. Ronda 1 (con protecciones)

Ejecución local del 2026-11-16 (15:04 a 15:09 UTC), mismo código, mismo fallo, mismo perfil, mismo
instrumento, `RESILIENCE_ENABLED=true`. 413 997 peticiones, 1380 por segundo.

| Métrica | Ronda 0 | Ronda 1 | Variación |
|---|---|---|---|
| p95 del flujo | 3046 ms | 12 ms | -99.6 % |
| p99 del flujo | 3232 ms | 17 ms | -99.5 % |
| Máximo | 3343 ms | 2022 ms (el primer timeout) | -39.5 % |
| Tasa de error | 0 % | 0 % | sin cambio |
| Respuestas degradadas | 0 % | 100 % | |
| Circuito abierto | 0 % | 99.99 % de las peticiones | |
| Hipótesis después del fallo | refutada | **se mantiene** (sonda `flujo` 200 en menos de 2000 ms) |
| Puerta de calidad | RECHAZADO | APROBADO | |

Conclusión local: la hipótesis se mantiene en la ronda 1. La métrica objetivo pasa de 3046 ms a 12 ms
porque, tras los primeros cinco timeouts de 2 s, el circuito se abre y el flujo deja de esperar a Angel;
la cadena sigue hasta Juan y el usuario recibe la imagen y el vuelo con `animal: null`.

Ronda 1 sobre la nube: PENDIENTE (tabla equivalente con los valores reales y enlace al tablero).

## 7. Hallazgos inesperados

- El throughput de la ronda 1 (1380 req/s) es 460 veces el de la ronda 0 (3 req/s) con la misma carga:
  en bucle cerrado, la latencia del compañero gobierna el throughput. Esto explica por qué un timeout
  demasiado largo se convierte en un problema de capacidad, no solo de latencia.
- El breaker casi nunca cierra mientras el fallo sigue activo: cada prueba en estado semiabierto vuelve
  a expirar a los 2 s y reabre el circuito (99.99 % abierto). Es el comportamiento esperado, pero significa
  que la recuperación real se ve solo cuando el fallo termina (sonda `el-sistema-volvio-al-estado-estable`).
- El diario de Chaos Toolkit en Windows falla con cp1252 por los caracteres de k6; se necesita
  `PYTHONUTF8=1`. En el runner de CI (Linux) no ocurre.
- El 2026-11-16, en la tarde, la API de Angel volvió a responder en su nuevo ALB y el coordinador la ve en
  `estado = "ok"` con el trace id propagado; la de Juan sigue en 404. Antes de eso las dos estaban fuera de
  línea; con ellas caídas el flujo en ronda 0
  responde 502 por `fetch failed` (error, no timeout), lo que enmascararía el experimento de latencia.

## 8. Backlog de resiliencia

| Pendiente | Por qué |
|---|---|
| Estado del circuit breaker compartido entre réplicas (Memorystore) | hoy cada pod abre su propio circuito |
| Mamparo de concurrencia por dependencia | un compañero lento podría agotar el pool de peticiones del pod antes de que el breaker abra |
| Caché del último animal/vuelo conocido para degradar con datos y no con `null` | mejor experiencia en degradación |
| Rondas sobre la nube con las tres APIs en línea y capturas del tablero | evidencia final del informe |
| Autoscaling (HPA max > 2) después del experimento | se fijó en 2 para comparar rondas con capacidad idéntica |

## 9. Evidencia de observabilidad

- Tablero Cloud Monitoring (Terraform `terraform/chaos.tf`): PENDIENTE (enlace tras `terraform apply`).
- Tablero Grafana Cloud (`chaos/grafana/dashboard-caos.json`), importado el 2026-11-17:
  https://browngecko19.grafana.net/d/medical-caos-v5. Capturas de las dos rondas sobre la nube: PENDIENTE.
- Traza distribuida real (Tempo, 2026-11-17): una sola traza contiene el span del flujo en GKE, la escritura
  del archivo en GCS, las consultas a Cloud SQL, la llamada a la API de Angel con sus propios spans de servidor
  (`api-b-adopcion`) y la llamada a la API de Juan en Railway. Las tres APIs responden 200 de punta a punta.
- Trazas: `trace_id` y `span_id` ya aparecen en los logs del pod en GKE junto con `traceId`
  (verificado el 2026-11-16 con `X-Trace-Id: humo-gke-0002`). Capturas de Tempo: PENDIENTE.
- Archivos de las dos rondas locales: `chaos/results/` (versionados: k6-ronda-N.json, journal-ronda-N.json, gate-ronda-N.json).

## 10. Apoyo de IA (opcional de la rubrica)

Se usó Claude (Anthropic) para auditar el repositorio, proponer la asignación de fallos, redactar el
experimento, el generador de carga, los patrones y esta estructura de informe. Se descartó de lo propuesto:
reintentos con retroceso exponencial (amplifican una latencia), un tablero único en lugar de dos (el grupo
ya usa Grafana Cloud y la cátedra pide evidencia reproducible como código, de ahí Terraform), y parchear
variables de entorno del Deployment como mecanismo de inyección (reinicia pods durante la medición).
