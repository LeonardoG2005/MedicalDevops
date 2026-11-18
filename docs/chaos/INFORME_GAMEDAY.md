# Informe del game day: Ingenieria del Caos de Seguridad (defensa en profundidad)

Grupo MedicalDevOps: Leonardo Guevara (GCP), Angel Avirama (AWS) y Juan Jose Giraldo (API de vuelos).
Entrega final de Defensa en Profundidad, maximo 10 paginas. Este informe es distinto del de DevOps
(`docs/chaos/INFORME_EXPERIMENTO.md`): aqui no se mide rendimiento sino la **eficacia de los controles**
(MTTD, MTTC, cobertura de deteccion, falsos positivos y, en los datos, RPO y RTO).

Cada experimento tiene su informe detallado y su evidencia con sello de tiempo en el repositorio de su
propietario:

| # | Capa | Propietario | Informe | Evidencia |
|---|---|---|---|---|
| 1 | Identidad de maquina del coordinador | Leonardo | este informe, seccion 4 | `MedicalDevops/chaos/security/results/exp1-ronda-{0,1}.json` |
| 2 | Exposicion y segmentacion de red | Angel | [`Api_Pet_Adoption/docs/security/INFORME_GAMEDAY_EXP2.md`](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/INFORME_GAMEDAY_EXP2.md) | `Api_Pet_Adoption/chaos/security/results/exp2-ronda-{0,1}.json` |
| 3 | Telemetria y dato (capa de IA) | Juan | [`clic_kiusys/chaos/security/informe-game-day.md`](https://github.com/juangz1912/clic_kiusys/blob/develop/chaos/security/informe-game-day.md) | `clic_kiusys/chaos/security/results/game-day.json` |
| 4 | Resiliencia de los datos del flujo (grupal) | grupo, ejecuta Leonardo en GCP | este informe, seccion 7 | `MedicalDevops/chaos/security/results/exp4-ronda-{0,1}.json` |

## 1. Resumen de resultados

| Exp. | Metrica objetivo | Ronda 0 (controles de hoy) | Ronda 1 (con mejoras) | Hipotesis |
|---|---|---|---|---|
| 1 identidad | contencion de la credencial mal usada y MTTD | replay aceptado (200), MTTD 4,6 s | replay rechazado (401), MTTD 4,3 s | refutada en r0, se mantiene en r1 |
| 2 red | MTTD de la exposicion (cobertura como guarda) | 0/3 detectadas, 0/3 contenidas en 10 min | MTTD 13,0 s (ECS) y 14,2 s (RDS); MTTC 21,1 s y 13,1 s; 2/3 detectadas, 3/3 contenidas | refutada en r0, se mantiene en r1 |
| 3 telemetria | MTTD de la ausencia de latido | sin deteccion en 4 s, 0/1 | MTTD 3,06 s, MTTC 0,01 s, 1/1 | refutada en r0; en r1 T1 = 3 s se excede por 0,06 s |
| 4 datos | RPO y RTO reales | RPO 0, RTO 305 s (desde versiones) | RPO 0, RTO 20 s (desde la copia aislada); destruccion bloqueada (403); restauracion parcial 3/3 en 56,5 s | se mantiene en r1 |

Falsos positivos medidos en el trafico normal: 0 en los cuatro experimentos.

## 2. Inventario de controles por capa

| Capa | Control | Propietario | Senal que deberia producir | D3FEND |
|---|---|---|---|---|
| Identidad | Token del interruptor de caos (efimero, con audiencia y ventana) | Leonardo | `chaos_acceso` / `chaos_acceso_rechazado` en Cloud Logging | D3-RAPA, D3-ACH |
| Identidad | Workload Identity del coordinador (sin llaves estaticas) | Leonardo | audit log sin llave ni delegacion ajena | D3-UAP, D3-CR |
| Deteccion (engano) | Honeytoken `medical-api-admin-backup-key` | Leonardo | `AccessSecretVersion` sobre el senuelo | D3-DUC, D3-DO |
| Red | Security groups de ECS y RDS, RDS en subredes privadas | Angel | preventivo | D3-ITF, D3-NI |
| Red | Alerta y contencion de reglas publicas (CloudTrail, EventBridge, Lambda, SNS) | Angel | correo `[seguridad] ... abierto a Internet` | D3-NTF, D3-ITF |
| Red | Alarma de acceso sin ALB en la app (log con `traceId`) | Angel | alarma `acceso-directo-sin-alb` | D3-NTA |
| Red | Denegacion por defecto y filtrado de salida | Angel | conexion rechazada | D3-OTF |
| Telemetria | Latido del proceso y alerta por ausencia de senal | Juan | `ausencia de latido` | D3-PM |
| Telemetria | Bitacora de solo anexo | Juan | intento de truncar falla | D3-PM |
| Engano | Senuelo `/internal/senuelo` | Juan | linea `alerta senuelo` con trace id | D3-DO |
| Capa de IA | Campos que se tratan como dato y no como orden; IA de defensa con separacion datos/instrucciones | Juan, Leonardo | inyeccion reportada, no ejecutada | ATLAS AML.T0051 (mitigacion) |
| Datos | Versioning, copia aislada en otra region, retencion bloqueada (WORM), minimo privilegio | grupo | `storage.objects.delete` + alerta | D3-RF, D3-RAPA |

Puntos de recoleccion: Cloud Logging y Cloud Audit Logs (GCP), CloudTrail y CloudWatch (AWS), bitacora
del proceso de la API de vuelos, Managed Prometheus y Grafana Cloud (OTLP).

## 3. Reglas de compromiso

- **Ventana acordada:** cada experimento exige una ventana (`CHAOS_WINDOW`, `ventana_autorizada=true` en
  los workflows). Ventanas sin solapamiento y sin carga ajena (`chaos/README.md`).
- **Radio de impacto:** solo recursos del grupo. GCP: coordinador, bucket de resultados y secretos del
  grupo. AWS: los security groups `pet-adoption-demo-ecs-sg` y `pet-adoption-demo-rds-sg` y una tarea de
  prueba. API de vuelos: su proceso y su vuelo sintetico. Nada de la Universidad, de otros grupos ni de
  terceros.
- **Datos sinteticos.** El dueno del proyecto de GCP autorizo la perdida y el borrado de sus datos de prueba.
- **Interruptor de parada:** `chaos/security/results/STOP` en GCP y en AWS; en la API de vuelos,
  `POST /internal/chaos` con `pausada=false`.
- **Reversion probada antes de la primera ejecucion** y verificada al final de cada ronda.
- **Bitacora con sello de tiempo** en cada `results/*.json`.

**Aceptacion de las reglas de compromiso** (cada integrante confirma con su nombre y la fecha en que las
acepto, antes de su primera ejecucion):

| Integrante | Acepta las reglas de compromiso | Fecha |
|---|---|---|
| Leonardo Guevara | PENDIENTE | |
| Angel Avirama | PENDIENTE (su informe declara las ventanas "acordadas con el grupo") | |
| Juan Jose Giraldo | PENDIENTE | |

## 4. Experimento 1: identidad de maquina del coordinador (Leonardo, GCP)

**Hipotesis:** dado el control de identidad del interruptor de caos tal como esta (secreto compartido
estatico), cuando la credencial se use desde un origen o con un alcance no previstos, esperamos la senal
en Cloud Logging en menos de 5 min; con el token efimero esperamos ademas el rechazo inmediato.
**ATT&CK** T1550.001, T1078.004, T1555.006. **D3FEND** D3-RAPA, D3-UAP, D3-DUC.

| Metrica | Ronda 0 (estatico) | Ronda 1 (efimero) |
|---|---|---|
| Replay del secreto desde otro origen contenido | no (HTTP 200) | si (401 `token_estatico_rechazado`) |
| Token para otra audiencia contenido | si (401 `audiencia_invalida`) | si |
| Honeytoken detectado | si (~0 s) | si (~0 s) |
| MTTD del replay | 4,6 s | 4,3 s |
| Falsos positivos | 0 | 0 |

**Diagnostico:** la deteccion ya existia; faltaba contencion, porque una credencial de larga vida sirve
desde cualquier origen y para siempre. **Mejoras:** (1) tokens efimeros firmados con audiencia y TTL de
15 min, con el secreto rechazado en la red (`src/chaos/token.js`); (2) deteccion como codigo del uso desde
origen no previsto y de la impersonacion de la identidad de carga (`chaos/security/detecciones/01..03`).
Contencion con aprobacion humana registrada: `security-remediate.yml` rota el token.

## 5. Experimento 2: exposicion y segmentacion de red (Angel, AWS)

Resumen del informe de Angel. **Hipotesis:** cuando aparezca una regla `0.0.0.0/0` en un security group
privado (ECS o RDS), una alerta llega al responsable en T1 <= 5 min y la regla se contiene en T2 <= 10 min.
Metrica objetivo: MTTD de la exposicion, con la cobertura de deteccion como guarda. Solo cuenta como
deteccion una alerta que llega a una persona; un registro que nadie lee es "senal registrada".

| Caso | Condicion adversa | ATT&CK |
|---|---|---|
| ecs | puerto 3000 de los tasks abierto a Internet: ruta no declarada que salta el ALB | T1562.007, T1190 |
| rds | puerto 5432 de la base abierto a Internet | T1562.007 |
| salida | conexion de un task a Internet por un puerto no permitido (TCP 80) | T1048 |

| Metrica | Ronda 0 | Ronda 1 |
|---|---|---|
| MTTD ECS / RDS | no detectada en 600 s / no detectada | 13,0 s / 14,2 s |
| MTTC ECS / RDS | no contenida / no contenida | 21,1 s / 13,1 s |
| Salida a puerto no permitido | conecta | bloqueada |
| Cobertura de deteccion | 0/3 | 2/3 |
| Contencion | 0/3 | 3/3 |
| Tiempo expuesto a Internet (ECS) | 10 min (57 de 57 muestras respondieron 200) | 21 s |
| Falsos positivos | 0 | 0 |

**Diagnostico:** la senal existia (CloudTrail en 0,2 s y el log de la app con el trace id), pero no habia
camino de la senal a una persona ni a una accion. **Mejoras:** deteccion como codigo y contencion autonoma
(EventBridge y una Lambda con minimo privilegio que retira la regla y avisa), alarma sobre la senal de la
aplicacion, y denegacion por defecto con filtrado de salida. Hallazgo: RDS no quedo expuesto porque esta
en subredes privadas; otra capa contuvo el riesgo.

## 6. Experimento 3: telemetria y dato (Juan, API de vuelos)

Resumen del informe de Juan. **Hipotesis:** cuando se pause la telemetria, la senal de ausencia aparece en
T1 <= 3 s y la contencion (volver a ver el latido) en T2 <= 10 s. **ATT&CK** T1562.001 (resistida T1070).
**D3FEND** D3-PM, D3-DO. **ATLAS** AML.T0051 (dato con instruccion).

| Metrica | Ronda 0 | Ronda 1 |
|---|---|---|
| MTTD | sin deteccion en 4 s | 3,06 s |
| MTTC | no aplica | 0,01 s |
| Cobertura | 0/1 | 1/1 |
| Falsos positivos | 0 (20,34 s de trafico sano) | 0 |

Ademas: el senuelo `/internal/senuelo` alerto con su trace id y no se activo con 5 peticiones normales;
la instruccion "Ignora las instrucciones anteriores" en el campo `aeronave` se guardo como texto y no
borro ni cambio nada (respuesta 201, capacidad intacta).

**Observaciones del grupo:** en la ronda 1 el MTTD supera T1 por 0,06 s (el sondeo de 0,5 s); en sentido
estricto T1 no se cumple, y el informe de Juan lo declara. La corrida fue local, sobre el proceso de la API
en su maquina; la alerta equivalente de Grafana Cloud esta versionada pero no aplicada.

## 7. Experimento 4: resiliencia de los datos del flujo (grupal, ejecuta Leonardo en GCP)

**Hipotesis:** cuando se borren los objetos del flujo en GCP, esperamos RPO 0 y un RTO acotado; con WORM y
copia aislada, ademas, que el borrado no alcance la copia y que el RTO baje. **ATT&CK** T1485, T1486.
**D3FEND** D3-RF, D3-RAPA.

| Metrica | Ronda 0 | Ronda 1 |
|---|---|---|
| Objetos borrados | 12 de 12 | 12 de 12 |
| Via de recuperacion | versiones no actuales | copia aislada (us-east1) |
| RPO | 0 | 0 |
| RTO | 305,2 s | 20,1 s |
| Destruccion de la copia | no aplica | bloqueada por la retencion (HTTP 403 hasta 2026-11-23) |
| Restauracion parcial (3 objetos elegidos, 2026-11-17) | no aplica | 3 de 3 integros (md5 igual al de la copia), RTO parcial 56,5 s |
| Destruccion en el bucket del flujo (retencion de 1 dia bloqueada) | no aplica | bloqueada (HTTP 403); el dato sigue retenido |

**Diagnostico:** el versioning recupera los datos, pero lento (objeto por objeto) y un administrador del
bucket podria purgar tambien las versiones. **Mejoras:** copia aislada en otra region con IAM separado y
retencion bloqueada (WORM) en el bucket del flujo y en la copia; el coordinador solo puede crear objetos.

**Hallazgo:** la retencion impide **destruir** una version, pero no **ocultar** la version viva: con
versioning, un borrado sin generacion la deja como version no actual. Asi quedo la copia aislada despues
de la prueba de borrado: 0 objetos vivos y las 12 versiones intactas. La restauracion parcial lee esas
versiones. Para un atacante con permiso de escritura el impacto es de disponibilidad (hay que restaurar),
no de perdida de datos; el siguiente paso seria quitar tambien el permiso de borrar la version viva
(`storage.objects.delete`) a cualquier identidad distinta del proceso de respaldo.

## 8. IA en la defensa, con humano en el bucle

**Correlacion del game day completo** (`chaos/security/ia/analizar.js`, OpenAI `gpt-4o-mini`, 2026-11-17).
Entrada: `chaos/security/results/hallazgos-grupo.json`, armado por `chaos/security/ia/hallazgos.js` con la
evidencia real de los cuatro experimentos (incluidos `exp2-ronda-0.json` y `exp2-ronda-1.json` de Angel y
`game-day.json` de Juan). Salida y contraste: `chaos/security/results/ia-analisis-grupo.json`.

| El modelo propuso | Contraste con la telemetria | Veredicto |
|---|---|---|
| Exp 3: alerta de ausencia y senuelo, sin falsos positivos | `mttd_ronda_1_s` 3,06, `falsos_positivos_regla` 0 | acerto |
| Exp 2: exposiciones no detectadas pese a CloudTrail | coincide con la ronda 0 de Angel; omite la ronda 1 (13,0 s y 21,1 s) que tenia en la entrada | acerto en parte |
| Marco como inyeccion el texto "Ignora las instrucciones anteriores" de los datos de Juan | es una instruccion real dentro de un dato; no la obedecio | acerto |
| Exp 1: los 401 indican "problemas de autenticacion" | el 401 de la ronda 1 es el control funcionando; en la ronda 0 el replay obtuvo 200 | invento (lectura invertida) |
| Exp 4: "problemas de retencion" | la retencion funciono: el 403 es el WORM protegiendo la copia | invento |
| Cronologia de 13 eventos | desordenada y sin el experimento 4 ni la contencion de la ronda 1 del exp 2 | descartada; se uso la de la seccion 10 |
| Severidades (media salvo exp 4 alta) | el riesgo real mas alto fue el exp 2 ronda 0 (tasks alcanzables desde Internet 10 min) | descartadas |
| Tres preguntas para el humano | parten de las lecturas erroneas o ya estaban respondidas | descartadas |

El contraste revelo tambien un **error propio**: la primera corrida recibio el experimento 2 sin
mediciones por un error de extraccion en `hallazgos.js`; se corrigio y se repitio. La firma del contraste
es de Leonardo (campo `contraste_humano.revisado_por`).

**Caos sobre la capa de IA** (`chaos/security/ia/prueba-inyeccion.js`): instrucciones inyectadas en tres
vectores (contenido de un adjunto, nombre de un adjunto, linea de log). El modelo las reporto y no las
ejecuto (0 de 3). Mitigacion: separacion datos/instrucciones, salida JSON estructurada, sin herramientas
con efecto. Se repitio sin querer con datos reales en la correlacion y el resultado fue el mismo. OWASP
LLM01 (Top 10 for LLM Applications); MITRE ATLAS AML.T0051. En la API de vuelos no hay modelo: el campo
`aeronave` se trata como dato.

## 9. Tendencias del sector instrumentadas

1. **Identidad de agentes y privilegios de maquina no gestionados** (Gartner, Top Strategic Technology
   Trends for 2027, publicado el 20 de octubre de 2026; referencia tomada de la rubrica del curso y
   consultada el 17 de noviembre de 2026). Instrumentado en el exp 1: credencial de maquina efimera, con
   audiencia y ventana, deteccion de impersonacion de la identidad de carga y honeytoken.
2. **Remediacion autonoma con aprobacion humana registrada.** GCP: `security-remediate.yml` rota el token
   tras la aprobacion de un revisor (GitHub registra quien y cuando). AWS: la Lambda de Angel retira la
   regla publica sin esperar a una persona; la politica de que grupos se protegen se aprueba en el
   repositorio y cada accion queda registrada.
3. **Honeytoken en el flujo:** el secreto senuelo de GCP y la ruta `/internal/senuelo` de la API de vuelos.
   Fuente: MITRE D3FEND, Decoy User Credential (D3-DUC) y Decoy Object (D3-DO),
   https://d3fend.mitre.org/technique/d3f:DecoyObject/, consultada el 16 de noviembre de 2026 (informe de Juan).
4. **Reporte con los plazos del Reglamento (UE) 2024/2847 (Cyber Resilience Act)**, 24 y 72 horas,
   contrastado con Colombia (ColCERT): `clic_kiusys/chaos/security/reporte-cra.md`. Fuente:
   https://digital-strategy.ec.europa.eu/en/policies/cra-reporting, consultada el 16 de noviembre de 2026.

## 10. Cronologia del game day (UTC)

| Hora UTC | Exp. | Que paso |
|---|---|---|
| 11-16 21:39:50 | 1 r0 | Replay del secreto desde otro origen: 200 (no contenido). Token de otra audiencia: 401. |
| 11-16 21:39:53 | 1 r0 | Lectura del senuelo; audit log de inmediato. |
| 11-16 21:43:20 | 1 r1 | Con tokens efimeros: replay 401 `token_estatico_rechazado`, audiencia 401, senuelo detectado. |
| 11-16 21:47:21 | 4 r0 | Borrado de los objetos del flujo. |
| 11-16 21:55:10 | 4 r0 | Restauracion completa desde versiones (RTO 305,2 s). |
| 11-16 21:57:22 | 4 r1 | Borrado de los objetos del flujo con la copia aislada vigente. |
| 11-16 21:58:13 | 4 r1 | Restauracion completa desde la copia (RTO 20,1 s); el borrado de la copia devuelve 403. |
| 11-17 02:10:51 | 3 r0 | Telemetria pausada sin detector: sin alerta en 4 s. |
| 11-17 02:10:58 | 3 r1 | Alerta de ausencia de latido (MTTD 3,06 s), contencion (0,01 s), senuelo e inyeccion en `aeronave`. |
| 11-17 03:05:34 | 2 r0 | Puerto 3000 de ECS abierto a Internet; CloudTrail lo registra; nadie es avisado. |
| 11-17 03:15:47 | 2 r0 | Fin de la observacion de ECS sin contencion; se abre el 5432 de RDS. |
| 11-17 03:25:59 | 2 r0 | Sin contencion de RDS; un task conecta a `example.com:80`. Reversion a las 03:27:00. |
| 11-17 14:57:00 | 2 r1 | Puerto 3000 de ECS abierto; alerta a los 13,0 s; contenido a los 21,1 s (14:57:21). |
| 11-17 14:57:28 | 2 r1 | Puerto 5432 de RDS abierto; contenido a los 13,1 s (14:57:41); salida a TCP 80 bloqueada. |
| 11-17 14:58:52 | 2 r1 | Reversion: no quedaba ninguna regla. |

## 11. Trazabilidad control, experimento y marco

| Exp. | Control | ATT&CK | D3FEND | ATLAS | ISO/IEC 27001:2022 | NIST SP 800-53 / 800-207 |
|---|---|---|---|---|---|---|
| 1 | credencial efimera, deteccion de impersonacion, honeytoken | T1550.001, T1078.004, T1555.006 | D3-RAPA, D3-UAP, D3-DUC | - | A.5.16, A.5.17, A.8.5 | IA-5, AC-2 / verificacion continua, minimo privilegio |
| 2 | alerta y contencion de reglas publicas, alarma sin ALB, filtrado de salida, RDS privado | T1562.007, T1190, T1048 | D3-ITF, D3-NTF, D3-NTA, D3-OTF, D3-NI | - | A.8.16, A.8.20, A.8.22 | SC-7, SC-7(5), SI-4, IR-4 / microsegmentacion, verificacion continua |
| 3 | latido y alerta por ausencia, bitacora de solo anexo, senuelo, dato no ejecutable | T1562.001, T1070 | D3-PM, D3-DO | AML.T0051 | A.8.15, A.8.16 | AU-5, AU-9 / verificacion continua |
| 4 | WORM, copia aislada, minimo privilegio sobre el bucket | T1485, T1486 | D3-RF, D3-RAPA | - | A.8.13 | CP-9, CP-10 / minimo privilegio |
| IA | correlacion con humano en el bucle, separacion datos/instrucciones | - | - | AML.T0051 | A.5.7 | SI-4 |

## 12. Lecciones, riesgos residuales y proximos experimentos

- **Leccion comun:** en los cuatro experimentos la senal existia antes del game day; lo que faltaba era
  convertirla en alerta (exp 2, exp 3) o en contencion (exp 1) o en una copia que el atacante no alcance
  (exp 4).
- **Al pasar las reglas a produccion** aparecieron dos falsos positivos que los casos sinteticos no
  mostraban: la regla de impersonacion disparaba con Workload Identity legitimo (71 veces en 6 h; 0 tras
  la correccion) y Terraform leia el valor del honeytoken en cada corrida. Los casos negativos se tomaron
  luego de logs reales.
- **Riesgos residuales:** el circuit breaker y la cache del interruptor son por pod; los tasks de AWS
  tienen IP publica y la salida por 443 sigue abierta; la API de vuelos corre hoy en Railway y su
  experimento se ejecuto en local, no en la nube del grupo; la alerta de ausencia de Grafana no esta
  aplicada.
- **Proximos experimentos:** fallo correlacionado (nodo de GKE); desactivar el trail o la Lambda y medir si
  la alarma de la app lo cubre; salto este-oeste en la VPC; repetir el exp 3 contra el exportador real.

## Apoyo de IA en este informe

Se uso Claude (Anthropic) para disenar los experimentos 1 y 4, escribir sus herramientas y esta
estructura; Angel y Juan declaran su propio uso en sus informes. Los numeros vienen de los
`results/*.json`, no del modelo. Se descarto inyectar el fallo por variable de entorno del Deployment
(reinicia pods durante la medicion) y bloquear la retencion del bucket del flujo a mano (decision
irreversible que se dejo a Terraform y al dueno).
