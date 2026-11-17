# Informe del game day: Ingenieria del Caos de Seguridad (defensa en profundidad)

Proyecto MedicalDevOps. Coordinador en GCP/GKE (Leonardo). Maximo 10 paginas.
Estado: experimentos 1 y 4 ejecutados en la nube el 2026-11-16 con evidencia
real; experimentos 2 (Angel, AWS) y 3 (Juan, OCI) pendientes de sus repositorios
(la API de Angel volvio a estar en linea el 2026-11-16; la de Juan sigue en 404).
Las celdas marcadas PENDIENTE se completan cuando los
tres repositorios esten listos.

## 1. Inventario de controles por capa

| Capa | Control | Propietario | Senal que deberia producir | D3FEND |
|---|---|---|---|---|
| Identidad | Token del interruptor de caos (efimero, con audiencia y ventana) | Leonardo | `chaos_acceso` / `chaos_acceso_rechazado` en Cloud Logging | D3-RAPA, D3-ACH |
| Identidad | Workload Identity del coordinador (sin llaves estaticas) | Leonardo | Audit log sin `serviceAccountKeyName` ni delegacion | D3-UAP, D3-CR |
| Deteccion | Honeytoken `medical-api-admin-backup-key` | Leonardo | Audit log `AccessSecretVersion` sobre el senuelo | D3-DUC, D3-DO |
| Datos | Versioning + copia aislada (otra region) + retencion (WORM) | grupo/Leonardo | Audit log `storage.objects.delete` + alerta | D3-RF, D3-RAPA |
| Red | Security groups / ALB, denegacion por defecto, filtrado de salida | Angel | CloudTrail / AWS Config | D3-NTF, D3-ITF |
| Telemetria / IA | Latido de telemetria, alerta por ausencia de senal, defensa de la IA | Juan | Alerta "no data"; inyeccion reportada | D3-PM, D3-ST |

Puntos de recoleccion de telemetria: Cloud Logging (bitacora JSON del contenedor
y Cloud Audit Logs), Managed Prometheus (`/metrics`), Grafana Cloud (OTLP). La
auditoria de acceso a datos de Secret Manager (DATA_READ/WRITE) y Storage
(DATA_WRITE) se activo para este game day.

## 2. Reglas de compromiso

- Ventana acordada por el grupo (variable `CHAOS_WINDOW`; workflows con
  `ventana_autorizada`). Ejecucion del 2026-11-16 autorizada por el dueño.
- Radio de impacto: solo recursos del grupo en GCP (coordinador, bucket de
  resultados, secretos del grupo). No se toco AWS, OCI, la Universidad ni
  terceros.
- Datos sinteticos. El dueño autorizo de forma explicita la perdida y el borrado
  de estos datos, incluidos los experimentos destructivos.
- Interruptor de parada: `chaos/security/results/STOP`.
- Reversion probada antes de cada ejecucion (token revertido, objetos restaurados).
- Bitacora con sello de tiempo en `chaos/security/results/*.json`.

## 3. Estado estable de seguridad (medido antes)

| Indicador | Valor medido 2026-11-16 |
|---|---|
| Salud del coordinador | 200 |
| Auditoria de acceso a datos | secretmanager (read/write), storage (write) activas |
| Reglas de deteccion publicadas | 6 metricas `seguridad_*` |
| Cobertura de identidad | app (logs del interruptor) + GCP (audit) + senuelo |
| Rechazos del interruptor en 10 min | 0 |
| Objetos del flujo en el bucket | 12 (sembrados) |
| Versioning del bucket del flujo | activo |
| Copia aislada | existe (us-east1, versioning, retencion 7 dias) |

## 4. Experimento 1: identidad de maquina del coordinador (Leonardo)

Hipotesis: "dado el control de identidad del interruptor tal como esta en la
ronda 0 (secreto compartido estatico), cuando la credencial se use desde un
origen no previsto, esperamos la senal en Cloud Logging en menos de 5 min; en la
ronda 1 (token efimero con audiencia y ventana) esperamos ademas la contencion
(rechazo) inmediata." Metrica objetivo: contencion de la credencial mal usada y
MTTD. Radio: llamadas al interruptor en los pods del coordinador. ATT&CK
T1550.001, T1078.004, T1555.006 (honeytoken). D3FEND D3-RAPA, D3-UAP, D3-DUC.

Condiciones probadas: (replay) el secreto filtrado desde un agente no previsto;
(alcance) un token firmado para otra audiencia; (honeytoken) lectura del secreto
senuelo.

| Metrica | Ronda 0 (estatico) | Ronda 1 (efimero) |
|---|---|---|
| Replay contenido (credencial mal usada rechazada) | no (HTTP 200) | si (HTTP 401, `token_estatico_rechazado`) |
| Alcance contenido (audiencia equivocada) | si (401 `audiencia_invalida`) | si (401 `audiencia_invalida`) |
| Honeytoken detectado | si | si |
| MTTD del replay | 4.6 s | 4.3 s |
| MTTD del honeytoken | ~0 s (audit log del acceso) | ~0 s |
| Falsos positivos (trafico normal del flujo) | 0 | 0 |

Diagnostico: en la ronda 0 el mecanismo del fallo es una credencial de larga
vida reproducible (un secreto filtrado sirve desde cualquier origen y para
siempre). La deteccion ya existia y era rapida (MTTD < 5 s), pero no habia
contencion. Mejoras aplicadas (dos): (1) identidad efimera, tokens firmados con
audiencia y TTL de 15 min, con el secreto estatico rechazado en la red
(`src/chaos/token.js`); (2) deteccion como codigo del uso desde origen no
previsto y de la impersonacion de la identidad de carga de trabajo
(`chaos/security/detecciones/01..03`). En la ronda 1 la credencial mal usada se
rechaza y se sigue detectando. Contencion automatica con aprobacion humana:
`security-remediate.yml` rota el token (environment `produccion-seguridad` con
revisor obligatorio: la aprobacion queda registrada).

Evidencia: `chaos/security/results/exp1-ronda-0.json`, `exp1-ronda-1.json`.

## 5. Experimento 4: resiliencia de los datos del flujo (grupal, ejecuta Leonardo)

Hipotesis: "dado el almacenamiento del flujo tal como esta en la ronda 0
(versioning, sin copia aislada ni WORM), cuando se borren los objetos del flujo
en GCP, esperamos recuperar el 100% (RPO 0) con un RTO acotado; en la ronda 1
(WORM + copia aislada) esperamos ademas que el borrado no afecte la copia y que
el RTO baje." Metrica objetivo: RPO y RTO reales. Radio: bucket de resultados
del grupo. ATT&CK T1485, T1486. D3FEND D3-RF, D3-RAPA.

| Metrica | Ronda 0 | Ronda 1 |
|---|---|---|
| Objetos antes | 12 | 12 |
| Objetos tras el borrado | 0 | 0 |
| Via de recuperacion | versiones no actuales | copia aislada (us-east1) |
| RPO (objetos perdidos definitivamente) | 0 (versioning) | 0 (copia) |
| RTO (restauracion completa) | 305 s | 20 s |
| Borrado de la copia bloqueado por WORM | no aplica | si (HTTP 403 hasta 2026-11-23) |
| Deteccion del borrado | regla `seguridad_objetos_flujo_borrados` | igual |

Diagnostico: en la ronda 0 el versioning recupera los datos, pero la
restauracion objeto por objeto es lenta (305 s) y un atacante con permiso de
administrador del bucket podria purgar tambien las versiones: el dato no es
durable. Mejoras (dos): (1) copia aislada en otra region con IAM separado (solo
el desplegador la escribe) y retencion de 7 dias, mas el minimo privilegio del
coordinador (solo crea objetos, no los borra ni lee: `terraform/seguridad.tf`);
(2) inmutabilidad (retencion bloqueada WORM en el bucket del flujo via Terraform,
y demostrada en vivo sobre la copia: el borrado devolvio 403). En la ronda 1 el
RTO baja a 20 s con una copia masiva y la copia resiste el borrado.

Evidencia: `chaos/security/results/exp4-ronda-0.json`, `exp4-ronda-1.json`.

## 6. IA en la defensa y caos sobre la capa de IA (Leonardo)

Correlacion con humano en el bucle (`chaos/security/ia/analizar.js`, OpenAI
gpt-4o-mini): agrupo las alertas del game day en 3 grupos, propuso hipotesis de
causa y marco 1 posible inyeccion en una linea de log. La salida es una
propuesta; el humano la contrasta contra la telemetria real (campo
`contraste_humano` de `results/ia-analisis.json`).

Caos sobre la propia IA (`chaos/security/ia/prueba-inyeccion.js`): se inyectaron
instrucciones en tres vectores (contenido de un adjunto, nombre de un adjunto,
una linea de log). El modelo REPORTO los tres como posible inyeccion y no los
ejecuto: la mitigacion (separacion datos/instrucciones, salida JSON
estructurada, sin herramientas con efecto) es efectiva. OWASP LLM01:2025 /
Agentic 2026; MITRE ATLAS AML.T0051. Evidencia: `results/ia-inyeccion.json`.

## 7. Dos tendencias del sector instrumentadas

1. Identidad de agentes de IA y privilegios de maquina no gestionados (Gartner,
   Top Strategic Technology Trends for 2027, consultado 2026-10-20: para 2028 el
   25% de las brechas se originaria en el abuso de agentes de IA). Instrumentado:
   el experimento 1 trata la credencial de la propia plataforma de caos como una
   identidad de maquina, con tokens efimeros, audiencia, ventana, honeytoken y
   deteccion de impersonacion de la identidad de carga de trabajo.
2. Remediacion autonoma con aprobacion humana registrada. Instrumentado:
   `security-remediate.yml` rota el token y reinicia los pods tras la aprobacion
   de un revisor del environment `produccion-seguridad` (GitHub registra quien y
   cuando).

(Opcional citado como alternativa: notificacion del incidente con los tiempos
del Cyber Resilience Act (UE) 2024/2847, 24 y 72 horas, contrastado con Colombia;
y criptoagilidad postcuantica frente a CNSA 2.0, plazo 2027.)

## 8. Cronologia (resumen; el minuto a minuto esta en los results/*.json)

- Estado estable medido (exp 1 y 4).
- Exp 1 ronda 0: replay aceptado, alcance y honeytoken detectados. MTTD < 5 s.
- Mejora de identidad desplegada (modo efimero).
- Exp 1 ronda 1: replay rechazado, deteccion mantenida.
- Exp 4 ronda 0: 12 objetos borrados, restaurados desde versiones (RTO 305 s).
- Mejora de datos (copia aislada, retencion).
- Exp 4 ronda 1: 12 objetos borrados, restaurados desde la copia (RTO 20 s); el
  borrado de la copia bloqueado por retencion (403).
- Reversion verificada: sin fallos activos, token revertido, infraestructura en
  su estado inicial.

## 9. Tabla de trazabilidad control - experimento - marco

| Experimento | Control | ATT&CK | D3FEND | ATLAS | ISO 27001:2022 | NIST |
|---|---|---|---|---|---|---|
| 1 identidad | credencial efimera, honeytoken | T1550.001, T1078.004, T1555.006 | D3-RAPA, D3-UAP, D3-DUC | - | A.5.16, A.8.5 | 800-207 verificacion continua; 800-53 IA-5, AC-2 |
| 2 red (Angel) | segmentacion, filtrado de salida | T1562.007, T1021 | D3-NTF, D3-ITF | - | A.8.20, A.8.22 | 800-207 microsegmentacion; 800-53 SC-7 |
| 3 telemetria/IA (Juan) | latido, bitacora inmutable, defensa IA | T1562.001/008, T1070 | D3-PM, D3-ST | AML.T0051 | A.8.15, A.8.16 | 800-53 AU-5, AU-9 |
| 4 datos | WORM, copia aislada, minimo privilegio | T1485, T1486 | D3-RF, D3-RAPA | - | A.8.13 (respaldo) | 800-53 CP-9, CP-10 |

## 10. Lecciones, riesgos residuales y proximos experimentos

- La deteccion ya era rapida; lo que faltaba era contencion (identidad de larga
  vida) y durabilidad del dato (sin copia aislada). Las dos mejoras cierran eso.
- Riesgos residuales: el estado del circuit breaker y la cache del interruptor
  son por pod; la retencion WORM del bucket del flujo se aplica via Terraform al
  fusionar (hoy solo la copia la tiene en vivo); los experimentos 2 y 3 dependen
  de que Angel y Juan ejecuten sus partes con sus APIs en linea.
- Proximos experimentos: fallo correlacionado (nodo de GKE), rotacion de claves
  postcuantica en el borde, notificacion de incidente con los tiempos del CRA.

## Hallazgos al pasar las reglas a produccion (2026-11-17)

Dos falsos positivos que los casos de prueba sinteticos no mostraban y la telemetria real si:

1. **La regla de impersonacion disparaba con el trafico legitimo.** Workload Identity tambien deja
   `serviceAccountDelegationInfo` (sujeto `<proyecto>.svc.id.goog[default/medical-api]`). En 6 horas la
   regla habria disparado 71 veces: 39 escrituras del archivo del flujo, 20 conexiones a Cloud SQL y 12
   lecturas de secretos, todas legitimas. Se excluyo ese sujeto y los casos negativos se reemplazaron por
   la forma real de esos logs; con la regla nueva, 0 de esas 71 entradas disparan. Leccion: un caso
   negativo inventado no prueba nada; hay que sacarlo de la telemetria real (efecto de la tasa base).
2. **La propia infraestructura como codigo tocaba el senuelo.** Terraform leia el valor del honeytoken
   en cada plan y apply (lecturas de `github-actions-deployer` y del dueno con agente `Terraform/1.x`).
   Cada corrida de CI habria disparado una alerta critica. El valor del senuelo salio de Terraform.

## Apoyo de IA en este informe

Se uso Claude (Anthropic) para auditar el repositorio, diseñar los experimentos,
escribir las herramientas y esta estructura. Contraste: lo que propuso se
verifico contra la telemetria real (los numeros vienen de `results/*.json`, no
del modelo). Se descarto: inyectar el fallo por variable de entorno del
Deployment (reinicia pods durante la medicion) y bloquear la retencion del
bucket del flujo a mano (decision irreversible que se deja a Terraform y al
dueño).
