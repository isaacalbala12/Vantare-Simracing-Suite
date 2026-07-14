# LMU Telemetry — Vantare Ingeniero Go

> **Estado:** activo. Revisado 2026-06-27 (paths corregidos).
> **Auditoría 2026-06-27:** este doc describía paths en
> `internal/sim/lmu/` que **no existen**. Los paths reales en el
> worktree son `internal/telemetry/lmu/` (parser público de
> widgets) y `internal/engineer/lmu/` (parser experimental sin
> commit, solo geometría). Ver [`INDEX.md`](../INDEX.md) § 5.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/testing/lmu-telemetry.md`).

Vantare Ingeniero Go lee `LMU_Data` shared memory directamente en
Windows. Go no mapea el struct C++ completo; parsea por byte offsets
generados del layout ctypes, porque LMU usa `#pragma pack(4)`.

## Campos críticos para spotter

| Struct | Field | Offset |
|---|---:|---:|
| `LMUVehicleScoring` | `mPathLateral` | 112 |
| `LMUVehicleScoring` | `mTrackEdge` | 120 |
| `LMUVehicleScoring` | `mPos` | 264 |
| `LMUVehicleScoring` | `mLocalVel` | 288 |
| `LMUVehicleScoring` | `mLocalAccel` | 312 |
| `LMUVehicleScoring` | `mOri` | 336 |
| `LMUVehicleTelemetry` | `mPos` | 160 |
| `LMUVehicleTelemetry` | `mLocalVel` | 184 |
| `LMUVehicleTelemetry` | `mLocalAccel` | 208 |
| `LMUVehicleTelemetry` | `mOri` | 232 |
| `LMUScoringInfo` | `mLapDist` | 1720 (relativo 88) |

## Convenciones spotter

Ver [`architecture/spotter-geometry-findings.md`](../architecture/spotter-geometry-findings.md):

- LMU local `+X` apunta a la **izquierda** del conductor.
- LMU local `+Z` apunta hacia atrás.
- `mOri` filas se leen como matriz; los ejes locales en mundo son las
  **columnas**.
- NO usar `Row0` directamente como eje lateral.

## Reader

`internal/telemetry/lmu/reader_windows.go` abre `LMU_Data` con
`CreateFileMapping` + `MapViewOfFile`. Stub `reader_stub.go` para tests
en otros OS.

```go
type Reader struct {
    handle windows.Handle
    ptr    uintptr
    size   uintptr
}

func Open() (*Reader, error)
func (r *Reader) Bytes() []byte
func (r *Reader) Close() error
```

## Parser

`internal/telemetry/lmu/parser.go` (parser público) decodifica los
bytes a `models.Telemetry` (incluye Fuel, FuelCap, GamePhase, Place,
VehicleClass, BestLapTime, LastLapTime, TimeBehindLeader,
TimeBehindNext, Penalties, LapDistance, PitState). El parser
experimental `internal/engineer/lmu/parser.go` (sin commit) expone
`engineertelemetry.Frame` con solo geometría (Position, Orientation).

Constantes en `internal/telemetry/lmu/offsets.go`:

```go
const (
    vehicleTelemetryFuel               = 524
    vehicleTelemetryFuelCapacity       = 608
    vehicleTelemetryPosition           = 160
    vehicleTelemetryLocalVel           = 184
    vehicleTelemetryLocalAccel         = 208
    vehicleTelemetryOrientation        = 232

    vehicleScoringPosition             = 264
    vehicleScoringLocalVel             = 288
    vehicleScoringLocalAccel          = 312
    vehicleScoringOrientation          = 336
    vehicleScoringPathLateral          = 112
    vehicleScoringTrackEdge            = 120
    vehicleScoringPlace                = 199
    vehicleScoringVehicleClass        = 200
    vehicleScoringTimeBehindNext      = 232
    vehicleScoringTimeBehindLeader    = 244
    vehicleScoringBestLapTime         = 144
    vehicleScoringLastLapTime         = 168
    vehicleScoringPenalties           = 194
    vehicleScoringPitGroup            = 480
    vehicleScoringFuelFraction        = 578

    scoringTrackName                   = 1632
    scoringGamePhase                   = 1740
    scoringPlayerName                  = 1748
)
```

## Generador de offsets

`tools/generate-lmu-offsets.py` regenera `offsets.go` desde el layout
ctypes de `shared-telemetry\pyLMUSharedMemory\lmu_data.py`.

```powershell
python tools/generate-lmu-offsets.py --go-output internal/telemetry/lmu/offsets.go
```

## Antes de editar parser o reader

```powershell
go test ./internal/telemetry/lmu -v
go run ./cmd/lmu-debug -mock -once
```

## Preferencia de fuente PlayerTelemetry vs VehicleScoring

Cuando ambos tienen datos del jugador, `Classify` prefiere
`PlayerTelemetry` para posición y orientación:

```go
playerYaw := YawFromRF2Orientation(player.Orientation)
if frame.Player != nil && !isZeroVec(frame.Player.Orientation.Row2) {
    playerYaw = YawFromRF2Orientation(frame.Player.Orientation)
}
```

Razón: `VehicleScoring` puede ir ligeramente retrasada durante
transiciones de LMU. PlayerTelemetry representa el coche conducido
directamente.

## Reconexión

Estado actual: cuando LMU arranca **después** del reader, no hay
reconexión automática. Esto es un gap conocido en prealpha. Workaround
manual: relanzar `cmd/lmu-debug` o la app Wails.

Objetivo para cierre prealpha: implementar reconexión automática con
backoff exponencial, manteniendo el reader abierto y refrescando el
mapping cuando reaparece.

## Validaciones activas

- Buffer `nil` o demasiado corto → `nil frame, nil error` (degradación
  silenciosa, log debug).
- `mPos` con NaN/Inf → posición inválida, omitida.
- `Orientation.Row2` con magnitud ~0 → orientación inválida, fallback a
  scoring si está disponible.
