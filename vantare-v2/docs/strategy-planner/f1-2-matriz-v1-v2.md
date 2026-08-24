# F1.2 — Matriz v1 → v2 (Telemetry Analysis)

**Fecha:** 2026-08-21
**Issue:** #725 (ISA-694 F1.2)
**Contratos afectados:** `StrategyInputProjection v1 → v2`, `ObservedStrategy v1` (nuevo), `TemporalSegments v1` (nuevo)

## 1. Productores y consumidores

| Contrato | Productor (owner) | Consumidor | Issue |
|---|---|---|---|
| `StrategyInputProjection v1` (histórico) | Telemetry Analysis `internal/telemetryanalysis` (TA-05) | Strategy `internal/strategy` adapter histórico | ISA-159 → ISA-145 |
| `StrategyInputProjection v2` | Telemetry Analysis `internal/telemetryanalysis/strategyprojection` (F1.2 #725) | Strategy Planner (solver + application) | #725 → F3a/F4 |
| `ObservedStrategy v1` | Telemetry Analysis `internal/telemetryanalysis/strategyprojection` | Pipeline editorial + backtest | #725 → F4/F6 |
| `TemporalSegments v1` | Telemetry Analysis `internal/telemetryanalysis/strategyprojection` | Derivación multi-sesión + `ObservedStrategy` | #725 → F3a |

Regla de ownership: Strategy solo consume este paquete público; Analysis nunca
importa `internal/strategy/*` (dominio privado). Tests de arquitectura en
`strategyprojection_test.go:TestNoImportOfStrategyPrivateDomain` lo afirman.

## 2. Qué cambia de v1 a v2

| Eje | v1 | v2 | Motivo (D19 / F0-1) |
|---|---|---|---|
| **presencia/calidad** `Presence` | implícito en `Quality` (`valid/missing/...`) del modelo histórico | `Presence` explícito `valid\|missing\|invalid\|stale\|unsupported\|unknown` por familia y por punto | Spec §6: vocabulario congelado en F1 base `internal/strategy/contract` |
| **procedencia** `ProvenanceKind` | `unknown/observed/corrected/manual/derived/estimated/range` | + `reference` para datos del catálogo comunitario | Spec §6 + matriz v1→v2 |
| **confianza** `Confidence` | `ConfidenceLevel` (`unknown/low/medium/high` + `basis`) del contrato Strategy | `Confidence{sampleSize, rangeLower/rangeUpper, variance, computationVersion}` | Spec: muestra/rango/varianza/versión; el `basis` de Strategy sigue válido pero no suficiente para curvas |
| Ritmo representativo | ritmo/rango prometido sin bucket transportable al consumidor | `representativePaceByClimateBucket[dry\|humid\|wet]` con mediana, presencia, procedencia, confianza y causa | ISA-827: el agregado no puede depender del gate de 3 stints/15 vueltas/3 edades de `CombinedStintPaceCurve` para conocer un ritmo base |
| `CombinedStintPaceCurve` | curvas separadas peso-fuel / edad-neumático prometidas | solo `combined_only`; separadas condicionadas a gate `separable` | A1 DEGRADED, correlación -0.94, R² bajo |
| Pit | `PitLossBreakdown` exacto (tránsito/servicio) | `ObservedPitLaneInterval` + tasas `1.9-4.0 L/s` / `~2.5 pp/s` degradado + inputs manuales | A4 INVALID, `In Pits` cubre carril completo sin marcadores |
| Ahorro | derivable de corpus | procedencia `manual` obligatoria; derivable solo vía A/B | A5 INVALID, N=2 confundido |
| Clima | `CloudDarkness`/`OffpathWetness` como % | buckets `PathWetness` `0/5/12.5%` (`dry/humid/wet`) | A1: booleanos no informativos |
| Degradación | por esquina | por eje/rueda; esquina futuro | F0-1 §5: sin `LapBoundary` reconciliado ni mapping versionado |
| Segmentos temporales | no existía (huecos comprimidos) | `ContinuousSegment` + `CoverageGap` + `LapBoundary` + `StintBoundary` + `TrackLocation` | F0-1 §5/§12, D19 |

## 3. Compatibilidad

- **Wire:** v1 y v2 no son compatibles en `contractVersion`. Un consumidor v1 que
  reciba `strategyinputprojection.v2` debe rechazarlo (exacto) y no intentar
  interpretarlo como v1. Un consumidor v2 que reciba `strategyinputprojection.v1`
  lo detecta por `contractVersion` y lo trata como `missing`/`unsupported` por
  familia, sin fallback sintético.
- **v2 anterior a ISA-827:** `representativePaceByClimateBucket` es aditivo y
  opcional al leer documentos persistidos. Un productor actualizado siempre lo
  emite; si falta, el consumidor conserva el estado explícito de ritmo ausente.
  Analysis puede reparar en memoria un modelo `consumption-pace.v1` solo cuando
  el propio store ya demuestra bucket, tiempo fiable, inclusión de familia y
  presencia Fuel/VE en esa misma vuelta; nunca escribe el store ni estima.
- **Old → New:** consumidor nuevo puede leer fixture old como mapa
  (`TestOldFixtureCompatibility`): verifica que no contiene `reference` ni gaps
  y que su `contractVersion` es `strategyinputprojection.v1`. La migración a v2
  requiere re-derivar desde sesiones, no transformar JSON.
- **New → Old:** productor nuevo nunca envía v1; si un consumidor viejo aún
  existe, se le mantiene en v1 hasta su retirada (ver §4).
- **Procedencia `reference`:** solo existe en v2; un consumidor que no la
  conozca debe tratarla como `unknown` y no como `observed`.
- **Tipos Go:** los paquetes son distintos (`internal/strategy/contract` vs
  `internal/telemetryanalysis/strategyprojection`). No hay colisión de imports.

## 4. Retirada

- v1 queda **deprecated** al merge de #725, pero no se borra en este corte.
- Retirada efectiva en F7a tras GO de Isaac, cuando ningún consumidor (solver,
  backtest, catálogo) importe v1 y las suites `duckdb_integration` pasen solo
  con v2. Se documentará en `docs/roadmap/plan.md` en el PR que elimine v1.
- `TemporalSegments v1` y `ObservedStrategy v1` no tienen predecesor: son
  adiciones, no reemplazos.

## 5. Contract tests / fixtures old/new

Todos contra `internal/strategy/contract` v1 vigente (`strategy.v1`) y contra
este paquete:

| Fixture | Ubicación | Qué prueba |
|---|---|---|
| `strategyinputprojection_v1_old.json` | `strategyprojection/testdata/` | old sin `reference`/gaps; decodifica como mapa, `contractVersion` v1, incompatible con `Validate()` v2 |
| `strategyinputprojection_v2_new.json` | `strategyprojection/testdata/` | new completo con `combined_only`, pit degradado, buckets, `temporal` con gaps; `Validate()` verde |
| `observedstrategy_v1.json` | `strategyprojection/testdata/` | nuevo contrato, `compoundRaw` 0-2, pit lanes, `Validate()` verde |
| `temporalsegments_v1.json` | `strategyprojection/testdata/` | `CoverageGap` nunca comprimido, `LapBoundary` `reconciled`, `StintBoundary` con causa+confianza |
| `internal/strategy/contract/testdata/contract_manifest_v1.json` | `strategy/contract/testdata/` | manifiesto v1 con `provenanceKinds`/`confidenceLevels`/`presence` base; usado para afirmar que `Presence` y `Provenance` de v2 son superset sin romper v1 |

Tests:

- `TestFixturesDecode` — new fixtures decodifican y validan.
- `TestOldFixtureCompatibility` — old fixture no contiene `reference` y se
  rechaza como v2 (compatibilidad fail-closed).
- `TestProvenanceReferenceAdded` — `reference` es el único valor nuevo.
- `TestNoImportOfStrategyPrivateDomain` — guard de arquitectura (Analysis no
  importa `internal/strategy/*`).

Ejecutar:

```bash
go test ./internal/telemetryanalysis/strategyprojection/... -run TestFixturesDecode -v
go test ./internal/telemetryanalysis/... ./internal/strategy/... 
```
