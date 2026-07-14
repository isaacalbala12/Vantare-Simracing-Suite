# Spotter Geometry Findings — Vantare Ingeniero Go

> **Estado:** activo. Revisado 2026-06-27.
> **Ámbito:** spotter lateral LMU, cálculo izquierda/derecha y
> solapamiento.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/architecture/spotter-geometry-findings.md`).

## 1. Resumen

El fallo principal del spotter lateral en iteraciones tempranas **no
era** un simple parámetro de sensibilidad. La causa raíz era una
interpretación incorrecta del sistema de coordenadas local de
LMU/rFactor y de la matriz `mOri`.

La lógica inicial asumía:

- `Row0` de `mOri` como eje lateral del coche.
- `+X` como derecha.
- `Row2` como forward directo.

Ese planteamiento es **incorrecto** para LMU/rFactor.

## 2. Convención correcta LMU/rFactor

Según la documentación del InternalsPlugin/rFactor:

- Local `+X` apunta a la **izquierda** del piloto.
- Local `+Y` apunta hacia arriba.
- Local `+Z` apunta hacia atrás.
- `mOri` contiene filas de la matriz de orientación.
- Para obtener un eje local expresado en mundo hay que leer
  **columnas** de esa matriz, no filas.

Por tanto:

```
leftAxisWorld   = column 0 of mOri
backAxisWorld   = column 2 of mOri
forwardWorld    = -backAxisWorld
```

## 3. Implementación actual en Vantare Go

El spotter Go usa **yaw** desde `Orientation.Row2` y rota coordenadas
X/Z del mundo al frame alineado del player. NO usa
`Orientation.LocalX()` como fuente de verdad del side.

`alignment.go` implementa:

```go
func YawFromRF2Orientation(o telemetry.Orientation) float64 {
    yaw := math.Atan2(o.Row2.X, o.Row2.Z)
    if yaw < 0 {
        yaw += 2 * math.Pi
    }
    return yaw
}

func AlignOpponentXZ(playerYaw float64, player, opponent telemetry.Vec3) AlignedOpponent {
    rawX := opponent.X - player.X
    rawZ := opponent.Z - player.Z
    c := math.Cos(playerYaw)
    s := math.Sin(playerYaw)
    return AlignedOpponent{
        X: c*rawX + s*rawZ,
        Z: c*rawZ - s*rawX,
    }
}
```

Convención de signo:

```
alignedX > 0  => left
alignedX < 0  => right
alignedZ < 0  => ahead (opponent is in front of player)
alignedZ > 0  => behind
```

## 4. Estado de verificación (CONFIRMADO vs NO_VERIFICADO)

Esta sección separa lo que está confirmado en código + tests del
worktree de lo que requiere captura live en LMU.

### 4.1 CONFIRMADO (código + tests)

- Convención de signo `alignedX > 0 => left`, `alignedX < 0 => right`.
  Tests: `geometry_test.go`, `alignment_test.go`.
- Fórmula de yaw: `atan2(o.Row2.X, o.Row2.Z)` con normalización a
  `0..2π`. Test: `alignment_test.go`.
- Transformación X/Z alineada. Test: `alignment_test.go`.
- Overlap básico con dimensiones y rangos. Test:
  `overlap_test.go`.
- State machine con `ActiveSides` y cancelación de pending clear.
  Test: `state_test.go`.
- Dimensiones locked en `OverlapConfig.DefaultOverlapConfig`.
- `ClassifyWithActiveSides` para que `Machine` consulte el estado
  actual al clasificar.

### 4.2 NO_VERIFICADO (requiere captura live)

- **Fórmula exacta de CC `getAlignedXZCoordinates`** con todos los
  edge cases (rawX/rawZ vs alignedX/alignedZ). El código Go
  reproduce la fórmula por inspección (`NoisyCartesianCoordinateSpotter.cs:546-548`).
  No hay test que compare byte a byte con CC, solo equivalencia
  matemática.
- **Si CC usa geometría distinta cuando un overlap ya existe** con
  LMU vs rF2. No verificable sin captura dual.
- **Si `velocity filtering` importa para LMU prealpha.** CC tiene
  gate `playerVelocityData[0] > minSpeedForSpotterToOperate`
  (`NoisyCartesianCoordinateSpotter.cs:297`). Vantare aún no tiene
  gate de velocidad (`minSpotterSpeedMPS`); ver
  `current-plan.md` § 6 Tarea 2.
- **Si scoring y telemetry orientation matrices difieren en LMU.**
  CC prefiere telemetry cuando hay inconsistencia. Vantare también
  (`Classify` líneas 89-96). No verificado live con LMU.

## 5. Dimensiones locked

| Constante | Default | Notas | Fuente CC |
|---|---|---|---|
| `TrackZoneToConsiderM` | `20.0` | radio lateral antes de descartar | `NoisyCartesianCoordinateSpotter.cs:76` |
| `CarLengthM` | `4.5` | longitud conservadora GT/LMP | `carClassData.json:60` default |
| `CarWidthM` | `1.8` | anchura conservadora | `carClassData.json:60` default |
| `CarBehindExtraM` | `0.4` | holgura longitudinal detrás | `NoisyCartesianCoordinateSpotter.cs:35` |
| `GapNeededForClearM` | `0.5` | gap mínimo para emitir clear | `NoisyCartesianCoordinateSpotter.cs:51` (user setting `spotter_gap_for_clear`, default 0.5) |

Per-class dimensions (LMP3, LMP2, GTE, GT3, HYPERCAR) son
`NO_IMPLEMENTADO` (alpha 2).

## 6. Preferencia de fuente

Cuando existe `frame.Player` (telemetría directa del jugador) se
prefiere su pose sobre `VehicleScoring` del player. Motivo:

- `PlayerTelemetry` representa directamente el coche conducido.
- `VehicleScoring` puede ir ligeramente retrasada durante
  transiciones de LMU.

`Classify` usa `PlayerTelemetry` si `Orientation.Row2` no es cero.

## 7. Por qué fallaba en pista antes del fix

En recta y con orientaciones simples, usar `Row0` podía parecer
correcto en algunos fixtures sintéticos. En pista real, especialmente
en curvas o cuando la orientación del scoring no coincide con la
telemetría live, el resultado podía invertirse o volverse
inconsistente.

El fallo era estructural:

- Se usaba una **fila** de matriz cuando hacía falta una **columna**.
- Se interpretaba el signo lateral al revés.
- El simulador de tests también estaba creado con la convención
  antigua, así que los tests validaban una premisa falsa.

## 8. Tests principales

- `TestClassify_LeftOpponent`
- `TestClassify_RightOpponent`
- `TestClassify_TwoOpponents`
- `TestClassify_FallbackToFramePlayer`
- `TestClassify_PrefersLivePlayerOrientationOverScoringOrientation`
- `TestScenarioLeftBasic`
- `TestBuild_RightBasic`

Pendientes (cubrirán los `NO_VERIFICADO` cuando se hagan con
captura live):

- `TestClassify_RearEndCollision` — coche 5m detrás NO debe
  disparar.
- `TestClassify_ParallelWheelOverlap` — coche 3m adelante + lateral
  debe disparar.
- `TestClassify_LapWraparound` — wrap de vuelta no debe falsear
  distance.
- `TestClassify_CrewChiefPositiveAlignedXIsLeft`
- `TestClassify_CrewChiefNegativeAlignedXIsRight`

Verificación (lo que ya corre):

```powershell
go test ./internal/engineer/spotter -v
go test ./internal/engineer/spotter ./internal/engineer/simulator ./internal/engineer/core ./internal/engineer/replay -v
```

## 9. Filtros activos

| Filtro | Razón | Estado Go |
|---|---|---|
| Jugador en pits | silencia spotter completo | CONFIRMADO (`geometry.go:81`) |
| Jugador < `minSpotterSpeedMPS` (10 m/s) | gate global | NO_IMPLEMENTADO (`current-plan.md` § 6 Tarea 2) |
| Oponente en pits | excluido | CONFIRMADO (`geometry.go:111`) |
| Oponente con `LapDistance < 0` | excluido (validity filter) | CONFIRMADO (`geometry.go:114`) |
| Oponente con posición (0,0,0) | excluido (inválida) | CONFIRMADO |
| `aligned.X > TrackZoneToConsiderM` | excluido (fuera de zona) | CONFIRMADO (`overlap.go:44`) |
| `abs(aligned.X) <= CarWidthM` | excluido (muy cerca, casi encima) | CONFIRMADO (`overlap.go:48`) |

## 10. Riesgo residual

Si vuelve a fallar izquierda/derecha en LMU real, el siguiente paso
no debe ser ajustar signos a ciegas. Hay que capturar diagnóstico
live comparando:

- `mPos` del jugador y oponente.
- `mOri` completo del jugador.
- `LocalX`, `LocalZ`, `Forward`.
- `relative`.
- `dot(relative, leftAxisWorld)`.
- `mPathLateral` de jugador y oponente.
- Decisión final del spotter.

Ese log debe guardarse como fixture/replay antes de cambiar de nuevo
la geometría.

## 11. Cómo se conecta con la matriz LMU-01..48

Esta doc alimenta las filas LMU-01 (Spotter lateral), LMU-02
(Spotter clear + 3-wide), LMU-03 (Spotter still-there) y LMU-04/05
(Pit limiter). Para el estado actual y los gaps pendientes ver
[`vantare-go-master-plan.md`](../vantare-go-master-plan.md) § 13.
