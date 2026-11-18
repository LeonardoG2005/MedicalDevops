# Game day de Ingenieria del Caos de Seguridad (defensa en profundidad)

Experimentos que verifican si los controles de defensa en profundidad de la
arquitectura multinube DETECTAN, CONTIENEN y RESISTEN condiciones adversas. La
metrica no es la velocidad del sistema sino la eficacia de los controles: MTTD
(tiempo hasta la deteccion), MTTC (tiempo hasta la contencion), cobertura de
deteccion, tasa de falsos positivos y, en los datos, RPO y RTO.

Todo corre sobre la infraestructura y las cuentas del propio grupo, con datos
sinteticos, dentro de una ventana acordada, con interruptor de parada y plan de
reversion probado. No se actua sobre terceros.

## Reparto de experimentos

Grupo de 2 personas (Leonardo y Angel), version reducida de la rubrica: experimento
1 (obligatorio), experimento 2 y la version minima del experimento 4 (un bucket,
RPO y RTO; la copia aislada y la restauracion parcial son extras).

| # | Experimento | Capa | Propietario | Donde |
|---|---|---|---|---|
| 1 | Identidad de maquina y de agente del coordinador | Identidad | Leonardo | este repo (`exp1-identidad/`) |
| 2 | Exposicion y segmentacion | Red | Angel (AWS) | su repo (ver guia) |
| 4 | Resiliencia de los datos del flujo (borrado, RPO/RTO) | Datos | grupal, ejecuta Leonardo en GCP | este repo (`exp4-datos/`) |

La defensa con IA (correlacion con humano en el bucle) y el caos sobre la
propia capa de IA (inyeccion de instrucciones) viven en `ia/` y los ejecuta
Leonardo sobre los hallazgos del game day.

## Carpetas

| Ruta | Que es |
|---|---|
| `comun.js` | Utilidades: bitacora, interruptor de parada (`results/STOP`), gcloud, lectura de logs, RPO/RTO. |
| `exp1-identidad/ejecutar.js` | Experimento 1: estado-estable, probar, medir, informe. |
| `exp4-datos/ejecutar.js` | Experimento 4: estado-estable, sembrar, destruir, restaurar, informe. |
| `detecciones/*.json` | Deteccion como codigo: filtro de Cloud Logging + casos positivos y negativos. |
| `detecciones/evaluar.js` | Evalua cada regla contra sus casos (dispara con el ataque, calla con lo normal). |
| `ia/analizar.js` | IA con humano en el bucle: correlaciona alertas y logs del game day. |
| `ia/prueba-inyeccion.js` | Caos sobre la IA: inyecta instrucciones en un dato y verifica si se reportan. |
| `results/` | Evidencia de las rondas (ignorada por git salvo que se decida versionar). |

## Marcos de referencia

Version de 2 personas: la trazabilidad se exige solo a estos marcos.

- Tecnicas emuladas: MITRE ATT&CK (en cada `detecciones/*.json`).
- Contramedidas: MITRE D3FEND.
- Cumplimiento: ISO/IEC 27001:2022 Anexo A. Tabla de trazabilidad en
  `docs/chaos/INFORME_GAMEDAY.md`, seccion 10.
- Capa de IA (complemento): OWASP LLM01.

## Reglas de compromiso

- Ventana acordada por el grupo (variable `CHAOS_WINDOW` del coordinador y el
  campo correspondiente en los workflows).
- Radio de impacto: solo los recursos del grupo nombrados en cada experimento.
- Datos sinteticos unicamente.
- Interruptor de parada: crear el archivo `chaos/security/results/STOP` detiene
  cualquier accion adversa (`comun.comprobarParada`).
- Reversion probada antes de la primera ejecucion real; cada experimento deja
  su rutina de reversion.
- Bitacora con sello de tiempo en cada `results/*.json`.

## Prerrequisitos en GCP (los crea Terraform `seguridad.tf`, o a mano una vez)

- Auditoria de acceso a datos en Secret Manager (DATA_READ, DATA_WRITE) y
  Storage (DATA_WRITE). Sin ella no hay deteccion de identidad ni de datos.
  La activa el dueno del proyecto (CI no tiene setIamPolicy por minimo
  privilegio; ver terraform/README.md). Activa desde el 2026-11-16.
- Metricas de log `seguridad_*` (deteccion como codigo).
- Alertas `seguridad_*` y la de ausencia de latido.
- Honeytoken `medical-api-admin-backup-key`.
- Bucket de copia aislada `...-results-copia-aislada` (otra region, versioning,
  retencion, solo el desplegador escribe).
- Minimo privilegio: `medical-api-gsa` solo crea objetos en el bucket del flujo.

## Ejecutar el experimento 1 (identidad)

```bash
export CLOUDSDK_PYTHON=C:\Python315\python.exe
export CHAOS_BASE_URL=http://34.123.58.136
export CHAOS_TOKEN=$(gcloud secrets versions access latest --secret=medical-api-chaos-token)
export SEC_RESULTS_DIR=chaos/security/results

# Ronda 0 (el ConfigMap trae efimero por defecto; para la ventana se vuelve a estatico):
kubectl patch configmap medical-api-config -p '{"data":{"CHAOS_TOKEN_MODE":"estatico"}}'
kubectl rollout restart deployment/medical-documents-api
RONDA=0 node chaos/security/exp1-identidad/ejecutar.js estado-estable
RONDA=0 node chaos/security/exp1-identidad/ejecutar.js probar --cual todos
RONDA=0 node chaos/security/exp1-identidad/ejecutar.js medir        # esperar ~90 s de ingesta

# Mejora: volver a CHAOS_TOKEN_MODE=efimero (valor por defecto del ConfigMap; deploy-gke.yml o kubectl patch)
# Ronda 1:
export CHAOS_TOKEN_MODE=efimero CHAOS_AUDIENCE=chaos-gate
RONDA=1 node chaos/security/exp1-identidad/ejecutar.js probar --cual todos
RONDA=1 node chaos/security/exp1-identidad/ejecutar.js medir
RONDA=1 node chaos/security/exp1-identidad/ejecutar.js informe
```

Contencion del experimento 1: workflow `security-remediate.yml` (rota el token
con aprobacion humana registrada en el environment `produccion-seguridad`).

## Ejecutar el experimento 4 (datos)

```bash
export FLOW_ARCHIVE_BUCKET=medical-devops-400345348270-results
export SEC_COPIA_BUCKET=medical-devops-400345348270-results-copia-aislada

# Ronda 0 (hoy: versioning, sin copia aislada ni WORM):
RONDA=0 node chaos/security/exp4-datos/ejecutar.js sembrar --n 12
RONDA=0 node chaos/security/exp4-datos/ejecutar.js estado-estable
RONDA=0 node chaos/security/exp4-datos/ejecutar.js destruir --modo borrar
RONDA=0 node chaos/security/exp4-datos/ejecutar.js restaurar --desde versiones

# Mejora (Terraform seguridad.tf + storage.tf): WORM en el bucket del flujo y
# copia aislada en otra region. Ronda 1:
RONDA=1 node chaos/security/exp4-datos/ejecutar.js sembrar --n 12
# respaldo a la copia aislada (lo hace el desplegador, no el coordinador):
gcloud storage cp --recursive "gs://$FLOW_ARCHIVE_BUCKET/flujo/**" "gs://$SEC_COPIA_BUCKET/flujo/"
RONDA=1 node chaos/security/exp4-datos/ejecutar.js destruir --modo borrar
RONDA=1 node chaos/security/exp4-datos/ejecutar.js restaurar --desde copia
RONDA=1 node chaos/security/exp4-datos/ejecutar.js informe
```

El grupo autorizo de forma explicita la perdida y el borrado de estos datos
sinteticos, incluidos los experimentos destructivos. Aun asi, la ronda 0 deja
las versiones no actuales (versioning) y la ronda 1 anade la copia aislada, de
modo que la perdida real es nula salvo que se purguen tambien las versiones.

## Deteccion como codigo

```bash
node chaos/security/detecciones/evaluar.js    # cada regla: dispara con el ataque, calla con lo normal
```

Los filtros coinciden con los publicados por Terraform en `terraform/seguridad.tf`
(lo verifica `test/seguridad.detecciones.test.js`). Los casos negativos deben salir de logs reales:
la primera version de la regla de impersonacion asumia que Workload Identity no deja
`serviceAccountDelegationInfo`, y en produccion habria disparado con todo el trafico legitimo.

## IA en la defensa

```bash
# Correlacion (OpenAI o Anthropic; sin clave imprime el prompt para el chat):
node chaos/security/ia/analizar.js --entrada chaos/security/results/hallazgos.json
# Caos sobre la IA (inyeccion de instrucciones):
node chaos/security/ia/prueba-inyeccion.js
```

La salida de `analizar.js` es una PROPUESTA; el humano la contrasta contra la
telemetria real y marca que acerto, que invento y que se descarto (campo
`contraste_humano`). El modelo nunca ejecuta acciones.
