# ISA-894 · R6b retirada del Hub Overlay V1 inerte

## Objetivo

Retirar de `TelemetryCoreRuntime` el Hub Overlay V1 inerte que R6a dejo
construido pero vacio: campo, constructor, accessor, cierre/lifecycle,
`Transport` de metricas y contadores `ProjectionsPublished` /
`OverlayProjectionsPublished`. Tras este corte no queda ningun Hub Overlay
en el runtime; solo `strategyHub`, `OverlayV2Publishers` y los transportes
de producto vivos.

Base congelada: `58d1e8fe7728462becde1c1b242bec15d983fd06` (cierre R6a).
Rama: `vantareapp/isa-894-retirada-v1-r6b`.
Worktree: `C:\tmp\vantare-v1-retirada-r6b\vantare-v2`.

## Alcance cerrado

Produccion (un unico archivo, salvo fallout demostrado por el wiring guard):

- `internal/app/telemetry_core_runtime.go`:
  - campo `hub *telemetrytransport.Hub` del struct;
  - bloque `NewHub(HubConfig{Product: ProductOverlay, ...})` del constructor;
  - import `overlayprojection` (queda huerfano: sus unicos usos productivos
    son las dos versiones de ese bloque);
  - accessor `Hub()`;
  - cierre en `closeProductHubs` (queda solo `strategyHub`; el mensaje de
    error Overlay desaparece con su rama);
  - metricas `ProjectionsPublished`, `OverlayProjectionsPublished` y
    `Transport` del struct `TelemetryCoreMetrics` y sus asignaciones en
    `Metrics()`;
  - rama `case ProductOverlay` de `productName` (huerfana: los dos callers
    pasan `ProductStrategy`); la funcion se conserva para Strategy;
  - comentarios que describen el Hub retirado.
- Fallout anticipado, a confirmar con el wiring guard: `CurrentVersion` y
  `MinimumSupportedVersion` de `internal/telemetry/projection/overlay`
  pierden su unica referencia productiva (las dos lineas del bloque
  retirado). No son tipos de contrato (contract-gen no los usa) sino
  politica de version del Hub retirado; si el guard los marca huerfanos se
  retiran en este mismo corte sin excepcion ni allowlist, igual que
  `FromFreshness` en R6a.1. Los tipos V1 (`SnapshotV1`, `PayloadV1`, ...),
  usados por contract-gen, se preservan para R7.

Tests que exigen el Hub vacio y deben migrar a ausencia estructural o a
Strategy correcto (no a aserciones mas debiles):

- `internal/app/overlay_v1_emit_test.go`: se reescribe como test
  estructural de retirada (es tambien el RED, ver TDD).
- `internal/app/overlay_v1_guard_test.go`: la lista prohibida del runtime
  suma `overlayprojection`, `Product: telemetrytransport.ProductOverlay` y
  el accessor `Hub()`; se conservan las entradas antiguas como regresion.
- `internal/app/telemetry_core_strategy_test.go`: sin `Hub()`; campo Hub
  unico; metricas sin `Transport`/contadores; cierres solo Strategy;
  `TestTelemetryCoreRuntimeOverlayHubCloseDoesNotAffectWailsAdapter` se
  elimina (su premisa — un Hub Overlay cerrable aislado — deja de existir;
  el caso Strategy lo cubre `...UnexpectedStrategyWailsClose...`, que pasa
  a singular).
- `internal/app/telemetry_core_engineer_test.go`,
  `telemetry_core_overlay_v2_test.go`, `telemetry_core_hardening_test.go`,
  `telemetry_core_runtime_test.go`, `telemetry_core_runtime_consumer_test.go`,
  `telemetry_core_runtime_grid_test.go`, `telemetry_shadow_test.go`,
  `strategy_live_lmu_windows_test.go`: se eliminan las exigencias de Hub
  vacio y los campos de metricas retirados; se conserva la semantica
  Strategy/V2/Engineer.
- `cmd/vantare/telemetry_lifecycle_harness_test.go`: el chequeo post-stop
  del Hub desaparece (queda Strategy); los bucles de replay que emiten el
  producto Overlay pasan a Strategy-only. La expectativa 404 de la ruta
  `ProjectionRoute(ProductOverlay)` se conserva intacta (SSE 404 vivo).

## Invariantes (no se tocan)

- Hub generico `telemetrytransport` (`NewHub`, `Hub`, `newFull`,
  `ProductOverlay` como constante, rutas, eventos): se preserva para R7.
- `strategyHub`, `StrategyHub()`, `NewStrategyFull`, Strategy V1,
  `OverlayV2Publishers`, Engineer, Analysis: semantica intacta.
- `ProductOverlay`/tipos/contract-gen/tooling/frontend legacy: para R7.
- Strategy/Engineer/Analysis V1 independientes, SSE 404, Wails V2: intactos.
- `transport.go`, `server/`, `main.go` productivos: sin cambios salvo
  contradiccion demostrada (entonces se para y se reporta).
- Sin frontend, sin push/PR/merge/promocion, sin apps/LMU, sin `.env`.

## TDD obligatorio

### RED (antes de produccion)

Reescribir primero `overlay_v1_emit_test.go` como
`TestOverlayV1HubPhysicallyRetired`, que exige literalmente:

1. exactamente 1 campo `*telemetrytransport.Hub` en
   `TelemetryCoreRuntime` (contra la base hay 2: `hub` + `strategyHub`);
2. ningun campo `hub` ni metodo `Hub()` en el runtime (reflexion +
   presencia literal del accessor en fuente);
3. `TelemetryCoreMetrics` sin `ProjectionsPublished`,
   `OverlayProjectionsPublished` ni `Transport`;
4. fuente de `telemetry_core_runtime.go` sin `overlayprojection`, sin
   `Product: telemetrytransport.ProductOverlay` y sin
   `NewHub(HubConfig{`.

Contra `58d1e8fe` debe FALLAR citando esos restos. No se admiten tests que
solo miren Replay vacio/404: el RED es estructural. Registrar comando,
salida y expectativa antes de tocar produccion.

### GREEN (minimo)

- Aplicar la retirada productiva del alcance.
- Migrar unicamente los tests/harness listados (compilacion + nueva
  expectativa Strategy/estructural).
- Pasar el wiring guard sin excepciones nuevas; si marca las dos
  constantes de version, retirarlas en este corte (fallout demostrado,
  no alcance nuevo).
- `go vet`/`gofmt`/`diff --check`/frontera limpios.

## Gates

- RED focal literal registrado y GREEN posterior.
- Focales: `internal/app` (runtime, strategy, engineer, overlayv2,
  hardening, guard, shadow, metrics, consumer, grid, payload, watchdog,
  failure-policy), `internal/app/telemetrytransport`,
  `internal/server`, `cmd/vantare` afectados.
- `internal/telemetry` (wiring guard) verde sin excepciones nuevas.
- `go test ./...` si el corte focal queda verde; `go vet ./...`
  distinguiendo los 3 `unsafe.Pointer` heredados fuera del diff.
- Frontera por simbolo: cero `runtime.hub`, `) Hub()`,
  `Product: telemetrytransport.ProductOverlay`, `overlayprojection`,
  `ProjectionsPublished` salvo historicos (`docs/`, tipos R7,
  `metricStore` generico si aplica); `ProductOverlay` conservado solo en
  `telemetrytransport`, tests de transporte, harness 404 y contratos R7.
- `gofmt` en Go modificado y `git diff --check`.
- Frontend no se repite (no se toca).

## Cierre (fuera de este corte)

No se actualizan evidencia/handoff/roadmap de cierre ni se hace commit en
este corte: solo microplan + codigo/test. El informe final lista archivos,
RED exacto, diffstat, gates y riesgos.
