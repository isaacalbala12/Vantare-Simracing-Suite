# Evidencia checkpoint — ISA-894 R7a: retirada de tipos y contratos Go de Overlay V1

Fecha: 2026-09-04. Rama `vantareapp/isa-894-retirada-v1-r7a`, base exacta
`edc682e1`. Writer único, sin subagentes. Sin commit, push, PR, merge,
promoción ni release. Sin apps, LMU, navegadores ni `.env*`.

**Decisión aprobada C: checkpoint local.** Este corte queda como estado local
sin commit para revisión del orquestador; **sólo el combinado R7a+R7b se
publica** (el typecheck queda en rojo en 3 módulos legacy reservados a R7b,
ver §5). Nada de este documento declara entrega, PR ni CI.

## 1. TDD — RED literal antes de editar código productivo

Guard nuevo `internal/app/overlay_v1_retirement_test.go`
(`TestOverlayV1ContractsRetired`), ejecutado contra HEAD intacto:

```text
=== RUN   TestOverlayV1ContractsRetired
    overlay_v1_retirement_test.go:27: retired Go file still present: internal/telemetry/projection/overlay/v1.go
    overlay_v1_retirement_test.go:34: retired Go package still present: internal/telemetry/projection/overlay (testdata, v1.go)
    overlay_v1_retirement_test.go:45: retired ProductOverlay still present in internal/app/telemetrytransport/transport.go
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "projection/overlay\""
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.Capability"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.GroundPositionV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.SnapshotV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.PayloadV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.VehicleV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.ControlHistoryV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "overlay.DeltaHistoryV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayCapability"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayGroundPositionV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlaySnapshotV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayPayloadV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayVehicleV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayControlHistoryV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayControlSampleV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayDeltaHistoryV1"
    overlay_v1_retirement_test.go:77: retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: "OverlayDeltaSampleV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayCapability"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayGroundPositionV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlaySnapshotV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayPayloadV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayVehicleV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayControlHistoryV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayControlSampleV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayDeltaHistoryV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: "OverlayDeltaSampleV1"
    overlay_v1_retirement_test.go:103: retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: `"overlay"`
--- FAIL: TestOverlayV1ContractsRetired (0.00s)
FAIL	github.com/vantare/overlays/v2/internal/app	0.053s
```

Tras el cambio mínimo: `--- PASS: TestOverlayV1ContractsRetired (0.00s)`.
El guard enmascara `ProductOverlayV2` / `overlayv2` /
`OverlayCapabilityModesV2` para no confundir lo vivo con lo retirado, y
permite `testdata/` huérfano hasta R7b (sólo exige ausencia de `.go`
ejecutable, tipos generados y raíces de contract-gen).

## 2. Diff — retirado y preservado

Retirado del binario y del contrato:

- `telemetrytransport.ProductOverlay` y su aceptación por `knownProduct`.
- `internal/telemetry/projection/overlay/v1.go` (único `.go` del paquete).
- Raíces Overlay V1 de `tools/telemetry-contract-gen` (import, enum
  `OverlayCapability`, 8 structs V1, miembro del enum `ProductID`).
- Wire generado `frontend/src/generated/telemetry.ts` regenerado sólo con
  `task telemetry:contract` (`go run ./tools/telemetry-contract-gen`):
  fuera `OverlayCapability`, 8 interfaces `Overlay*V1` y `"overlay"` de
  `ProductID` (queda `"analysis" | "engineer" | "strategy"`).
- Fixtures y pruebas con único propósito V1: `transport_contract_v1.json`
  (3 productos), casos V1 de `telemetry.generated.test.ts`, brazos V1 de
  bench `researchbench`, `TestOverlayPullExcludesOtherProduct…` eliminado
  por vacuo (el Hub Strategy nunca se conecta al registry V2).
- Corrección de frontera del orquestador: los JSON de
  `internal/telemetry/projection/overlay/testdata/` se **restauran
  idénticos desde HEAD** (sin diff) como fixtures huérfanos temporales
  hasta R7b: los tests/harnesses frontend legacy los siguen importando.

Preservado sin cambios de semántica: `ProductOverlayV2`, `overlayv2/**`,
Hub genérico (probado sobre Strategy), V1 de Strategy/Engineer/Analysis,
`/overlay.html`, docs históricas, `results/` de bench, frontend legacy
productivo/adapters/shadow/harnesses (R7b).

Migraciones de tests: Hub genérico → Strategy; negativas → Engineer;
rutas/eventos retirados → literales históricos (`/telemetry/overlay/
projection`, `telemetry:overlay:status[:get]`); bench Hub → Strategy +
`NewStrategyFull`, casos puramente comparativos pierden sólo el brazo V1;
`BuildCompactFrame` documentado como prototipo compacto histórico, no V2
productivo ni base de auditoría. `BenchmarkMergePatchApply` eliminado:
invocaba `telemetrytransport.ApplyMergePatch`, inexistente en HEAD
(rotura preexistente); la vía delta sigue fallando cerrada con
`ErrDeltaUnsupported`, vivo.

## 3. Gates verdes

- `go test ./tools/telemetry-contract-gen/ ./internal/app/
  telemetrytransport/ ./internal/server/ ./internal/app/
  ./internal/telemetry/ -count=1` → ok (5 paquetes).
- `go test ./internal/... ./tools/... -count=1` → ok completo.
- `go test -tags researchbench -run TestNothingMatchesThis ./docs/
  research/telemetry-architecture-2026/bench/` → compila, nada ejecutado
  (`results/` intacto); `go vet -tags researchbench` → limpio.
- `go run ./tools/telemetry-contract-gen -check` → exit 0.
- `pnpm --dir frontend test -- telemetry.generated.test.ts` → 7/7;
  `contracts.test.ts` + generado → 18/18; suite frontend completa
  3425/3425.
- `go vet` en alcance: sólo `unsafe.Pointer` heredados fuera del diff.
- `gofmt` limpio en archivos tocados; `git diff --check` limpio.
- `roadmap_digest --check` → "sin cambios" (plan.md no tocado).

## 4. Gates bloqueados / no ejecutados (causa + motivo)

- `pnpm typecheck` / `pnpm build`: §5 (frontera R7b).
- `go test ./...` y `./cmd/vantare`: setup `frontend/embed.go` exige
  `frontend/dist`, inexistente en este worktree fresco y sólo generable
  vía build (bloqueado por §5). Resto de `./cmd/...` ok.
- No se ejecutan benches `researchbench` (reescribirían `results/`).

## 5. Los 8 errores exactos de typecheck (sólo R7b, ni más ni menos)

```text
src/overlay/projection/overlay-projection-v1.ts(172,7): error TS2367: This comparison appears to be unintentional because the types 'ProductID' and '"overlay"' have no overlap.
src/overlay/transports/projection-observer.ts(72,48): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/overlay/transports/projection-observer.ts(207,57): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/overlay/transports/projection-observer.ts(209,34): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/telemetry-cutover-runtime-harness/main.ts(40,25): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/telemetry-cutover-runtime-harness/main.ts(41,25): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/telemetry-cutover-runtime-harness/main.ts(53,26): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
src/telemetry-cutover-runtime-harness/main.ts(54,26): error TS2345: Argument of type '"overlay"' is not assignable to parameter of type 'ProductID'.
```

Causa: el `ProductID` generado estrechado rompe la compilación del legacy
que R7b debe borrar. Ningún archivo fuera de esos tres falla. Tocarlos es
stop condition de R7a: se dejan intactos.

## 6. Riesgos restantes

- `cmd/vantare` (harness con literales históricos) compila por inspección
  (swaps literales del mismo tipo) pero no ejecuta hasta tener `dist`.
- `TELEMETRY_PRODUCTS` del mirror TS aún lista `"overlay"` para el runtime
  legacy; R7b debe estrecharlo al borrar el legacy.
- `TestValidateImport` conserva casos sobre `projection/overlayv2`
  (paquete vivo); la tabla ya no nombra el paquete borrado.
