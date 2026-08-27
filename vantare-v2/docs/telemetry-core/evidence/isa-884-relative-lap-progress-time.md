# ISA-884 — Relative sobre progreso temporal de vuelta

Fecha: 2026-08-27. Base: `origin/nightly@ca92605e`. Rama:
`vantareapp/isa-884-relative-time`. Implementación: `88f4697c`.

## Resultado contractual

Relative representa tráfico físico alrededor del jugador en un circuito
circular. La ventana se selecciona por `LapDistance`, no por clasificación ni
por disponibilidad del texto de gap. Su orden es:

1. coches por delante, de lejano a cercano;
2. jugador;
3. coches por detrás, de cercano a lejano.

El gap mostrado es temporal y firmado respecto al jugador: positivo delante,
cero para el jugador y negativo detrás. `relativeLapDelta` conserva de forma
independiente la diferencia de vueltas de clasificación; nunca invalida ni
sustituye los segundos físicos.

## Flujo de autoridad

```text
equivalente nativo del simulador
  -> driver concreto
  -> standings.lap_progress_time (Field con calidad y procedencia)
  -> reducer canónico
  -> standings.relative-gaps@2 (Go)
  -> BuildRelative / proyección Overlay
  -> ViewModel visual
  -> WidgetVisualHost
```

LMU mapea `mTimeIntoLap` de cada fila scoring, `float64` en offset `+464`.
Valores finitos positivos, cero y negativos son datos observados válidos. La
derivación calcula `vehicle - player` y normaliza el resultado al arco temporal
firmado más corto usando una vuelta estimada observada y positiva del jugador
como periodo. No estima la coordenada desde distancia, velocidad ni gaps al
líder.

SimX demuestra la neutralidad del contrato mapeando su equivalente exacto: su
fuente cerrada conoce el tiempo transcurrido dentro de la vuelta y el periodo
de cada coche. Cualquier driver futuro deja la señal `missing` mientras no
exista un equivalente nativo exacto demostrado. No hay ramas por simulador por
encima del driver y no se añadió un contrato de ViewModel alternativo.

## Ausencia y datos contradictorios

El cero individual sigue siendo válido. Las fixtures antiguas LMU 1.3/1.4
revelan, sin embargo, un patrón de fuente no poblada: todos los coches publican
exactamente cero mientras `mLapDist` demuestra que ocupan puntos distintos del
circuito. El driver marca ese conjunto `missing`; conservar los ceros
fabricaría gaps `0.0`. Un valor no finito permanece `invalid` y no se degrada a
`missing` por esa regla.

Si falta el gap temporal de un vecino, `BuildRelative` conserva la fila física
y publica únicamente `gapSeconds.q=missing`. Si falta la distancia del jugador,
publica el ancla del jugador sin inventar vecinos.

## Encaje arquitectónico

El corte aplica ADR 0004 sin cambiar sus fronteras: adquisición y peculiaridad
LMU permanecen en el driver; schema, reducer y derivación son neutrales al
simulador; la proyección entrega datos listos para presentar; React no calcula
telemetría. Por ello no hace falta un ADR nuevo.

La selección física compartida también alimenta la marca dirty de Relative.
Así, cadence y builder no mantienen algoritmos paralelos que puedan escoger
filas distintas. El comparador shadow vuelve a contrastar `gapText`, porque V1
y V2 ya comparten semántica física.

## Regresiones

- derivación temporal alrededor del wrap y con lap delta de clasificación no
  nulo;
- cero, negativo, no finito y patrón de cero uniforme contradictorio en LMU;
- mapping SimX del mismo significado sin lógica específica sobre el driver;
- selección circular física aun cuando los gaps sugieren otro orden;
- vecino físico presente con gap `missing`;
- dirty mark idéntica a la ventana emitida;
- goldens Overlay v2 de 1, 20, 44 y 104 coches;
- ViewModels y comparador shadow sin veto por `relativeLapDelta`, con la misma
  neutralización visual cuando jugador o rival están en pit.

## Gates locales

- `go test ./... -count=1`: PASS;
- `go test ./internal/telemetry/... -count=1`: PASS;
- `go test ./internal/telemetry/drivers/lmu -count=20`: PASS;
- `go test ./internal/telemetry/derive -count=20`: PASS;
- `pnpm test`: PASS, 414 archivos y 3.137 tests;
- regresiones Relative/Shadow posteriores: PASS, 3 archivos y 42 tests;
- `pnpm typecheck`: PASS;
- ESLint sobre los seis archivos frontend modificados: PASS;
- `pnpm build`: PASS; conserva el warning conocido de chunk principal grande;
- `go vet ./internal/telemetry/...`: conserva solo dos avisos heredados de
  `unsafe.Pointer` en `reader_windows.go` y `version_windows.go`, fuera del diff.

La primera ejecución global en paralelo encontró la expectativa SimX obsoleta
y un timeout de `voiceinput`. El primero se corrigió mapeando el equivalente
temporal exacto de SimX; el segundo pasó aislado y la repetición completa sin
competencia pasó. No se debilitó ningún test.

La prueba manual LMU/Wails real sigue pendiente. Un test o fixture no sustituye
la comprobación de la app abierta.
