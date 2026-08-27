# F1.2 — Contrato de segmentos temporales v1 (Telemetry Analysis)

**Fecha:** 2026-08-21
**Issue:** #725
**Owner:** Telemetry Analysis (`internal/telemetryanalysis/strategyprojection`)
**Estado:** compile-only `temporalsegments.v1`

## Motivacion

El informe F0-1 §5 declara `INVALID` la alineacion continuos/eventos, `DEGRADED`
la segmentacion de vueltas y `INVALID` la identidad de stint/piloto. Sin un
contrato de tiempo, pit loss, estrategia observada y degradacion por esquina no
son entregables. La recomendacion minima del §5 / §12 es:

> `ContinuousSegment { segmentId, sourceStart, sessionStartTs, sessionEndTs, driverId?, reason }`
> `LapBoundary` con fuente y calidad, `StintBoundary` con causa y confianza,
> `TrackLocation` por distancia normalizada, sin comprimir huecos en silencio.

Este contrato congela exactamente eso antes de F3a, como exige D19.

## Tipos

### ContinuousSegment

```go
type ContinuousSegment struct {
  SegmentID      string
  SourceStart    *time.Time // nil si TimeOriginUnknown
  SessionStartTs time.Time
  SessionEndTs   time.Time
  DriverID       *string
  Reason         string
  Presence       Presence
  Provenance     Provenance
  Confidence     Confidence // sampleSize = filas, range = duracion, version
}
```

Un segmento cubre solo la ventana del piloto local. Si la sesion global es mas
larga, el resto se representa con `CoverageGap`, nunca saltando el reloj.

### CoverageGap

```go
type CoverageGap struct {
  GapID      string
  StartTs    time.Time
  EndTs      time.Time
  Reason     string // "driver_not_in_car" | "wal_excluded" | "no_coverage"
  Presence   Presence // missing por definicion
  Provenance Provenance
}
```

Regla dura: los huecos se representan; jamas se comprimen en silencio.

### LapBoundary

```go
type LapBoundary struct {
  LapNumber  int
  Timestamp  time.Time
  Source     LapBoundarySource // lap_dist_reset | lap_event | reconciled | unknown
  Quality    Presence          // calidad del limite, no del dato
  Provenance Provenance
  Confidence Confidence
  Location   TrackLocation
}
```

`LapBoundarySource` refleja las dos fuentes del informe (§5: resets de `Lap Dist`
y eventos de lap coinciden exacto en 7/21, ±1 en 10/21, difieren hasta 6).
`reconciled` indica que se aplicaron guards de incompletas/out/in-lap.

### StintBoundary

```go
type StintBoundary struct {
  StintNumber int
  Timestamp   time.Time
  Cause       StintBoundaryCause // pit | fuel_jump | tyre_change | driver_change | unknown
  Presence    Presence
  Provenance  Provenance
  Confidence  Confidence // varianza del salto (p. ej. Fuel)
}
```

Causa y confianza permiten al consumidor decidir si el stint es utilizable.

### TrackLocation

```go
type TrackLocation struct {
  NormalizedDistance float64 // 0..1
  Presence          Presence
}
```

Distancia normalizada por vuelta. Mapping de esquina versionado futuro: sin
mapping, `Presence=missing` y no se infiere nombre desde distancia sola
(§12 recomendacion 3).

## Decisiones simples

- `SourceStart` nullable porque continuos declaran `TimeOriginUnknown`.
- `DriverID` nullable porque no hay ID explicito de piloto en este corte.
- `NormalizedDistance` en `[0,1]`; fuera de rango es `invalid_document`.
- Los arrays `segments`/`gaps`/`lapBoundaries`/`stintBoundaries` pueden estar
  vacios pero nunca `null` en JSON (se serializan como `[]`).

## Fixtures

- `testdata/temporalsegments_v1.json` — un segmento + un gap + una vuelta + un stint.
- `testdata/strategyinputprojection_v2_new.json` incluye una copia de temporal embebida.

## Validacion

`ContinuousSegment.Validate`, `CoverageGap.Validate`, `LapBoundary.Validate`,
`StintBoundary.Validate` comprueban identificadores, presencia, procedencia,
confianza y rangos. `TemporalSegmentsV1` se valida via `ContractVersion`.

## Verificación

```bash
go test ./internal/telemetryanalysis/strategyprojection/... -run TestContinuousSegment
```
