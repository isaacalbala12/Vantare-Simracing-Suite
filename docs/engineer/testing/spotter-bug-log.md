# Spotter Bug Log — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27.
> **Ámbito:** bugs encontrados durante prealpha del spotter LMU en Go.
> **Hereda** bugs resueltos en Python v0.7 como referencia de lo que **no**
> debe volver a fallar.

## BUG-001: Flicker `car_right / clear_right / car_right`

### Síntoma

El spotter hacía:

```
Coche a la derecha
Libre derecha
Coche a la derecha
```

aunque el coche seguía a la derecha.

### Causa

La detección podía perder un frame o varios frames breves. La máquina
de estados trataba una ausencia instantánea como salida real del coche.

También había competencia en el loop de telemetría: el heartbeat de
conexión podía competir con la lectura de frames y facilitar drops.

### Corrección (Python v0.7 → Go prealpha)

- Buffer de subscribers aumentado a 8 (133 ms de headroom a 60 Hz).
- Heartbeat separado del `select` principal de frames.
- Máquina de estados con hold temporal por lado.
- El hold ya no crea `three_wide` falso cuando aparece el lado
  contrario.
- El hold funciona incluso si el primer timestamp de test es `0`.

### Estado Go

✅ Implementado.

### Tests

- `TestMachine_DebounceWorksAtZeroTimestamp`
- `TestMachine_HeldSideDoesNotCreateFalseThreeWide`
- `TestMachine_HoldsIntermittentRightThroughOneSecondBoundary`

## BUG-002: Clear demasiado tarde

### Síntoma

Después de arreglar el flicker, el spotter tardaba demasiado en decir
`Libre derecha` / `Libre izquierda`.

### Causa

El hold defensivo estaba en `1000 ms`. Eso reduce falsos clears, pero
para un spotter se siente lento.

### Corrección

`detectionHoldMS` se redujo a `350 ms`.

Este valor sigue cubriendo misses breves de telemetría, pero reduce la
sensación de retardo artificial.

### Riesgo residual

Si LMU pierde detección durante más de `350 ms` con el coche aún al
lado, puede volver algún clear prematuro. Si ocurre, el siguiente paso
debe ser mejorar la estabilidad del clasificador con identidad/posición
del coche, no subir el hold a 1 s otra vez.

## BUG-003: Confusión izquierda/derecha

### Síntoma

El spotter confundía izquierda y derecha en pista real.

### Causa

Geometría basada en interpretación incorrecta de LMU/rFactor:

- `Row0` de `mOri` como eje lateral.
- `+X` como derecha.
- El simulador y los tests también estaban escritos con esa convención
  equivocada.

La convención correcta es:

- Local `+X` = izquierda del piloto.
- Local `+Z` = atrás.
- `mOri` se debe leer por columnas para obtener ejes locales en mundo.

### Corrección

- `Orientation.LocalX()` devuelve columna 0.
- `Orientation.LocalZ()` devuelve columna 2.
- `Orientation.Left()` usa `LocalX()`.
- `Orientation.Forward()` usa `-LocalZ()`.
- `geometry.go` clasifica `alignedX > 0` como izquierda.
- `simulator/scenario.go` corregido para simular izquierda con `X > 0`
  y derecha con `X < 0`.

Mejor aún: usar `atan2(Row2.X, Row2.Z)` para extraer yaw y rotar a frame
alineado. Eso es lo que el Go usa hoy.

### Tests

- `TestClassify_LeftOpponent`
- `TestClassify_RightOpponent`
- `TestClassify_TwoOpponents`
- `TestClassify_FallbackToFramePlayer`
- `TestClassify_PrefersLivePlayerOrientationOverScoringOrientation`
- `TestScenarioLeftBasic`
- `TestBuild_RightBasic`
- `TestClassify_CrewChiefPositiveAlignedXIsLeft`
- `TestClassify_CrewChiefNegativeAlignedXIsRight`

## BUG-004: Orientación de scoring menos fiable que player telemetry

### Síntoma

Aunque se corrigiera el signo, podía haber discrepancia entre la
orientación del slot de scoring y la telemetría live del jugador.

### Causa

`VehicleScoring` y `PlayerTelemetry` no actualizan exactamente igual.
Para el coche local, la fuente más directa es `PlayerTelemetry`.

### Corrección

Cuando `frame.Player` contiene orientación/posición válida, el spotter
usa esa fuente para el jugador.

### Estado Go

✅ Implementado en `Classify` (rama con `frame.Player != nil`).

## BUG-005: Spotter geometry no era CrewChief-compatible (Python v0.7)

### Síntoma

El spotter no coincidía con el comportamiento esperado de CrewChief en
curvas o adelantamientos complejos.

### Causa

- Vantare proyectaba la posición del oponente en un eje lateral y usaba
  `LapDistance` para el solapamiento longitudinal.
- CrewChief usa coordenadas X/Z alineadas del mundo y dimensiones de
  los vehículos.

### Corrección (Go prealpha)

- Se añadió extracción de yaw estilo CrewChief
  (`atan2(Row2.X, Row2.Z)`).
- Se añadió transformación de coordenadas X/Z alineadas
  (`alignment.go`).
- Se migró la detección de lado y solapamiento a coordenadas alineadas
  (`overlap.go`).
- `lap_distance` se usa solo como filtro de validez (`< 0` excluye),
  no como geometría longitudinal.

## BUG-006: Frame drops por buffer pequeño (Python v0.7)

### Síntoma

Frames de telemetría se descartaban silenciosamente cuando el manager
tardaba en procesarlos.

### Causa

Buffer del canal de telemetría era 1; el select del manager a veces
prefería el ticker de heartbeat al canal de frames.

### Corrección

- Buffer del subscriber channel: 1 → 8.
- Heartbeat movido a goroutine separada con ticker 500 ms.
- Select principal del manager solo tiene 3 cases (ctx, error,
  frame).

### Estado Go

✅ Implementado.

## BUG-007: Stale `clear_right` audible tras reaparición del lado

### Síntoma

`clear_right` quedaba en cola de audio y se reproducía después de que el
lado reaparecía.

### Causa

`Queue.Next` solo filtraba por `ExpiresAt`; no validaba el estado
actual del spotter.

### Corrección

- `ValidityRule` metadata en `audio.Message` describe qué condición debe
  cumplirse al reproducir.
- `Runtime.IsMessageStillValid(msg)` evalúa `ValidityRule` contra el
  estado actual del spotter (`lastState` cacheado).
- `Manager.queueLoop` descarta mensajes inválidos antes de reproducir.

Reglas de mapeo:

```
ValidityAlways          -> siempre true
ValiditySpotterLeft     -> state == Left || state == Both
ValiditySpotterRight    -> state == Right || state == Both
ValiditySpotterNoLeft   -> !(state == Left || state == Both)
ValiditySpotterNoRight  -> !(state == Right || state == Both)
ValiditySpotterAllClear -> state == None
ValiditySpotterBoth     -> state == Both
```

### Estado Go

✅ Implementado.

## BUG-008: `stillThereRepeatMS=2000` se sentía lento (Python v0.7)

### Síntoma

El "still there" se repetía cada 2 segundos, demasiado frecuente.

### Corrección

`stillThereRepeatMS` se subió de `2000` a `2500` ms.

### Estado Go

✅ Implementado en `NewMachine()`.

## BUG-009: Clear lateral inmediato (no diferido)

### Síntoma

`StateRight → StateLeft` emitía `clear_right + car_left`
inmediatamente. El `clear_right` podía sonar antes de que el coche
realmente saliera del lado derecho.

### Corrección

Lateral transition: `car_left` suena inmediato, `clear_right` queda
**pending** y se cancela si el lado reaparece antes del timestamp.

### Estado Go

✅ Implementado en `Machine.Process`.

## Reglas para futuras correcciones

1. No invertir signos otra vez sin captura live.
2. No subir el hold de estado para tapar errores de geometría.
3. Si falla en LMU real, crear primero una traza diagnóstica con
   `mOri`, `mPathLateral`, posiciones y decisión final.
4. Convertir cualquier caso real fallido en fixture/replay antes de
   tocar la lógica.
5. No añadir cancel/validación en `Queue.Next`; mantener la cola
   genérica y validar antes de enqueue en el manager.
6. No usar LLM para resolver bug de spotter; los bugs son de
   determinismo y se arreglan con tests.
