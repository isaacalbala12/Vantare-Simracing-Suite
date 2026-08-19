# Evidencia ISA-372/F4 — guard de wiring y retirada de código desconectado

Fecha: 2026-08-19. Base: `isa-373@3e9c77ed285388db0cceed843e600c1d742e31e8`.
Rama: `vantareapp/isa-372-tc-f4-guard-wiring-y-borrado`. Estado: pendiente de
promoción; sin push, PR, merge ni release.

## Símbolos retirados y cero llamadores

Líneas en la base F0:

- `internal/telemetry/core/fanout.go:131` — `NewFanout` y toda su superficie
  asociada (`Fanout`, configuración, métricas, suscripciones y errores). La
  búsqueda productiva de `NewFanout|core.Fanout` quedó vacía.
- `internal/app/telemetrytransport/transport.go:203` — `NewEngineerFull`.
- `internal/app/telemetrytransport/transport.go:219` — `NewAnalysisFull`.
- `internal/app/telemetrytransport/transport.go:277` — `NewEngineerFact`.
- `internal/app/telemetrytransport/adapters.go:59` — `ServeWailsFacts`.
- `internal/app/telemetrytransport/adapters.go:141` — `SSEFactsHandler`.
- `internal/app/telemetrytransport/merge_patch.go:11` — `ApplyMergePatch`.
- `internal/app/telemetrytransport/merge_patch_build.go:18` —
  `BuildMergePatch`.
- `frontend/src/telemetry-transport/merge-patch.ts:3` — `applyMergePatch`.
- `frontend/src/overlay/core/telemetry-store.ts:19` —
  `createTelemetryStore`; no tenía importadores productivos exactos.
- `internal/app/telemetrytransport/transport.go:752,765,774` —
  `envelopeSeal`, `statusSeal` y `factSeal`, junto con sus helpers SHA-256.

Antes de cada retirada se buscó el símbolo en archivos productivos excluyendo
`*_test.go`/`*.test.ts`. Tras F4.6, una búsqueda conjunta de
`NewAnalysisFull|NewEngineerFull|NewEngineerFact|ServeWailsFacts|SSEFactsHandler`
no devuelve declaración ni llamador. RFC 7396 y seal tampoco conservan
referencias. Los goldens de proyección no cambiaron.

`ProductAnalysis` se conserva porque el contrato frontend compartido todavía
enumera `analysis`; la condición “si nadie más lo usa” no se cumple. No existe
constructor ni Hub Analysis live.

## Contrato rescatado

`FactResyncRequiredError` y el ring acotado de facts viven en
`internal/telemetry/projection/engineer/fact_resync.go`. La regresión
`TestFactResyncRequiredErrorPortedToEngineerPort` prueba el error tipado y la
ventana retenida. El mismo archivo documenta el patrón de snapshot cap-1 con
drop-oldest que F7 conectará.

## Allow-list del guard

Todas las excepciones llevan fecha y motivo en
`internal/telemetry/wiring_guard_test.go`:

- `internal/telemetry/recording` y `recording/sqlite`: write path acotado,
  desconectado hasta F12; incluye `recording.NewCoordinator`.
- `internal/telemetry/recording/replay/**`: harness-only protegido además por
  el guard de arquitectura existente.
- `internal/telemetry/diagnostics/**` y
  `internal/telemetry/drivers/lmu.NewCaptureTap`: CaptureTap reservado a F12.b.
- `projection/engineer.ErrFactResyncRequired` y
  `projection/engineer.FactResyncRequiredError`: puerto rescatado para F7.
- Métodos `Error` y `Unwrap`: llamadas implícitas mediante interfaces estándar
  de errores.
- Cualquier declaración con comentario `// Deprecated:`: contrato conservado
  explícitamente, incluido Analysis para F12.b y los nombres de ruta/evento de
  facts reservados a F7.
- Baseline exacta anterior a F4, fuera del borrado autorizado: `catalog.ByID`,
  `catalog.LedgerActionUnknown`, `catalog.Markdown`; `core.Derivation`,
  `core.EndSession`, `core.ErrBackpressure`, `core.RecordingSink`,
  `core.SetConnected`, `core.SetPreferred`; `derive.Availability`,
  `derive.Registry`, `derive.ValidateDefinitions`; helpers de captura LMU
  enumerados en `wiringGuardExistingContractBaseline`; puertos de proyección;
  capabilities Engineer; y tipos/sentinels schema enumerados en ese mismo
  mapa. La lista es por símbolo, no por wildcard, para que un export nuevo
  huérfano siga fallando.

## Benchmark Hub antes/después

Comando en ambos casos:

```powershell
go test ./internal/app/telemetrytransport -run '^$' -bench HubPublishSnapshot -benchmem -count=3
```

| Estado | ns/op (3 repeticiones) | B/op | allocs/op |
|---|---|---|---|
| Antes del retiro del seal | 43.837 · 44.718 · 45.865 | 12.631–12.633 | 357 |
| Después del retiro | 37.664 · 38.502 · 44.901 | 12.132–12.133 | 325 |

Medianas: `44.718 → 38.502 ns/op` (−13,9 %), `12.632 → 12.132 B/op`
(−500 B/op) y `357 → 325 allocs/op` (−32).

## Gates y límites conocidos

- Guard activo: PASS.
- Paquetes aplicables de `go build`: PASS. `go build ./...` conserva el fallo
  preexistente `build/ios`: `function main is undeclared in the main package`.
- `go vet ./internal/telemetry/... ./internal/app/...`: solo los tres avisos
  heredados `unsafe.Pointer` en `reader_windows.go`, `version_windows.go` e
  `icon_windows.go`.
- `go test` de Telemetry y app, excluyendo únicamente
  `internal/app/launcher`: PASS. Launcher se excluye por el panic preexistente
  de `TestDiscoverIconsSmoke` indicado en el briefing.
- Frontend completo tras F4.6: 387 archivos PASS, 1 skipped; 2.859 tests PASS,
  2 skipped. Los `AbortError` de teardown happy-dom aparecen después con exit
  0 y son heredados.
- Build frontend, lint focal y `git diff --check`: PASS.

Pendiente con F1: simplificar `PublishSnapshot(full, delta)` a
`PublishSnapshot(full)` y retirar el campo de compatibilidad
`HubMetrics.DeltasRetained`, siempre cero, cuando F1 libere sus llamadores.
