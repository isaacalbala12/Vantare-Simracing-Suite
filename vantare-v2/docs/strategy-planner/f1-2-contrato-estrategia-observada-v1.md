# F1.2 — Contrato ObservedStrategy v1 (Telemetry Analysis)

**Fecha:** 2026-08-21
**Issue:** #725
**Owner:** Telemetry Analysis (`internal/telemetryanalysis/strategyprojection`)
**Estado:** compile-only `observedstrategy.v1`

## Objetivo

D16 del spec: la estrategia observada (que corrio realmente cada piloto:
vueltas de parada, compuestos, stints, resultado) se extrae de cada sesion de
carrera como familia de derivacion de primera clase. El corpus de carreras
reales es la base de datos de estrategias para el pipeline editorial y el
backtest.

## Diseño

`ObservedStrategyV1`:

- `sessionId`, `generatedAt`, tres ejes (`Presence`/`Provenance`/`Confidence`)
- `stints[]` con `startLap`/`endLap`, `compoundRaw` (0-2) + `compoundNote`
  (sin mapping semantico, ver A1 degradado), y tres ejes por stint
- `pitStops[]` con `lapNumber`, `pitLaneSeconds` (ObservedPitLaneInterval),
  `fuelAddedLiters`/`veAddedPercent` opcionales (solo si hubo salto observado),
  y tres ejes
- `result` opcional con `totalTimeSeconds`, `position`, `completed`

Decisiones simples donde el spec no fija:

- `compoundRaw` es `*int` nullable: si el canal `TyresCompound` no cambio en la
  sesion, queda `nil` y `compoundNote` explica "sin mapping semantico".
- `fuelAddedLiters`/`veAddedPercent` solo se rellenan si el intervalo de pit
  mostro `hasFuelRise`/`hasVERise` (tasas 1.9-4.0 L/s, ~2.5 pp/s); si no, `nil`
  y no se inventa un desglose.
- `stints` se derivan de `StintBoundary` (ver contrato de segmentos); si la
  identidad de stint es `INVALID` (informe F0-1 §5), la proyeccion entera queda
  `Presence=missing` con `Provenance=derived` y `Confidence.sampleSize=0`.

## Fixtures

- `testdata/observedstrategy_v1.json` — 3 stints, 2 pits, con compoundRaw y tasas.
- Validado por `TestFixturesDecode`.

## Relación con StrategyInputProjection

`ObservedStrategy` es una familia independiente que alimenta el catalogo y el
backtest, pero no sustituye a `CombinedStintPaceCurve` ni a `PitFamily`. El
solver la consume solo para holdout, nunca como input de optimizacion.

## Verificación

```bash
go test ./internal/telemetryanalysis/strategyprojection/...
```
