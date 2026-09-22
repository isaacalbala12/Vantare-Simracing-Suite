# T1 — Relaciones de carrera y pista

[VAN-746](https://app.notion.com/p/3e3e51695c6581bca1a6e38ff864077d) / #1321.
Base nightly `e6d7d2b5`; T0b revisado `95f0dc81`, T0a `166ff3c5`,
CrewChief `4c3865e09a347d4c806c0bc0cd66aae335fbc610`, ajustes predeterminados.
Isaac autoriza continuar y reserva las pruebas reales para después.

## Contraste y frontera

TIM-REL distingue clasificación de clase, orden espacial y delta de pasos.
El monitor alpha usa posiciones generales y gaps sin identidad de clase; la
familia activa aún no consume relaciones T1. No cambiar esa ruta audible aquí.
El corte ofrece un cálculo tipado activable explícitamente desde ObservationV1,
sin otro reader ni Frame. Su salida se probará desde la API pública; el monitor
previo sigue siendo rollback, y la integración audible corresponde a T4.

Identidad/calidad/epoch se conservan en cada resultado. Parrilla incompleta o
ambigua produce unknown, no una falsa relación. El orden de clase se deriva de
la posición general observada y clase de todos los coches del roster autoconsistente según Core;
las retiradas cambian la parrilla actual, no se inventa cantidad inicial.

La vista no contiene longitud/layout ni InLap. Evidencia auxiliar acotada de
geometría de catálogo y entrada a boxes se liga exactamente al contexto y tiempo
de la observación; ausencia o mismatch bloquea pista/deltas. No se sustituye
InLap por InPit ni velocidad rival por un vector sin semántica probada. El
origen real de esa evidencia seguirá bloqueado hasta validar la proyección LMU.

## Secuencia de desarrollo

1. RED/GREEN de líder y vecinos de clase desde el proyector real con parrilla
   sintética; missing/duplicate/stale/retirada y flag desactivada.
2. RED/GREEN de candidatos espaciales, filtros >0,5 m/s/InLap, wrap, coincidencia,
   misma clase y exclusión del rival de carrera en candidato automático.
3. RED/GREEN de delta temporal/vueltas con pasos, signo y elección de menor
   magnitud; no usar RelativeTimeGap/EstimatedLapTime como reemplazo.
4. Invalidación por identidad, epoch, tiempo y geometría; revisión de fuente y
   revisión Go independientes con GPT-6, checks y PR draft.

Los esperados son literales desde TIM-REL y escenarios de fuente. No producir
expected ejecutando el producto. Si falta demostrar una parte, registrar el
alcance parcial y sus bloqueos sin marcar T1/LMU/audio como cerrado.


## Contraste posterior y adaptaciones

La referencia sigue fijada en el SHA anterior, con ajustes predeterminados.
`Timings.cs:292–367` distingue relaciones; `GameStateMapper.cs:151–213` elige
el gap del juego delantero sólo en monoclase/same race lap y deriva el trasero.
`GameStateData.cs:3667–3769` fija split primario/reverso, empate estricto y ajuste
±1; `Timings.cs:1349–1375` usa delta relativo para líder, también en clasificación.
`GameStateData.cs:4759–4842` elige el vecino espacial; el automático elige primero
misma clase y luego excluye al rival trasero de carrera, sin buscar el segundo.
No se ejecutó CrewChief: contraste estático de fuente más replay Go sintético.

Evoluciones y límites explícitos del corte:

- No rellenar marcas iniciales ni interpolar puntos no observados. La primera
  fotografía sólo localiza; un cambio de intervalo de 20 m observa un cruce.
  La corrección usa velocidad del último punto marcado y sólo se aplica al
  cruzar. Una marca lenta ya observada se actualiza a tiempo actual, sin extrapolar.
- Perfil conservador T1: máximo 2 s entre muestras por coche y 300 s de edad de
  marca, geometría entre 20 m y 100 km. Son límites sintéticos Vantare, no defaults
  CrewChief ni límites certificados de LMU. Corte largo, reversión, salto de
  media vuelta, detenido, velocidad ausente o extrapolación fuera del intervalo
  descartan historial; sacrifican disponibilidad antes que inventar un tiempo.
- Cero observado de distancia en meta es válido en Core: una transición coherente
  de vuelta puede marcar ese cruce exacto. La fuente ignora ese tick de distancia
  cero. El caso de regresión distingue este cruce de la primera fotografía.
- Contexto/epoch, tipo de sesión, geometría, ID o datos incompatibles reinician
  historia. `SourceTime` repetido es una fotografía idempotente con la misma hora,
  no una muestra nueva ni una renovación de freshness. La validez de recepción
  pertenece a Core; T2/T4 deben contar cruces y revalidar antes de emitir.
- Vecino conocido no implica gap conocido. `AutoTrackRear` representa candidato
  elegible: `absent` tras exclusión o signo negativo no afirma ausencia de coche.
  Cero de gap presente se conserva como dato; no significa anuncio. Missing/stale
  del game gap no autoriza sustituirlo por historia propia.
- Sólo `race` expone vecinos de carrera. El LMU mapper observado traduce carreras
  a ese tipo; `endurance` sintético no se presupone equivalente. Líder conserva
  delta relativo fuera de carrera, conforme a la consulta fuente.
- VehicleCount igual a longitud de Vehicles sólo prueba autoconsistencia interna,
  no que LMU haya comunicado toda la parrilla. Igualdad literal de clases no
  demuestra `CarData.IsCarClassEqual` en sesiones reales. El ordenado inmediato
  tampoco reproduce el tick transitorio fuente al descubrir una clase nueva.
- Discontinuidades incompatibles con velocidad/tiempo reinician historial: el
  avance no puede superar un punto (20 m) más dos veces la velocidad máxima de
  ambos extremos por el tiempo transcurrido. Es un rechazo conservador sintético,
  no un modelo físico ni un default CrewChief. El caso 2380 m en 1 s a 20 m/s
  fue RED y ahora produce unknown. Esta envolvente, como 2 s/300 s, necesita
  validación con adquisición real antes de habilitar gaps live.
- No hay productor live certificado para TrackEvidence ni llamadas de producto
  a RelationTracker. No se modifica el monitor alpha ni `internal/families/timings`.

## Cobertura y validación

Tests públicos pasan por el proyector ObservationV1 real con envelopes sintéticos;
no acceden a mapas privados ni calculan expected ejecutando Vantare.

| Regla T0b | Replay público equivalente |
| --- | --- |
| TIM-REL-001 | SeparateClassFromOverallStandings; TrackAndAutomaticCandidateAreDistinct |
| TIM-REL-002 | TrackWrapCoincidenceAndMissingPitEntry; WrapFrontUsesMeasuredTwoSecondGap |
| TIM-REL-003–006 | TrackWrapCoincidenceAndMissingPitEntry; TrackEligibilityAndEvidence |
| TIM-REL-007–008 | RelativeEqualMagnitudeKeepsPrimarySplit y rechazo del signo contrario |
| TIM-REL-009–010 | RejectIncompleteOrAmbiguousStandings; HistoryInvalidation; PassageGapNeedsHistoryAndResets |
| TIM-REL-011–012 | RelativeWrapFromMeasuredReplay, con ambas ramas ±1 y líder relativo |

Los valores intermedios del corpus T0b no se cargan como historial privado: se
construyen trayectorias que observan los puntos necesarios. La comparación es
semántica en el perfil descrito, no ejecución literal de los 141 casos de T0b.
Pruebas adicionales: cero/missing/stale/negativo delantero, meta y vuelta completa,
no fallback automático, detenido, tipo de sesión, rival/driver/layout/longitud,
marcas caducadas con snapshots continuos, velocidad última marca y baja velocidad.

Revisión posterior GPT-6 Sol: sin contradicción bloqueante con la fuente
en el perfil sintético, con adaptaciones conservadoras explícitas. El caso cinemático detectado
se convirtió en regresión y rechazo de discontinuidad. Revisión Go GPT-6
Luna: sin P1/P2 tras corregir cero válido en meta. Revisión final Sol del
rechazo cinemático y overflow: PASS acotado. Las 26 pruebas públicas T1
(más sus casos de tabla) y el proyector pasan con race/vet focal. Los 44 tests
del contrato/digest de roadmap y el ratchet de calidad pasan; sin cambios de
política ni baseline. CI del SHA publicado se registra en la PR y VAN-746.
La suite global macOS no es verde: 119 paquetes pasan y fallan cmd/vantare,
launcher, server y recording/sqlite por limitaciones conocidas de base. El race
amplio encontró además la intermitencia voiceinput registrada en VAN-741; no se
ha corregido aquí. Las pruebas focales T1 y proyector sí pasan con detector de
carreras y vet. Pruebas reales Windows/LMU/acústicas pendientes por decisión de
Isaac; ejecutar después de este corte con la build/canal realmente integrados.
