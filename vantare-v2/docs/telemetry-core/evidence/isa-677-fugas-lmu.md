# ISA-677 Tanda 3 — ISA-709: fugas LMU 1-8, inversión 9d y frame congelado

Fecha: 2026-08-21. Rama `vantareapp/isa-709-fugas-lmu-y-frame-congelado`, base `origin/nightly@217ba746`.
Tracker: GitHub #709.

## 1. Tabla de fugas 1-8 (§1.3 de 04-multisim-model)

| # | Ubicación | Fuga | Estado pre-T1 | Cerrada en |
|---|---|---|---|---|
| 1 | `internal/telemetry/schema/spatial/types.go:14` | Comentario `The canonical LMU driver uses +X left...` define frame por referencia a LMU | viva | T1: `Canonical axes are +X left... (right-handed orthonormal frame)` |
| 2 | `internal/telemetry/catalog/catalog.go:102` | Notes `LMU axes are +X left...` para `spatial.local_velocity` | viva | T1: `axes are +X left, +Y up and +Z rearward` |
| 3 | `internal/telemetry/schema/pit/types.go:6` | `InPit is the observed LMU VehicleScoring boolean` | viva | T1: `InPit is the observed boolean indicating whether vehicle is in pit area` |
| 4 | `internal/telemetry/catalog/catalog.go:68` | `standings.position` Notes `demonstrated LMU vehicle bound` | viva | T1: `canonical vehicle bound (1..104)` |
| 5 | `internal/telemetry/catalog/catalog.go:79` | `session.vehicle_count` Notes `demonstrated LMU vehicle-count bound` | viva | T1: `Canonical vehicle-count bound (0..104)` |
| 6 | `internal/telemetry/core/session_coordinator.go:28` | `MaxSessionVehicleHistory =104` comenta `LMU scoring-slot budget` | viva | T1: `canonical vehicle history budget (104)` |
| 7 | `internal/telemetry/schema/vehicle/types.go:6` | `LMU gear semantics remain deferred` | viva | T1: `Neutral is zero; forward and reverse semantics are source-agnostic` |
| 8 | `internal/telemetry/schema/weather/types.go:4` | `Temperature has no physical-unit alias until LMU source contract is demonstrated` + `UnitUnknown` | viva (comentario) | T1: `Temperature is a canonical physical temperature value (Celsius per catalog)` — Unit permanece `Unknown` por contrato estable, solo se neutraliza el comentario (wire intacto) |

Todas vivas al inicio de la tanda; F10 había cerrado 9/9b/9c y fusión/capability pero dejó 1-8 y 9d abiertas (ver `isa-372-f10-multisim.md §5.4-5`). Goldens y replay parity verdes tras `go run ./tools/telemetry-contract-gen` no necesario (no hay cambio de tipos), pero sí se regeneró `docs/telemetry-core/signal-catalog.md` por cambio de Notes (T1).

## 2. Inversión 9d — `engineer/lmu.ExtendedReader`

Antes: `internal/engineer/engine/monitor.go:111` y `internal/engineer/penalties/monitor.go:68` tenían `*lmu.ExtendedReader` (concreto). `internal/engineer/lmu/extended_decoder.go` era un decoder puro de fixture pero el consumidor dependía del concreto.

Después:
- `internal/engineer/lmu/extended_decoder.go` define `type ExtendedSource interface { Read() (ExtendedData, error) }` y `var _ ExtendedSource = (*ExtendedReader)(nil)`.
- `engine/monitor.go` y `penalties/monitor.go` cambian el campo a `lmu.ExtendedSource` y el setter a `SetExtendedReader(lmu.ExtendedSource)` (+ alias `SetExtendedSource`). No hay cambio de comportamiento; `*ExtendedReader` sigue satisfaciendo la interfaz y los tests de fixture pasan sin modificar.
- Engineer no crea LMU: la implementación se registra en el composition root (app) vía `SetExtendedSource`; los monitores solo conocen la interfaz. `go vet`/`go test ./internal/engineer/...` verdes. `internal/telemetry/architecture_test.go` ya prohibe que `internal/telemetry` importe `internal/engineer`; Engineer no importa `internal/telemetry/drivers/lmu` (verificado con `grep`).

## 3. Frame congelado — transición sesión→menú (ErrStaleSessionRemnant)

Contexto: `internal/telemetry/drivers/lmu/capture.go:27` define `ErrStaleSessionRemnant` — LMU 1.4.1.3 deja el último frame con `player=true` y `source_time` congelado minutos tras salir al menú, mientras REST ya está vacío (`lmu-1413-compat.md §5`). `confirmCaptureLiveness` lo rechaza en la ruta de captura diagnóstica, pero el driver vivo lo servía como `stale` con contenido.

Semántica deseada: el pipeline no debe seguir sirviendo el último frame vivo como fresco. La fase/status debe quedar `stale`/menú para que los overlays se apaguen como con la SM limpia (vehículos vacíos / status stale).

Reproducción:
- Fixtures pinneadas `testdata/lmu-1.4.1.3-track-fixture.bin` (track, player=true) y `testdata/lmu-1.4.1.3-menu-fixture.bin` (menu, player=false, vehicles=0) + `rest-menu-fixture.json` vacío.
- Test `TestFrozenRemnantIsNotPublishedAsFresh` en `internal/telemetry/drivers/lmu/frozen_remnant_test.go` usa `knownBuffer` (track) congelado con `elapsed` avanzando 3s sin mover `source_time`. Antes del fix publicaba `player=true, freshness=stale` (rojo documentado: `frame congelado publicado como player=true (stale=2)`). Después del fix el segundo frame no se publica (o llegaría como menu), el test pasa.

Fix (sin tocar `internal/app/telemetry_core_runtime.go` — propiedad de ISA-707):
- `internal/telemetry/drivers/lmu/driver.go:acquire` añade supresión tras `gate.observe`: si `gate.stale && elapsed-gate.unchangedSince >= gate.limit*2` (1s) y `player==true` y `restStatus != live/partial`, marca `StateStale` y retorna sin `sink.WriteObservation`. Así el `Reducer` conserva el último batch fresco solo 500ms como stale y luego deja de recibir frames; el `watchdog` del runtime pasa a `stale` y los overlays se apagan igual que con un menu limpio. En pausa (`REST live`) no se suprime — se sigue publicando stale para no ocultar telemetría en pista.

No se toca `telemetry_core_runtime.go`. La alternativa que exigiría tocarlo (marcar `ObservedState` como menú sintético en el runtime) queda como diff propuesto en el PR.

## 4. Archivos y commits

Commits en rama `vantareapp/isa-709-fugas-lmu-y-frame-congelado`:

1. `3afadf3c fix(telemetry): neutraliza fugas LMU 1-8 en schema/catalog/core` — 7 ficheros, Notes neutralizadas, `signal-catalog.md` regenerado.
2. `d0d9a671 refactor(engineer): invierte 9d ExtendedReader a interfaz lmu.ExtendedSource` — 3 ficheros.
3. `8660d1e9 fix(lmu): suprime frame congelado post-sesion para evitar overlay vivo (ISA-709 T3)` — `driver.go` + `frozen_remnant_test.go` (rojo→verde documentado).
4. T4 (este): evidencia, fragmento changelog `ISA-709.json`, `docs/current-plan.md`.

## 5. Gates

Por commit: `go build ./...` (ignora `frontend/embed.go` sin `dist`), `go vet ./internal/telemetry/... ./internal/engineer/...` (solo dos `unsafe.Pointer` heredados en `drivers/lmu`), `go test ./internal/telemetry/... ./internal/engineer/... -count=1` verde, `git diff --check` limpio. `go run ./tools/telemetry-contract-gen -check` no aplica (no cambia wire); catalog golden actualizado. Goldens v1/v2 y replay parity intactos (no se toca `projection/overlayv2` ni `frontend`).

## 6. Verificación manual

- `go test ./internal/telemetry/drivers/lmu -run TestFrozenRemnant -count=1 -v` → PASS.
- `go test ./internal/telemetry/catalog -count=1` → golden PASS.
- Inspeccionar `internal/engineer/engine/monitor.go:111` y `penalties/monitor.go:68` — tipo `lmu.ExtendedSource`.
- Comparar `testdata/lmu-1.4.1.3-track-fixture.bin` vs `lmu-1.4.1.3-menu-fixture.bin` y `go test -run TestDiagnosticCapture` para remanente vs menu.
