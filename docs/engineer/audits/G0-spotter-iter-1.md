# G0 Spotter — Iteración 1 — Paridad CC

**Fecha:** 2026-06-28
**Estado previo:** N/A (primera auditoría formal)
**Estado actual:** ITER-1 (implementación MVP con gaps documentados)

## Fuente CC

- Archivos: `CrewChiefV4/NoisyCartesianCoordinateSpotter.cs` (1022 líneas), `CrewChiefV4/Events/Spotter.cs` (162 líneas)
- Clase abstracta `Spotter` con `internalSpotter` de tipo `NoisyCartesianCoordinateSpotter`
- `NoisyCartesianCoordinateSpotter` implementa: detección de overlap lateral, mensajes spotter (car left/right, clear left/right/all, still there, three wide), lógica oval/road, múltiples spotters, iRacing direct API

### Constantes extraídas

| Constante | Valor CC | Notas |
|-----------|----------|-------|
| `minSpeedForSpotterToOperate` | user setting (default no repo; típicamente 10 m/s) | Umbral mínimo de velocidad del jugador |
| `timeAfterRaceStartToActivate` | user setting (default típico 0-10s) | Tiempo tras inicio para activar |
| `trackZoneToConsider` | 20.0 (float) | Ventana lateral máxima para considerar overlap |
| `carBehindExtraLength` | 0.4 (float) | Longitud extra para coches detrás |
| `gapNeededForClear` | user setting `spotter_gap_for_clear` | Cuánto espacio lateral extra para declarar clear |
| `carLength` | pasada externamente (dinámica) | Longitud del coche del jugador |
| `carWidth` | pasada externamente (dinámica) | Anchura del coche del jugador |
| `maxClosingSpeed` | user setting | Velocidad de cierre máxima para considerar |
| `calculateOpponentSpeedsEvery` | 0.2s | Frecuencia de cálculo de velocidad de oponentes |
| `clearMessageDelay` | user setting `spotter_clear_delay` (ms) | Retardo para mensajes clear |
| `ovalClearMessageDelay` | user setting `spotter_oval_clear_delay` (ms) | Retardo oval |
| `overlapMessageDelay` | user setting `spotter_overlap_delay` (ms) | Retardo para mensajes overlap |
| `repeatHoldFrequency` | user setting `spotter_hold_repeat_frequency` (default 3s) | Frecuencia "still there" |
| `ovalRepeatHoldFrequency` | user setting `spotter_hold_repeat_frequency_ovals` (default 5s) | Frecuencia "still there" oval |
| `bouncingWait` | repeatHoldFrequency / 2 | Retardo cuando se rebota entre clear y overlap |
| `onSingleOverlapTo3WideDelay` | 0.5s | Retardo para pasar de overlap simple a 3-wide |
| `timeToWaitBeforeClosingChannelLeftOpen` | 5000ms | Tiempo antes de cerrar canal abierto |
| `clearMessageExpiresAfter` | 2000ms | Expiración mensaje clear |
| `clearAllRoundMessageExpiresAfter` | 2000ms | Expiración mensaje clear all round |
| `holdMessageExpiresAfter` | 1000ms | Expiración mensaje "still there" / overlap |
| `inTheMiddleMessageExpiresAfter` | 1000ms | Expiración mensaje "in the middle" |
| `blockedStillThereRetryDelay` | 1s | Reintento "still there" en ovals con canal ocupado |

### Mensajes disparados (sound folders)

- `spotter/still_there` — repite cada 3s (road) o 5s (oval)
- `spotter/car_left` — coche a la izquierda (o `car_inside` en oval)
- `spotter/car_right` — coche a la derecha (o `car_outside` en oval)
- `spotter/car_inside` — variante oval para izquierda
- `spotter/car_outside` — variante oval para derecha
- `spotter/clear_left` — izquierda libre (o `clear_inside` en oval)
- `spotter/clear_right` — derecha libre (o `clear_outside` en oval)
- `spotter/clear_inside` — variante oval para clear izquierda
- `spotter/clear_outside` — variante oval para clear derecha
- `spotter/clear_all_round` — ambos lados libres
- `spotter/in_the_middle` — coches a ambos lados (3-wide)
- `spotter/three_wide_on_left` — 3-wide, estás a la izquierda (road) / inside (oval)
- `spotter/three_wide_on_right` — 3-wide, estás a la derecha (road) / outside (oval)
- `spotter/three_wide_on_inside` — variante oval
- `spotter/three_wide_on_outside` — variante oval
- `acknowledge/spotterEnabled` — spotter activado
- `acknowledge/spotterDisabled` — spotter desactivado
- `radio_check/test` — radio check

### Gates (condiciones de supresión)

- `playerVelocityData[0] > minSpeedForSpotterToOperate` — velocidad mínima (línea 297)
- `currentPlayerPosition[0] != 0 && currentPlayerPosition[1] != 0 && != -1` — posición inválida
- `GameStateData.onManualFormationLap` — vuelta de formación manual
- `opponentPositionInRange()` — oponente dentro de `trackZoneToConsider`
- `checkOpponentVelocityInRange()` — velocidad relativa dentro de `maxClosingSpeed`
- `isOpponentSpeedInRange` — para overlaps nuevos
- `messageIsValid()` — verifica que el mensaje pendiente sigue siendo relevante

### Cooldowns

- `nextMessageDue` — tiempo mínimo para próximo mensaje (varía por tipo)
- `repeatHoldFrequency` — 3s entre "still there" (road)
- `timeAfterRaceStartToActivate` — retardo inicial tras start

## Estado Vantare (iteración 1)

### Archivos

- `internal/engineer/spotter/geometry.go` — detección de overlap (Classify + ClassifyWithActiveSides)
- `internal/engineer/spotter/state.go` — máquina de estados (Machine)
- `internal/engineer/spotter/overlap.go` — lógica de overlap (ClassifyAlignedOverlap)
- `internal/engineer/spotter/alignment.go` — transformación de coordenadas
- `internal/engineer/spotter/debug.go` — debug records
- `internal/engineer/spotter/types.go` — tipos básicos
- Tests: `geometry_test.go`, `state_test.go`, `overlap_test.go`, `alignment_test.go`, `debug_test.go`

### Constantes usadas

| Constante | Valor Vantare | Notas |
|-----------|---------------|-------|
| `MinSpotterSpeedMPS` | 10.0 | Hardcodeado (CC user setting default típico 10) |
| `FCYGamePhase` | 6 | Igual que CC rF2GamePhase.FullCourseYellow |
| `TrackZoneToConsiderM` | 20.0 | Igual CC |
| `CarLengthM` | 4.5 (normal), 4.2 (aggro), 4.8 (conserv) | Sin variante dinámica |
| `CarWidthM` | 1.8 (normal), 2.0 (aggro), 1.6 (conserv) | Sin variante dinámica |
| `CarBehindExtraM` | 0.4 | Igual CC |
| `GapNeededForClearM` | 0.5 | CC usa user setting |

### Mensajes disparados

| Event | TextKey | Notas |
|-------|---------|-------|
| `EventCarLeft` | `car_left` | ✅ |
| `EventCarRight` | `car_right` | ✅ |
| `EventStillThere` | `still_there` | ✅ |
| `EventClearLeft` | `clear_left` | ✅ |
| `EventClearRight` | `clear_right` | ✅ |
| `EventAllClear` | `all_clear` | ✅ (CC: `clear_all_round`) |
| `EventThreeWide` | `three_wide` | ✅ (CC: `in_the_middle`) |

### Gaps conocidos

- Sin variante oval (car_inside/outside, clear_inside/outside)
- Sin 3-wide específico (three_wide_on_left/right/inside/outside)
- Sin radio check
- Sin enable/disable spotter messages
- Sin `bouncingWait` (CC usa half de repeatHoldFrequency cuando se rebota entre clear y overlap)
- Sin `onSingleOverlapTo3WideDelay` (0.5s en CC)
- Sin `maxClosingSpeed` gate
- Sin `calculateOpponentSpeedsEvery` (cálculo de velocidad de oponentes para filtrado)
- Sin `blockedStillThereRetryDelay` (ovals)
- `stillThereRepeatMS` = 2500ms en Vantare vs 3000ms en CC (road)
- `messageExpiryMS` = 2000ms para todo; CC usa 2000ms para clear, 1000ms para hold/in-the-middle
- Sin detección de "canal abierto" (CC mantiene canal abierto en road)

## Diferencias: CC vs Vantare

| Aspecto | CC | Vantare | Diferencia |
|---------|----|---------|------------|
| `repeatHoldFrequency` | 3000ms (road) | 2500ms | DIFFERENT |
| `messageExpiryMS` | 2000ms clear, 1000ms hold | 2000ms todo | DIFFERENT |
| `bouncingWait` | half-repeathold | no implementado | MISSING |
| `onSingleOverlapTo3WideDelay` | 0.5s | no implementado | MISSING |
| `maxClosingSpeed` gate | user setting | no implementado | MISSING |
| `calculateOpponentSpeedsEvery` | 0.2s | no implementado | MISSING |
| `blockedStillThereRetryDelay` | 1s (ovals) | no implementado | MISSING |
| variante oval | car_inside/outside, clear_inside/outside | no implementado | MISSING |
| 3-wide izquierda/derecha | mensajes específicos | solo event three_wide | MISSING |
| radio check / enable/disable | sí | no implementado | MISSING |
| clearMsg/ clearAllRoundMsg/ holdMsg expiration | 2000/2000/1000 ms | 2000ms todo | DIFFERENT |
| `timeAfterRaceStartToActivate` | user setting | no implementado | MISSING |
| `timeToWaitBeforeClosingChannelLeftOpen` | 5000ms | no implementado | MISSING |

## Diferencias materiales que persisten

1. **`repeatHoldFrequency` 2500ms vs 3000ms** — Vantare repite "still there" 500ms más rápido que CC. Impacto: usuario puede recibir más mensajes de los esperados.
2. **`messageExpiryMS` indiferenciado** — CC usa 2000ms para clear, 1000ms para hold/middle. Vantare usa 2000ms para todo. Impacto: mensajes "still there" pueden solaparse.
3. **Sin `bouncingWait`** — Vantare no ralentiza cuando el spotter rebota entre clear y overlap. Impacto: posible parloteo en situaciones límite.
4. **Sin `maxClosingSpeed` gate** — Vantare no filtra oponentes que se acercan demasiado rápido. Impacto: falsos positivos con coches en dirección opuesta.
5. **Sin variante oval** — Vantare no tiene mensajes específicos para oval (car_inside/outside). Impacto: usuarios de oval pierden precisión semántica.

## Diferencias NO materiales (aceptadas)

- `GapNeededForClearM = 0.5` vs CC user setting (diferencia menor, CC permite configurar)
- Sin `calculateOpponentSpeedsEvery` — Vantare no necesita calcular velocidades porque LMU las proporciona directamente
- Sin `blockedStillThereRetryDelay` — Vantare no tiene concepto de "canal ocupado" en alpha 1
- Sin `timeAfterRaceStartToActivate` — MVP usa gate de velocidad que es suficiente
- Sin `timeToWaitBeforeClosingChannelLeftOpen` — Vantare no gestiona canales de audio aún
- TextKey `all_clear` vs CC `clear_all_round` — diferencia de naming interno, mismo efecto sonoro

## Plan para próxima iteración (iter-2)

1. **Corregir `repeatHoldFrequency` de 2500ms a 3000ms** en `NewMachine()` (state.go:51)
2. **Diferenciar `messageExpiryMS`: mantener 2000ms para clear, 1000ms para hold/middle** — añadir `holdExpiryMS` separado
3. **Añadir `bouncingWait`** — cuando se rebota entre clear y overlap, esperar `repeatHoldFrequency / 2`
4. **Añadir `maxClosingSpeed` gate** en `ClassifyAlignedOverlap` o en `Classify` si LMU proporciona velocidades de oponentes
5. **Añadir variante oval** para mensajes 3-wide (postergado a alpha 2)

## Bloqueos

- LMU no expone `maxClosingSpeed` como user setting — depende del runtime LMU-Vantare. PARITY_BLOCKED hasta que el runtime exponga config.
- Variante oval requiere confirmación de que LMU detecta correctamente circuitos oval — NO_VERIFICADO.
