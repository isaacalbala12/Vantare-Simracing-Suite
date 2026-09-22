# T0b — Señales y decisiones de Timings

[VAN-745](https://app.notion.com/p/3e3e51695c65815a882dceaf13cde9e6) / #1316;
base `nightly@e41f703c3a015321024766cc5da55d9a6def1bcb`.
[Plan vigente](../../../engineer/PLAN.md),
[corpus y contrato](../../../../internal/engineer/replayoracle/testdata/timings/README.md).

## Decisión para T1

ObservationV1 contiene las entradas de identidad, clase, posición, vueltas,
sector, distancia y calidad necesarias para iniciar **T1 sintético**. No basta
para certificar avisos en LMU: el gap relativo es una derivación que usa una vuelta estimada y
faltan contexto de silencio y geometría en esa vista. No se implementa aquí
ningún lector, proyección, monitor, catálogo ni cambio de voz.

T1 puede implementar relaciones de clasificación con procedencia por coche y
pruebas sintéticas. Las relaciones espaciales con wrap requieren longitud/layout
identificados; el delta temporal requiere demostrar equivalencia con historia
de pasos. No se sustituye por un campo de nombre similar. Si falta una entrada
se obtiene unknown; los avisos dependientes no se habilitan por aproximación.

Se necesitará una extensión **aditiva de la proyección existente**, cuando se
demuestre el origen, para fase/banderas/contexto de pits que comparten familias.
La geometría y landmarks requieren catálogo propio versionado y enlace fiable
de pista/layout. La velocidad rival podría derivarse de LocalVelocity sólo
tras demostrar sus unidades, ejes, calidad y equivalencia; no se da por observada
porque exista el vector. No se crea otro reader LMU ni un nuevo telemetry.Frame.

## Taxonomía y evidencia de código

- **O**: candidato mapeado desde SHM/REST hasta Core/vista, no señal certificada
  en sesión LMU real. Hay que verificar calidad y `ProvenanceObserved` por campo.
- **D**: derivación posible o ya existente, cuya semántica se debe probar para
  la regla concreta; no hereda la condición «observado».
- **C**: configuración/catálogo/estado propio, identificado y versionado.
- **Ø**: ausente de ObservationV1, o no demostrado con la semántica necesaria.

Rutas respecto a `vantare-v2` en la base indicada:

| Evidencia | Ruta y líneas |
|---|---|
| Vista consumida y adaptación | `internal/telemetry/projection/engineer/adapter.go:54–108,207–305` |
| Proyección de campos | `internal/telemetry/projection/engineer/v1.go:104–143,204–243` |
| Calidad, procedencia y Usable | `internal/telemetry/projection/engineer/contract.go:79–110,208–220`; `internal/telemetry/schema/quality.go:11–75` |
| Capacidad por grupos | `internal/telemetry/projection/engineer/v1.go:255–309` |
| Scoring y vector rival; Speed sólo piloto | `internal/telemetry/drivers/lmu/format.go:322–424` |
| Gap estimado con LapProgressTime/EstimatedLapTime y wrap | `internal/telemetry/derive/gaps.go:107–169` |
| TTL SHM 500 ms | `internal/telemetry/drivers/lmu/driver.go:20–24`; `fusion.go:342–383` |
| TTL REST 2 s | `internal/telemetry/drivers/lmu/rest.go:24–30`; `fusion.go:562–567` |
| Amarilla global candidata y campos phase/sector ignorados | `internal/telemetry/drivers/lmu/rest.go:249–256,632–667` |
| Semántica de InPit: zona de boxes | `internal/telemetry/schema/pit/types.go:6–8` |

El manifest de capacidad se activa si existe algún campo de algún vehículo
en el grupo; **no certifica cada rival**. `Field.Usable()` exige Fresh y
CapabilitySupported, pero no ProvenanceObserved. ObservationV1 no lleva timestamp
individual: la freshness se decide antes en Core/fusion. Ningún TTL sustituye
identidad/epoch/sesión ni demuestra ausencia de banderas. TrackName no identifica
por sí solo layout o longitud. InPit no equivale a InLap, intención de parar,
pitlane o pitbox. Un cero presente de TimeBehindNext/Leader no identifica
automáticamente líder/último ni sustituye missing.

`FamilyTimings.ParityApproved` en `projectioninput/adapter.go:82` describe el
alcance previo de player/adjacent-car gaps, no T0/T1 completo (mismo archivo
170–173). No se reutiliza como prueba de esta paridad.

## Matriz por regla

Todos los casos de cada fichero `tim-*.json` heredan sus bloqueos de esta fila;
estos bloqueos no impiden comprobar el fixture sintético. Ninguna fila acredita
ejecución CrewChief, replay del producto, voz o LMU real.

| Regla | O / D / C disponible o planteado | Ø / bloqueo para LMU real |
|---|---|---|
| TIM-REL | O ID/clase/posición/vueltas/distancia/LocalVelocity; D líder/vecinos de clase, orden espacial, delta y vueltas | ClassPosition no explícita; longitud/layout; velocidad escalar rival; InLap; equivalencia temporal por paso pendiente |
| TIM-SAMPLE | O sector/distancia; D cruce positivo e historial; C gap points/hardparts | Geometría/layout no expuestos; perfil aprendido no catalogado |
| TIM-STATE | O reloj/gaps candidatos; D historial por relación/ID y clasificación | Delta temporal fiable y resets de relaciones sin demostrar |
| TIM-PRECISION | O/D gap/clase; C hundredths, locale, lector y paquete propio | Realización/acústica propia sin verificar; pack instalado no observado |
| TIM-CADENCE | O reloj/sector/distancia; D oportunidades, contador y PRNG; C perfil pista | No existe una «cadencia LMU» observada; muestreo/cola real pendientes |
| TIM-SELECT | O clase/posición/vueltas; D relaciones/estado/lapDelta | Identidad race-vs-track, velocidad/InLap y relación de vueltas no demostradas |
| TIM-SILENCE | O SessionType/InPit; C formación manual/silencio; candidato global amarillo sólo Core | GamePhase, FCY de vuelta, lastGreenLap, amarillo local, azul e intención confirmada ausentes; global no prueba local/verde |
| TIM-END | O EndTime/MaximumLaps/SourceTime/CompletedLaps/Sector; D restantes; C longitud | Duración/modalidad y longitud deben probarse; missing no es final ni carrera por vueltas; Remaining usable actual excluye negativos |
| TIM-AUTO | D relaciones/estados/holding/cooldowns; C landmarks/voz | Hereda relaciones y banderas; historia/selección de landmarks y assets propios pendientes |
| TIM-QUEUE | O contexto epoch/sesión/piloto/calidad; C cola, TTL y precedencia; D revalidación | Started/primer sonido no se demuestra con fixture; consulta necesita límite de frescura propio |
| TIM-LAPPING | O posición/clase/vueltas; D candidato/no-racing/cooldown | Causalidad de doblaje/desdoblaje, lapDelta y fase no probados |
| TIM-LAPMODE | O clase/posición/vueltas/gaps candidatos; D classPosition/último/candidato | Hereda banderas/relaciones; contenedor sin gap debe cancelar sin consumo |
| TIM-QUERY | O parrilla actual/gaps/vueltas; D líder/último/signo/relaciones | Cantidad inicial de clase ausente; semántica carrera/pista/delta pendiente |
| TIM-STATUS | O gaps candidatos; D líder/último y relación de clase | No confundir clasificación general/clase; salida se compone con otras familias |
| TIM-CORNERS | O distancia/LocalVelocity/reloj; D cruces y tiempos; C landmarks/voz | Catálogo, layout/longitud, muestras por rival y audio propio pendientes |

## A1–A9 aceptadas y representadas

Isaac aceptó A2–A9 y después A1 en la conversación del 22 de septiembre de
2026. [VAN-743](https://app.notion.com/p/3e3e51695c6581f791a5ff927568f965)
registra esa aceptación posterior. El ledger fijado conserva honestamente
su snapshot previo `approved:false`; no significa que la decisión siga pendiente.

| ID | Objetivo aceptado | Ejemplos del corpus |
|---|---|---|
| A1 | Clasificar detrás incluyendo la muestra admitida actual | TIM-STATE-016/017 |
| A2 | Comprobar identidad de las tres muestras, sin afirmar alcance real del helper aislado | TIM-STATE-018 |
| A3 | Exigir relación de vueltas demostrada antes de ampliar doblaje/desdoblaje | TIM-SELECT-006 |
| A4 | Actualizar timestamp al repetir; no volver a insertar clave existente | TIM-LAPPING-003 |
| A5 | Revalidar antes de started y consumir sólo al empezar; nada por cancelar | TIM-QUEUE-005–008 |
| A6 | Cifra realizada coherente con precisión elegida en cada locale | TIM-PRECISION-007–010 |
| A7 | Omitir consejo sin audio utilizable, conservar gap válido, no consumir consejo | TIM-AUTO-007 |
| A8 | Contenedor sin gap: cancelación explícita sin excepción/consumo | TIM-LAPPING-004; TIM-LAPMODE-001/004 |
| A9 | Una emisión por cruce fresco de midpoint; frozen no es cruce nuevo | TIM-CORNERS-004 |

A3 no autoriza una frase nueva sin prueba causal. A8 no inventa resúmenes
parciales cuando faltan datos; el caso líder expone que el filtro fuente no
puede obtener otro coche con mejor/igual ClassPosition1. A9 distingue intento
de enqueue repetido de doble sonido real. La escala Vantare P2/P3 y precedencia
P0 provienen del contrato, no del número de prioridad CrewChief.

Las evoluciones rutinarias coherentes con estas decisiones se investigan y
resuelven dentro del ciclo existente —contraste previo, desarrollo, contraste
posterior— con evidencia y regresión. No requieren un trámite adicional por
ser mejoras; una ambigüedad material o cambio de alcance sí se plantea a Isaac.

## Siguiente corte y límites

T1 tendrá tarea propia, consumirá primero TIM-REL con datos sintéticos explícitos
y añadirá pruebas RED del producto antes de desarrollo. Tendrá que probar
identidad/cambio de rival/epoch, clases, retiradas, wrap, calidad y delta; este
test de integridad no satisface esos RED ni su aceptación.

No hay cambios productivos en T0b. Siguen pendientes los gates de ejecución
CrewChief, replay de comportamiento, voz online/offline, acústica y LMU; todos
`NOT_RUN` en el manifest. VAN-744 (diagnóstico de frontera fact) y VAN-741
(fixture voiceinput) siguen separados y no se cierran por tests verdes aquí.

`derive/gaps.go:25–43` invalida Remaining negativo: TIM-END-002 (-0,5 s)
caracteriza el predicado CrewChief y no es representable como Remaining usable
actual. Los ajustes de vueltas ±1 en TIM-REL-011/012 son aritmética intermedia
de GetRelativeDelta; no capturas físicas ni equivalencia ya probada del derivador.
