# ISA-718 · Motor de familias sobre radio.v1

Estado: corregido tras review adversarial; pendiente de re-review, CI remoto y gate LMU humano.

## Diseño

`internal/families` contiene una única interfaz:

```go
Evaluate(Evidence, State) []radio.RadioMessage
```

`engine.go` registra los cinco evaluadores y su estado propio. Cada familia
vive en un archivo y conserva solo el cursor que necesita. `catalog.go` es la
tabla declarativa y única para metadatos de entrega y textos.

| Familia | Estado propio | Intents | Prioridad | Cooldown | TTL |
| --- | --- | --- | --- | --- | --- |
| fuel | combustible/vuelta, ventana de 5 consumos y umbrales confirmados por ACK | 8 migrados | P2 | 30 s por intent, solo en bus | 15–30 s del catálogo |
| penalties | contador observado y último anunciado | `count_increased` | P3 | 30 s | 20 s |
| laps | vuelta observada y última anunciada | `lap_completed` | P3 | transición, sin cooldown adicional | 10 s |
| timings | primer sample sembrado | `gap_report` | P3 | 60 s, solo en bus | 15 s |
| pitstops | `InPit`, generación observada y confirmada | `entry`, `exit` | P3 `Information` | 5 s por intent | 10 s |

El `subject` es `player` y también forma parte de la tabla. Los trece intents
registran exactamente los textos `es/en/it/pt-BR` de `catalog-v1.md`. Estos
textos no declaran placeholders numéricos, por lo que el payload es el objeto
vacío y no se inventan parámetros fuera del catálogo.

## Paridad demostrada

| Monitor viejo / caso | Regresión nueva |
| --- | --- |
| `fuel`: 2 L + 1 L simultáneos, medio depósito, one-shot y rearmado tras repostar ≥10 L | `TestFuelParityThresholdsCooldownRefuelAndRange` |
| `fuel`: consumo medio por vuelta, autonomía 4/3/2/1 y `for_pit_now` bajo 4 vueltas | `TestFuelParityThresholdsCooldownRefuelAndRange` |
| `penalties`: flanco ascendente y no repetir; el contador no permite afirmar DT/S&G | `TestPenaltyParityRisingEdgeIsNeutral` |
| `laps`: `LapNumber` ascendente, una vez por cruce | `TestLapParityRisingEdgeAndReset` |
| `timings`: primer sample silencioso y rango legible 0,5–20 s; la cadencia pertenece al bus | `TestTimingsParityReadableGapsLeavesCadenceToBus`, `TestTimingCooldownStartsOnlyAtDelayedACK` |
| `pitstops`: flancos `InPit` false→true y true→false, sin repetir estado estable | `TestPitstopParityTransitions` |
| cooldown iniciado solo por ACK y limpieza de contexto | `TestBusResetClearsFamilyCooldownFailClosed` |
| `fuel`: capacidad ausente, cero o negativa no autoriza autonomía ni `for_pit_now` | `TestFuelParityUnknownCapacityNeverCalculatesRange` |
| cursores y one-shots solo se consumen tras `started`; un P0 puede descartarlos y se reintentan | `TestFuelOneShotsRetryWhenSpotterDropsPendingBeforeStarted`, `TestEdgeCursorsCommitOnlyWhenStarted` |

Los resets de source, identidad, epoch y facts de lifecycle siguen llamando a
`radio.Bus.Reset`. La pérdida de capability o campo requerido usa
`ResetIntents` para cancelar únicamente la familia afectada, limpiar sus
cooldowns y resembrar su estado sin contaminar a Spotter ni a otras familias.
Spotter y el motor comparten `Context.Complete()` como criterio de identidad.
El mapper LMU propaga el driver observado del jugador a la identidad del
header; si no existe, ambos productores fallan cerrados.

Los toggles de Spotter resetean exclusivamente sus siete intents y su cola
legacy. No cancelan mensajes ni estado de fuel/laps/pit, y el runtime legacy
permanece encendido cuando `-engineer-legacy-families` está activo. Lo cubren
`TestSpotterToggleDoesNotResetOrDisableFamilies` y la matriz de entrega real
`TestLegacyRollbackMatrixDeliversSpotterAndFamiliesExclusively`.

## Cutover y rollback

El camino normal ya no recorre las cinco familias de
`legacyProjectionFamilies`; solo evalúa `internal/families` y entrega por
`radio.v1`. `-engineer-legacy-families` se aplica antes de `Start` y selecciona
exclusivamente los cinco monitores viejos. Cambiarlo durante ejecución falla.
Spotter mantiene su rollback independiente `-engineer-legacy-spotter`.

No se borra ningún paquete legacy en ISA-718. Su retirada física queda
explícitamente bloqueada hasta que Isaac complete el gate LMU humano. El
contador sanitizado `activeFamilies` en `/api/engineer/health` vale 5 en el
camino nuevo y 0 bajo rollback; no expone identidad, payload ni texto.

## Gate humano pendiente

En LMU real: comprobar los trece intents con una sesión que cubra consumo por
vuelta, sanción, cruce de meta, gaps y entrada/salida de pit; verificar ausencia
de dobles con el camino normal y con rollback por separado. Hasta esa evidencia
no se borra el stack viejo ni se declara validación runtime/LMU.
