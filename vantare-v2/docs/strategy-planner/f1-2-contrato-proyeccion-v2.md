# F1.2 — Contrato StrategyInputProjection v2 (Telemetry Analysis)

**Fecha:** 2026-08-21
**Issue:** #725 (parte de ISA-694, fase F1.2)
**Owner:** Telemetry Analysis (`internal/telemetryanalysis/strategyprojection`)
**Consumidor:** Strategy Planner (`internal/strategy/*` solo consume, nunca produce)
**Estado:** compile-only, versionado `strategyinputprojection.v2`

## Objetivo

Publicar la proyeccion que alimenta al solver asistido, ya degradada por D19
y por el informe F0-1. Cada familia viaja con tres ejes independientes:

- **presencia/calidad** `Presence`: `valid | missing | invalid | stale | unsupported | unknown`
  (vocabulario congelado en F1 tomando como base `internal/strategy/contract`);
- **procedencia** `ProvenanceKind`: vocabulario vigente
  `observed | corrected | manual | derived | estimated | range | unknown`
  mas `reference` (nuevo en v2 para datos del catalogo comunitario);
- **confianza** `Confidence`: `sampleSize`, `rangeLower/rangeUpper`, `variance`,
  `computationVersion`.

Una familia ausente queda `missing`/`unsupported` y no bloquea las demas.

## Ubicacion del paquete

`internal/telemetryanalysis/strategyprojection` — ver `doc.go` para justificacion:
cohesion con el dueno historico, frontera `internal` que evita acceso a storage
privado, y alternativa descartada de crear un top-level neutro.

## Familias degradadas D19

Basado en `isa-694-spec.md` §3 (A1 DEGRADED, A4 INVALID, A5 INVALID) e
`informe-f0-1.md` §5 / §12:

| Familia | Degradacion aplicada | Decisión simple donde el spec no fija |
|---|---|---|
| Ritmo representativo por clima | mediana de vueltas completas utilizables por `dry/humid/wet`, con presencia, procedencia, confianza y motivo por bucket; independiente de la curva | `dry` alimenta el ritmo base si está `valid`; la ausencia de curva de stint no invalida esta familia |
| Ritmo por clase | `classPace` conserva presencia, procedencia, confianza, motivo tipado y `byClassName[nombre]=segundos/vuelta` | solo admite procedencia `reference`; hasta que exista la base compartida, el productor publica `missing`, `no_class_pace_source` y un mapa vacío |
| 4. `CombinedStintPaceCurve` | `identifiability=combined_only` por defecto; `FuelWeightCurve` / `TyreAgeCurve` solo si gate `separable` pasa | Gate = correlacion stint vs fuel no confundida + N>=30; si no pasa, no se publica curva separada (no se estima) |
| 6. Pit | `ObservedPitLaneInterval` + tasas observadas (1.9-4.0 L/s fuel, ~2.5 pp/s VE) con calidad degradada; `transitSecondsManual` y `serviceSecondsManual` manuales | Tasas solo si el intervalo tiene `hasFuelRise`/`hasVERise`; si no, `nil` y `missing` — nunca se inventa un reparto transito/servicio |
| 7. Ahorro | procedencia `manual` obligatoria; `SavingLevel` opcional solo via protocolo A/B (>=5 vueltas limpias alternadas por mezcla) | Si no hay protocolo A/B, `levels` vacio y `manualNote` explica el requisito |
| 8. Clima | buckets `PathWetness` discretos `dry(0%) / humid(5%) / wet(12.5%)`; `CloudDarkness` y `OffpathWetness` booleanos se descartan | Buckets por evento timestamped, no por porcentaje continuo; `WeatherConditions` solo como etiqueta resumen |
| 5. Degradacion | por eje (`front`/`rear`) y rueda (`FL`/`FR`/`RL`/`RR`); esquina futuro condicionado a `LapBoundary` reconciliado + mapping versionado | `byCorner` solo si existe mapping versionado; si no, `missing` y nota en `compoundMappingNote` |
| TyresCompound | codigos 0-2 sin mapping semantico: curvas por compuesto condicionadas a resolver mapping | `compoundRaw` se conserva como int, `compoundNote` explica que no hay etiqueta honesta |
| 1-3,9 | validez de vueltas etiquetada (out/in/pit/incidente/trafico D7), consumo Fuel/VE con rango/varianza, clasificacion por metadata A3 | Vueltas con etiqueta, no solo exclusion; sesiones cortas = `usableForFamilies` vacio |

## Tipos Go

`StrategyInputProjectionV2` en `projection.go` (ver `contract.go` para version
y validacion). La validacion rechaza publicar `fuelWeightCurve`/`tyreAgeCurve`
sin `identifiability==separable`.

## Fixtures / contract tests

- `testdata/strategyinputprojection_v2_new.json` — fixture new completo (incluye gaps, reference no usado aun, climate buckets).
- `fuelConsumption.byClimateBucket` y
  `virtualEnergyConsumption.byClimateBucket` transportan exclusivamente los
  escalares observados de cada clima. El mapa puede faltar en documentos v2
  antiguos; un consumidor no puede sustituir un bucket ausente con
  `meanPerLap` ni con otro bucket.
- `representativePaceByClimateBucket` es una ampliación aditiva de v2 para
  documentos ya persistidos: puede faltar al leer una proyección anterior, pero
  todo productor nuevo publica los tres buckets. Cada ausencia lleva una causa
  explícita (`no_completed_laps...`, `no_reliable_lap_time...`,
  `no_stable_climate_bucket...` o `no_clean_complete_laps...`).
- `classPace` es otra ampliación aditiva. Los documentos anteriores pueden no
  traerla; todo productor nuevo la emite. Una familia válida exige al menos una
  clase, segundos por vuelta positivos, muestra positiva y procedencia
  `reference`. Analysis no ofrece una entrada para derivarla de telemetría.
- `testdata/strategyinputprojection_v1_old.json` — fixture old (v1) sin `reference`, sin gaps, sin buckets; sigue decodificando como mapa y se declara incompatible como v2.
- Test `TestFixturesDecode` y `TestCombinedStintPaceCurveIdentifiability` verifican old/new contra el validador.

## Compatibilidad y retirada

Ver `f1-2-matriz-v1-v2.md`.

## Verificación

```bash
go vet ./internal/telemetryanalysis/strategyprojection/...
go test ./internal/telemetryanalysis/... ./internal/strategy/...
gofmt -l ./internal/telemetryanalysis/strategyprojection/
```
