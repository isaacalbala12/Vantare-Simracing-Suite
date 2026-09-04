# ISA-894 · R7b/A1: evidencia de paridad de controles (retirada V1 frontend)

Fecha: 2026-09-04. Microcorte A1 (controles), rama única
`vantareapp/isa-894-retirada-v1-r7b`, writer único, sin subagentes.
Alcance único A1: `derive.ControlSample` + proyección `ControlsHistoryV2` +
contrato generado + decoder frontend de controles. No A2 (fuel), no A3
(delta), no B–F, no legacy salvo el decoder de controles y su frontera V2
estrictamente necesaria. Sin apps/LMU/navegadores, sin `.env*`, sin
push/PR/merge/promoción/release. Sin dependencias nuevas, sin rediseño.

## Gate duro de payload (frame sintético completo @104)

Límite efectivo: `DefaultPublisherMaxPayloadBytes = 64 * 1024 = 65536`
(`internal/app/telemetrytransport/publisher.go`). El `MaxPayloadBytes =
256 * 1024` del Hub es solo invariante secundaria.

| Medida | Antes | Después | Delta |
|---|---|---|---|
| `TestFrameV2SyntheticFullUnder64KiBWith104Vehicles` (frame sintético completo @104) | 53982 bytes | 63613 bytes | +9631 bytes |
| Margen bajo 65536 | 11554 bytes | 1923 bytes | — |
| Veredicto | PASS | PASS | gate cumplido |
| Sección controles @120 (`TestBuildControlsAtTheCanonicalMaximumStaysUnderTwelveKiB`) | 1515 bytes | 11146 bytes | +9631 bytes |
| Golden `overlay_v2_104.golden.json` (fixture de 2 muestras, no el gate) | 87865 bytes | 88440 bytes | +575 bytes |

El coste nuevo es visible y acotado: un instante absoluto por muestra más
tres celdas con calidad por muestra, siempre alineadas. No hay sentinel, no
hay acortado de arrays, no hay edad relativa, no hay `Date.now`, no hay
rebase a `frame.GeneratedAt`. `SpeedMPS` viaja en m/s; km/h solo en
presentación del decoder.

## TDD — RED literal

### A. RED derive (antes de producción)

Comando:

```text
go test ./internal/telemetry/derive/ -count=1 -run "TestControlSample"
```

Resultado literal (extracto):

```text
FAIL  github.com/vantare/overlays/v2/internal/telemetry/derive [build failed]
internal\telemetry\derive\controls_history_test.go:46:28: sample.SpeedMPS undefined (type ControlSample has no field or method SpeedMPS)
internal\telemetry\derive\controls_history_test.go:55:28: sample.EngineRPM undefined (type ControlSample has no field or method EngineRPM)
internal\telemetry\derive\controls_history_test.go:61:28: sample.Gear undefined (type ControlSample has no field or method Gear)
```

Los tests exigen fuente/procedencia (`SpeedMPS`/`EngineRPM`/`Gear` del
`VehicleState` canónico como `schema.Field` con calidad y procedencia
preservadas), `CapturedAt` real monótono, calidad degradada por muestra sin
bloquear el sample de pedales frescos, y tope 120 + reset vigente
epoch+`SameSession` + alineación total.

### C. RED projection/frame/builder (antes de producción)

Comando:

```text
go test ./internal/telemetry/projection/overlayv2/ -count=1 -run "TestBuildControlsProjectsAbsoluteMotionHistory"
```

Resultado literal (extracto):

```text
FAIL  github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2 [build failed]
internal\telemetry\projection\overlayv2\controls_history_a1_test.go:34:11: view.CapturedAtMS undefined (type ControlsHistoryV2 has no field or method CapturedAtMS)
internal\telemetry\projection\overlayv2\controls_history_a1_test.go:40:10: view.SpeedMPS undefined (type ControlsHistoryV2 has no field or method SpeedMPS)
```

Los tests exigen `CapturedAtMS[i]` = epoch ms de `sample.CapturedAt`,
alineación total de las 7 arrays, `QValue` con missing/stale/invalid/fresh
(omite `V` en missing), presencia de `capturedAtMS` y ausencia de `windowMs`
en el wire.

### E. RED decoder frontend (antes de producción)

Comando (desde `frontend/`):

```text
pnpm vitest run src/overlay/widget-types/input-telemetry/input-telemetry-history-absolute.test.ts
```

Resultado literal:

```text
Test Files  1 failed (1)
Tests  5 failed (5)
AssertionError: expected [ 915148800000, 915148800000 ] to deeply equal [ 1786711200000, 1786711201000 ]
```

El decoder antiguo reconstruía instantes desde `frame.generatedAt`
(1999-01-01 en el fixture → 915148800000); los tests exigen `capturedAtMS`
verbatim, motion por muestra con km/h solo presentación, `undefined` ante
missing/invalid sin acortar la serie, y trim por ventana contra el instante
de muestra más nuevo (sin `Date.now`, sin autoridad browser).

## TDD — GREEN (comandos y resultados)

```text
go test ./internal/telemetry/derive/ -count=1
ok    github.com/vantare/overlays/v2/internal/telemetry/derive  0.059s

go test ./internal/telemetry/... -count=1        (sin FAIL en todo telemetry)

go test ./internal/telemetry/projection/overlayv2/ -count=1 -v -run "TestBuildControls|TestFrameV2SyntheticFull"
--- PASS: TestBuildControlsPublishesTheCanonicalSeriesQuantized
--- PASS: TestBuildControlsSinglePointKeepsItsRealInstant
--- PASS: TestBuildControlsQuantizesToThreeDecimalsAndClamps
--- PASS: TestBuildControlsWithoutACanonicalHistoryInventsNothing
--- PASS: TestBuildControlsKeepsAStaleSeriesMarkedStale
--- PASS: TestBuildControlsProjectsAbsoluteMotionHistory
--- PASS: TestBuildControlsKeepsPerSampleMotionQuality
--- PASS: TestBuildControlsAtTheCanonicalMaximumStaysUnderTwelveKiB   (controls section with 120 samples: 11146 bytes)
--- PASS: TestBuildControlsAtTheCanonicalMaximumStaysAligned
--- PASS: TestFrameV2SyntheticFullUnder64KiBWith104Vehicles            (synthetic full FrameV2 with 104 vehicles: 63613 bytes)
ok    github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2  0.025s
```

`gofmt -l` limpio en los paquetes tocados; `go vet` limpio en
`derive` y `overlayv2`.

## Contrato (tasks oficiales; `task` CLI ausente → equivalente `go run`, literal)

Taskfile define `telemetry:contract` = `go run ./tools/telemetry-contract-gen`
y `telemetry:contract:check` = `go run ./tools/telemetry-contract-gen -check`
+ `git diff --exit-code -- frontend/src/generated/`. El binario `task` no
existe en este worktree, así que se ejecutó el comando real equivalente:

```text
go run ./tools/telemetry-contract-gen
go run ./tools/telemetry-contract-gen -check        (exit 0)
git diff --exit-code -- frontend/src/generated/     (exit 0)
```

Diff generado (único, aditivo salvo el recambio especificado
`windowMs` → `capturedAtMS` + motion):

```text
 export interface OverlayControlsHistoryV2 {
   readonly brake?: readonly number[] | undefined;
+  readonly capturedAtMS?: readonly number[] | undefined;
   readonly clutch?: readonly number[] | undefined;
+  readonly gear?: readonly OverlayQValue<number>[] | undefined;
   readonly q: OverlayQualityV2;
+  readonly rpm?: readonly OverlayQValue<number>[] | undefined;
+  readonly speedMPS?: readonly OverlayQValue<number>[] | undefined;
   readonly throttle?: readonly number[] | undefined;
-  readonly windowMs?: number | undefined;
 }
```

Goldens V2 regenerados por el mecanismo oficial (`UPDATE_GOLDEN=1` sobre
`TestProjectV2Goldens`): `overlay_v2_{1,20,44,104}.golden.json`.
Golden derive `controls_history_v1.golden.json` actualizado fielmente al
nuevo shape (mismas muestras, campos nuevos vacíos porque ese fixture no
mueve motion).

## Decoder frontend — GREEN

```text
pnpm vitest run src/overlay/widget-types/input-telemetry/
Test Files  5 passed (5) / Tests  18 passed (18)

pnpm vitest run src/telemetry-transport/
Test Files  11 passed (11) / Tests  62 passed (62)   (incluye presupuesto de parseo p99)

pnpm vitest run src/overlay/core/WidgetVisualHost.v2.test.tsx src/overlay/telemetry-shadow/
Test Files  11 passed (11) / Tests  114 passed (114) (oráculo comparator/sanitizer intacto)
```

`decodeControlsHistory(history, historySeconds)` usa `capturedAtMS`
directamente; el trim mide contra la muestra más nueva; motion missing/
invalid → `undefined`; `speedKph = m/s × 3.6` solo presentación. La frontera
fail-closed `overlay-frame-v2-store.ts` valida las 7 arrays (longitud ≤ 120,
alineadas, `QValue` numéricos con `missing ⇒ sin v`). Fixtures V2 migrados
(`WidgetVisualHost.v2.test.tsx`, perf @104). El comparador/shadow no se toca
(sobrevive hasta E4).

## Typecheck (línea base real tras `pnpm install --frozen-lockfile`)

Línea base (HEAD `f2872888`, tras install): 8 errores en 3 módulos legacy:

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

Final A1: los mismos 8 errores byte-idénticos, cero nuevos, cero de
controles. Son deuda heredada de R7a (retiro de `ProductOverlay` del union
`ProductID`) en archivos del ámbito B (proyección/transporte/harness V1),
fuera del alcance A1 (`no toques legacy salvo el decoder de controles`).
No se declara typecheck global verde. No se tocó fuel/delta.

## Archivos (A1, sin `git add .`, rutas explícitas)

- `internal/telemetry/derive/pipeline.go` — `ControlSample` +3 `schema.Field`, copia desde el `VehicleState` activo.
- `internal/telemetry/derive/controls_history_test.go` — RED triple + alineación (nuevo).
- `internal/telemetry/derive/testdata/controls_history_v1.golden.json` — golden fiel al shape.
- `internal/telemetry/projection/overlayv2/frame.go` — `ControlsHistoryV2` exacto (8 miembros, sin `WindowMS`).
- `internal/telemetry/projection/overlayv2/builder_controls.go` — proyección con calidad por muestra.
- `internal/telemetry/projection/overlayv2/controls_history_a1_test.go` — RED focal (nuevo).
- `internal/telemetry/projection/overlayv2/builder_controls_test.go` — migrado a `CapturedAtMS` (misma fuerza).
- `internal/telemetry/projection/overlayv2/frame_test.go` — sintético @104 al peor caso A1.
- `internal/telemetry/projection/overlayv2/testdata/overlay_v2_*.golden.json` — regenerados vía `UPDATE_GOLDEN=1`.
- `frontend/src/generated/telemetry.ts` — solo vía task oficial.
- `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-view-model-v2.ts` — decoder absoluto.
- `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-history-absolute.test.ts` — RED focal (nuevo).
- `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-domain-free.test.ts` — migrado al contrato.
- `frontend/src/telemetry-transport/overlay-frame-v2-store.ts` — validador de las 7 arrays.
- `frontend/src/overlay/core/WidgetVisualHost.v2.test.tsx`, `frontend/src/telemetry-transport/overlay-frame-v2-performance.test.ts` — fixtures al contrato.
- Esta evidencia.

No se afirma runtime LMU/Wails: todo lo anterior son tests y gates
sintéticos/deterministas. La prueba física queda pendiente de Isaac.
