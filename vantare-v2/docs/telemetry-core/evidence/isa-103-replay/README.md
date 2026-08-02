# Evidencia ISA-103 / TC-06C

## Tests focales

```powershell
go test ./internal/telemetry/recording/... -count=1
go test ./internal/telemetry/drivers/lmu -count=1
go test ./internal/telemetry -count=1
```

Cubren player determinista, propiedad de datos, fixture raw cerrada y SHA-256,
parsers LMU reales, reducer/coordinador/derive/cuatro proyecciones, replay
histórico congelado/paginado, hechos huérfanos, schemas futuros y motor de
migración copy-on-write.

También cubren el límite exacto del último checkpoint, IDs únicos por reader,
rangos temporales causales, identidad de páginas, metadata ligada al manifest,
columna/payload de facts, integridad agregada de chunks, transición de sesión,
facts sin batch, pacing absoluto y activación CAS de migraciones.

La regresión determinista del teardown REST LMU pasó 100 repeticiones después
de retirar de ese test el ticker real de 60 Hz:

```powershell
go test ./internal/telemetry/drivers/lmu `
  -run '^TestDriverDoesNotPublishOrMutateRESTAfterCancellation$' -count=100
```

## Cierre independiente

Dos revisiones finales read-only emitieron `ACCEPT` con
P0/P1/P2/P3 = 0. Además de los focales anteriores:

- `go test ./internal/telemetry/... -count=1`: PASS;
- `go test -p 1 ./... -count=1`: PASS;
- `go vet ./internal/telemetry/recording/... ./internal/telemetry`: PASS;
- `CGO_ENABLED=0 wails3 build DEV=true`: PASS;
- `git diff --check` y `gofmt`: PASS.

La suite global paralela puede reproducir la contención Windows heredada de
`TestConcurrentSavesDontCorruptFile`; el caso individual y la suite serial
pasan. No pertenece al diff de ISA-103.

## Benchmark

```powershell
go test ./internal/telemetry/recording/sqlite -run '^$' `
  -bench '^BenchmarkHistoricalReplayPage512$' -benchtime=5x -count=3
```

Windows amd64, Ryzen 7 3700X:

| Caso | Tiempo | Memoria | Allocs |
|---|---:|---:|---:|
| página 512, 64 vehículos | 223,8–273,6 ms/op | ~18,6 MiB/op | 26.046–26.047 |

La medición incluye decode JSON, CRC, validación, ownership y construcción de
512 registros. No es el hot path live.

## Golden

- `raw-v1.golden.json`: fixture raw sintética, cerrada y con SHA-256.
- `canonical-v1.golden.json`: orden, cursores y hechos canónicos.
- `canonical-integration-v1.golden.json`: digest de reducer, coordinador,
  derivaciones y cuatro proyecciones.
- `testdata/lmu-fixture.bin`: captura Shared Memory ya sanitizada y fijada por
  SHA-256
  `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`.
- Los payloads REST de prueba son sintéticos y viven en una fixture separada;
  no heredan la procedencia de la captura Shared Memory.
- La metadata distingue expresamente el build del simulador del build de
  Vantare.

Ningún test actualiza los golden automáticamente.
