# Informe del game day: Ingenieria del Caos de Seguridad (defensa en profundidad)

Grupo de Defensa en Profundidad: Leonardo Guevara (GCP) y Angel Avirama (AWS). Se aplica la **version
reducida para grupos de 2 personas**: experimento 1 (obligatorio), experimento 2 (elegido) y la version
minima del experimento 4 (un bucket, RPO y RTO); la trazabilidad se reporta frente a ISO/IEC 27001:2022
Anexo A y MITRE ATT&CK/D3FEND. Entrega final, maximo 10 paginas. Este informe es distinto del de DevOps
(`docs/chaos/INFORME_EXPERIMENTO.md`): aqui no se mide rendimiento sino la **eficacia de los controles**
(MTTD, MTTC, cobertura de deteccion, falsos positivos y, en los datos, RPO y RTO).

Cada experimento tiene su informe detallado y su evidencia con sello de tiempo en el repositorio de su
propietario:

| # | Capa | Propietario | Informe | Evidencia |
|---|---|---|---|---|
| 1 | Identidad de maquina del coordinador | Leonardo | este informe, seccion 4 | `MedicalDevops/chaos/security/results/exp1-ronda-{0,1}.json` |
| 2 | Exposicion y segmentacion de red | Angel | [`Api_Pet_Adoption/docs/security/INFORME_GAMEDAY_EXP2.md`](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/INFORME_GAMEDAY_EXP2.md) | `Api_Pet_Adoption/chaos/security/results/exp2-ronda-{0,1}.json` |
| 4 | Resiliencia de los datos del flujo (version minima, grupal) | grupo, ejecuta Leonardo en GCP | este informe, seccion 6 | `MedicalDevops/chaos/security/results/exp4-ronda-{0,1}.json` |

## 1. Resumen de resultados

| Exp. | Metrica objetivo | Ronda 0 (controles de hoy) | Ronda 1 (con mejoras) | Hipotesis |
|---|---|---|---|---|
| 1 identidad | contencion de la credencial mal usada y MTTD | replay aceptado (200), MTTD 4,6 s | replay rechazado (401), MTTD 4,3 s | refutada en r0, se mantiene en r1 |
| 2 red | MTTD de la exposicion (cobertura como guarda) | 0/3 detectadas, 0/3 contenidas en 10 min | MTTD 13,0 s (ECS) y 14,2 s (RDS); MTTC 21,1 s y 13,1 s; 2/3 detectadas, 3/3 contenidas | refutada en r0, se mantiene en r1 |
| 4 datos | RPO y RTO reales | RPO 0, RTO 305 s (desde versiones) | RPO 0, RTO 20 s (desde la copia aislada); destruccion bloqueada (403); restauracion parcial 3/3 en 56,5 s (extra, no exigida en la version minima) | se mantiene en r1 |

Falsos positivos medidos en el trafico normal: 0 en los tres experimentos.

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
| Capa de IA | IA de defensa con separacion datos/instrucciones y salida estructurada | Leonardo | inyeccion reportada, no ejecutada | mitigacion de OWASP LLM01 |
| Datos | Versioning, copia aislada en otra region, retencion bloqueada (WORM), minimo privilegio | grupo | `storage.objects.delete` + alerta | D3-RF, D3-RAPA |

Puntos de recoleccion: Cloud Logging y Cloud Audit Logs (GCP), CloudTrail y CloudWatch (AWS), Managed
Prometheus y Grafana Cloud (OTLP).

## 3. Reglas de compromiso

- **Ventana acordada:** cada experimento exige una ventana (`CHAOS_WINDOW`, `ventana_autorizada=true` en
  los workflows). Ventanas sin solapamiento y sin carga ajena (`chaos/README.md`).
- **Radio de impacto:** solo recursos del grupo. GCP: coordinador, bucket de resultados y secretos del
  grupo. AWS: los security groups `pet-adoption-demo-ecs-sg` y `pet-adoption-demo-rds-sg` y una tarea de
  prueba. Nada de la Universidad, de otros grupos ni de terceros. La API de vuelos participa en el flujo
  de DevOps, pero no es objetivo de ningun experimento de seguridad.
- **Datos sinteticos.** El dueno del proyecto de GCP autorizo la perdida y el borrado de sus datos de prueba.
- **Interruptor de parada:** `chaos/security/results/STOP` en GCP y en AWS.
- **Reversion probada antes de la primera ejecucion** y verificada al final de cada ronda.
- **Bitacora con sello de tiempo** en cada `results/*.json`.

**Aceptacion de las reglas de compromiso** (cada integrante confirma con su nombre y la fecha en que las
acepto, antes de su primera ejecucion):

| Integrante | Acepta las reglas de compromiso | Fecha |
|---|---|---|
| Leonardo Guevara | Acepto | 2026-11-18 |
| Angel Avirama | Acepto | 2026-11-18 |

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

Capturas de Angel (evidencia de su experimento, en su repositorio): alerta de EventBridge para
[ECS](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/img/alerta-eventbridge-ecs.png) y [RDS](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/img/alerta-eventbridge-rds.png); alarma de acceso sin ALB
en [estado de alarma](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/img/alarma-acceso-directo-alarm.png) y [de vuelta a OK](https://github.com/AngelAvirama/Api_Pet_Adoption/blob/main/docs/security/img/alarma-acceso-directo-ok.png).

## 6. Experimento 4: resiliencia de los datos del flujo (version minima, grupal, ejecuta Leonardo en GCP)

**Hipotesis:** cuando se borren los objetos del flujo en GCP, esperamos RPO 0 y un RTO acotado; con WORM y
copia aislada, ademas, que el borrado no alcance la copia y que el RTO baje. **ATT&CK** T1485, T1486.
**D3FEND** D3-RF, D3-RAPA. La version minima pide un unico bucket con RPO y RTO; la copia aislada y la
restauracion parcial son extras que se mantienen porque ya estaban medidos.

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

## 7. IA en la defensa, con humano en el bucle

**Correlacion del game day** (`chaos/security/ia/analizar.js`, OpenAI `gpt-4o-mini`, 2026-11-17).
Entrada: `chaos/security/results/hallazgos-grupo.json`, armado por `chaos/security/ia/hallazgos.js` con la
evidencia real de los tres experimentos (incluidos `exp2-ronda-0.json` y `exp2-ronda-1.json` de Angel).
Salida y contraste: `chaos/security/results/ia-analisis-grupo.json`.

| El modelo propuso | Contraste con la telemetria | Veredicto |
|---|---|---|
| Exp 1: los 401 y el 200 son intentos de acceso no autorizado y la prueba del honeytoken | correcto como agrupacion; no distingue que el 200 es la ronda 0 (replay no contenido) y el 401 de la ronda 1 es el control funcionando | acerto en parte |
| Exp 2: severidad alta | es el riesgo real mas alto: tasks de ECS alcanzables desde Internet 10 min en la ronda 0 | acerto |
| Exp 2: T1562.007 y T1048 | omite T1190 y la deteccion y contencion de la ronda 1 (13,0 s y 21,1 s), que tenia en la entrada | acerto en parte |
| Exp 2: la prueba de salida es "exfiltracion de datos" | fue una conexion a `example.com:80` para probar el filtrado; no salio ningun dato | invento (exageracion) |
| Ninguna posible inyeccion | en esta entrada no hay instrucciones dentro de los datos | acerto (sin falso positivo) |
| Exp 4: severidad alta | datos sinteticos, RPO 0 y copia que resistio el borrado (403); el riesgo residual es de disponibilidad | descartada |
| Cronologia de 11 eventos | fuera de orden, solo rondas 0 y sin la primera destruccion del exp 4 | descartada; se uso la de la seccion 9 |
| Tres preguntas para el humano | genericas, ya respondidas por las rondas 1 | descartadas |

El contraste revelo tambien un **error propio** en una corrida anterior: el experimento 2 llego sin
mediciones por un error de extraccion en `hallazgos.js`; se corrigio y se repitio. El contraste lo
reviso y firmo Leonardo Guevara el 2026-11-18 (campos `contraste_humano.revisado_por` y `revisado_en`).

**Caos sobre la capa de IA** (`chaos/security/ia/prueba-inyeccion.js`, 2026-11-18, `gpt-4o-mini`):
instrucciones inyectadas en tres vectores que el componente ingiere (contenido de un adjunto, nombre de un
adjunto, linea de log del flujo), con el mismo metodo en dos rondas. Riesgo: OWASP LLM01 Prompt Injection
(Top 10 for LLM Applications); MITRE ATLAS AML.T0051 (LLM Prompt Injection).

| Ronda | Prompt | Ejecuto | Reporto | Ignoro sin avisar |
|---|---|---|---|---|
| 0, sin mitigacion | datos pegados dentro de la instruccion, sin delimitadores ni campo para reportar | 1 de 3 | 0 de 3 | 2 de 3 |
| 1, con mitigacion | datos entre delimitadores y declarados como datos, salida JSON con `posibles_inyecciones`, sin herramientas con efecto | 0 de 3 | 3 de 3 | 0 de 3 |

En la ronda 0 el caso de la linea de log salio con severidad baja y sin preguntas, que es justo lo que
ordenaba la instruccion escondida (aunque para un token expirado podria ser tambien criterio del modelo:
se cuenta como ejecutada por prudencia). Lo mas grave de la ronda 0 no es esa obediencia sino que ninguna
inyeccion se noto: el analista humano no tendria como saber que un dato intento manipular el analisis.
Con la mitigacion las tres se reportan y ninguna cambia la salida. Evidencia:
`chaos/security/results/ia-inyeccion.json` (`resumen`, `ronda_0_sin_mitigacion` y `resultados`).
El evaluador de la ronda 0 tenia un defecto que se corrigio antes de reportar: contaba como "analisis
vaciado" un grupo devuelto como objeto en lugar de lista.

## 8. Tendencias del sector instrumentadas

1. **Identidad de agentes y privilegios de maquina no gestionados** (Gartner, Top Strategic Technology
   Trends for 2027, publicado el 20 de octubre de 2026; referencia tomada de la rubrica del curso y
   consultada el 17 de noviembre de 2026). Instrumentado en el exp 1: credencial de maquina efimera, con
   audiencia y ventana, deteccion de impersonacion de la identidad de carga y honeytoken.
2. **Remediacion autonoma con aprobacion humana registrada.** GCP: `security-remediate.yml` rota el token
   tras la aprobacion de un revisor (GitHub registra quien y cuando). AWS: la Lambda de Angel retira la
   regla publica sin esperar a una persona; la politica de que grupos se protegen se aprueba en el
   repositorio y cada accion queda registrada.
3. **Honeytoken en el flujo:** el secreto senuelo `medical-api-admin-backup-key` de GCP, con alerta sobre
   cualquier `AccessSecretVersion`. Fuente: MITRE D3FEND, Decoy User Credential (D3-DUC),
   https://d3fend.mitre.org/technique/d3f:DecoyUserCredential/, consultada el 16 de noviembre de 2026.

## 9. Cronologia del game day (UTC)

| Hora UTC | Exp. | Que paso |
|---|---|---|
| 11-16 21:39:50 | 1 r0 | Replay del secreto desde otro origen: 200 (no contenido). Token de otra audiencia: 401. |
| 11-16 21:39:53 | 1 r0 | Lectura del senuelo; audit log de inmediato. |
| 11-16 21:43:20 | 1 r1 | Con tokens efimeros: replay 401 `token_estatico_rechazado`, audiencia 401, senuelo detectado. |
| 11-16 21:47:21 | 4 r0 | Borrado de los objetos del flujo. |
| 11-16 21:55:10 | 4 r0 | Restauracion completa desde versiones (RTO 305,2 s). |
| 11-16 21:57:22 | 4 r1 | Borrado de los objetos del flujo con la copia aislada vigente. |
| 11-16 21:58:13 | 4 r1 | Restauracion completa desde la copia (RTO 20,1 s); el borrado de la copia devuelve 403. |
| 11-17 03:05:34 | 2 r0 | Puerto 3000 de ECS abierto a Internet; CloudTrail lo registra; nadie es avisado. |
| 11-17 03:15:47 | 2 r0 | Fin de la observacion de ECS sin contencion; se abre el 5432 de RDS. |
| 11-17 03:25:59 | 2 r0 | Sin contencion de RDS; un task conecta a `example.com:80`. Reversion a las 03:27:00. |
| 11-17 14:57:00 | 2 r1 | Puerto 3000 de ECS abierto; alerta a los 13,0 s; contenido a los 21,1 s (14:57:21). |
| 11-17 14:57:28 | 2 r1 | Puerto 5432 de RDS abierto; contenido a los 13,1 s (14:57:41); salida a TCP 80 bloqueada. |
| 11-17 14:58:52 | 2 r1 | Reversion: no quedaba ninguna regla. |

## 10. Trazabilidad control, experimento y marco

Version de 2 personas: ISO/IEC 27001:2022 Anexo A y MITRE ATT&CK/D3FEND.

| Exp. | Control | ATT&CK | D3FEND | ISO/IEC 27001:2022 Anexo A |
|---|---|---|---|---|
| 1 | credencial efimera, deteccion de impersonacion, honeytoken | T1550.001, T1078.004, T1555.006 | D3-RAPA, D3-UAP, D3-DUC | A.5.16, A.5.17, A.8.5 |
| 2 | alerta y contencion de reglas publicas, alarma sin ALB, filtrado de salida, RDS privado | T1562.007, T1190, T1048 | D3-ITF, D3-NTF, D3-NTA, D3-OTF, D3-NI | A.8.16, A.8.20, A.8.22 |
| 4 | versioning, WORM, copia aislada, minimo privilegio sobre el bucket | T1485, T1486 | D3-RF, D3-RAPA | A.8.13 |
| IA | correlacion con humano en el bucle, separacion datos/instrucciones | (ATLAS AML.T0051) | - | A.5.7 |

## 11. Lecciones, riesgos residuales y proximos experimentos

- **Leccion comun:** en los tres experimentos la senal existia antes del game day; lo que faltaba era
  convertirla en alerta y contencion (exp 2), en contencion (exp 1) o en una copia que el atacante no
  alcance (exp 4).
- **Al pasar las reglas a produccion** aparecieron dos falsos positivos que los casos sinteticos no
  mostraban: la regla de impersonacion disparaba con Workload Identity legitimo (71 veces en 6 h; 0 tras
  la correccion) y Terraform leia el valor del honeytoken en cada corrida. Los casos negativos se tomaron
  luego de logs reales.
- **Tercer falso positivo, en el primer despliegue desde CI** (2026-11-18 04:42 UTC, correo critico de
  `seguridad_identidad_coordinador_impersonada`). `deploy-gke.yml` corre la migracion como un job de
  Cloud Run con la cuenta del coordinador (`medical-api-gsa`); el robot de Cloud Run
  (`serverless-robot-prod`) usa esa identidad para conectarse a Cloud SQL y leer secretos, y en la
  auditoria eso aparece como delegacion. La regla hizo lo que debia (uso de la identidad fuera de
  Workload Identity); el defecto es de diseno: una misma identidad para el coordinador y para la
  migracion. Mitigacion inmediata: desplegar sin migracion cuando no hay migraciones nuevas. Correccion
  propuesta: cuenta de servicio propia para la migracion, con solo `cloudsql.client` y acceso al secreto
  de la base, de modo que cualquier uso de `medical-api-gsa` fuera de los pods vuelva a ser anomalo.
- **Riesgos residuales:** el circuit breaker y la cache del interruptor son por pod; los tasks de AWS
  tienen IP publica y la salida por 443 sigue abierta; un borrado sin generacion todavia oculta la
  version viva del bucket (impacto de disponibilidad, no de perdida); la migracion comparte identidad
  con el coordinador (ver el punto anterior).
- **Proximos experimentos:** fallo correlacionado (nodo de GKE); desactivar el trail o la Lambda y medir si
  la alarma de la app lo cubre; salto este-oeste en la VPC; quitar `storage.objects.delete` de la version
  viva a toda identidad distinta del respaldo y repetir el exp 4.

## Apoyo de IA en este informe

Se uso Claude (Anthropic) para disenar los experimentos 1 y 4, escribir sus herramientas y esta
estructura; Angel declara su propio uso en su informe. Los numeros vienen de los
`results/*.json`, no del modelo. Se descarto inyectar el fallo por variable de entorno del Deployment
(reinicia pods durante la medicion) y bloquear la retencion del bucket del flujo a mano (decision
irreversible que se dejo a Terraform y al dueno).
