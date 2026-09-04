# ISA-894 · R7b/A3 — ejecución Delta V2 (contrato + límites + decoder)

Fecha: 2026-09-04.
Rama: `vantareapp/isa-894-retirada-v1-r7b`.
Base: `60a78e55` (árbol limpio verificado). Sin push/PR/merge/promoción/release.
Sin apps/LMU/navegador, sin `.env*`, sin dependencias nuevas, sin `vantare-core`.
`apply_patch` no es invocable desde este shell (el `.bat` mutila el argumento
multilínea); los cambios se hicieron con las herramientas dedicadas de edición
(`edit`/`write`), sin redirecciones de shell ni Python para escribir archivos.
`task` CLI ausente: el contrato TS se regeneró con el comando exacto
equivalente del Taskfile (`go run ./tools/telemetry-contract-gen`).

Decisión aprobada por Isaac (ya reflejada en microplan, evidencia de
preflight y handoff): 64 KiB = objetivo de rendimiento representativo;
72 KiB (`73728 B`) = límite duro de seguridad sincronizado entre Publisher
Go de overlay-v2 y validador frontend; transporte general = 256 KiB sin
ampliar. El escenario legal de seguridad (strings 32 + float adverso + A3)
cabe bajo 72 KiB; no se afirma que toda string no acotada quepa.

## Inventario (reutilizado del preflight, sin cambios)

- Autoridad: `derive.SelfDelta.History []DeltaSample`, tope
  `MaxSelfDeltaHistory = 120`. Derive no se reescribió.
- Cero consumidores wire de `DeltaSample.SourceTime`/`LapDistance`; los
  homónimos son filas relative/standings u otros dominios. No se transportan.
- `Trend` Go queda vacío; delta-trace calcula el concepto de presentación.
- El singleton/`Date.now` de `delta-trace-view-model-v2.ts` se eliminó solo
  después del verde V2 (este mismo corte, decoder reescrito sin estado).

## TDD RED → GREEN literal

- RED Go publisher (`publisher_overlayv2_limit_test.go` nuevo):
  `FAIL [build failed]` — `undefined: OverlayV2MaxPayloadBytes` (4 errores).
- GREEN Go publisher: `OverlayV2MaxPayloadBytes = 72 * 1024` específico de
  producto + `defaultPublisherMaxPayloadBytes(product)` usado en `newPublisher`
  y `Registry.PublishStatus`. Futuros productos conservan 64 KiB por defecto;
  el techo genérico `MaxPayloadBytes = 256 * 1024` intacto (test dedicado).
- RED frontend límite (`overlay-v2-payload-limit.test.ts` nuevo): 2 failed —
  `expected undefined to be 73728`.
- GREEN frontend límite: `OVERLAY_V2_MAX_PAYLOAD_BYTES = 72 * 1024` exportado
  en `overlay-frame-v2-store.ts` y usado en `cloneJSONInput` (cero literales).
- RED Go delta (`delta_history_a3_test.go` nuevo + gates en `frame_test.go`):
  `FAIL [build failed]` — `undefined: DeltaHistoryV2`,
  `view.History undefined`.
- GREEN Go delta: `DeltaHistoryV2 { Q; CapturedAtMS []int64; Seconds []float64 }`
  en `frame.go`; `BuildDelta` publica `History` siempre (incluso sin delta
  efectivo) con Q derivada de freshness, copia con ownership y tope 120 por
  cola; `frame_test.go` corregido a 104/17/17 + `bestLap` fresh + sin
  `CarNumber` (fiel a `BuildStandings`, que nunca lo puebla) + asserts de
  topes y clones independientes + gates 20ch/64KiB y 32ch+adverso/72KiB.
  Un fix de test propio (1 ulp float64 en la aserción de cola).
- Goldens `overlay_v2_{1,20,44,104}` regenerados vía `UPDATE_GOLDEN=1`
  (mecanismo oficial): diff exacto y mínimo, solo `+"history":{"q":...}`.
- Contrato TS solo vía generador oficial: `Overlayv2DeltaHistoryV2` +
  `history` requerida en `OverlayDeltaViewV2`; `-check` verde.
- RED decoder (`delta-trace-history-a3.test.ts` nuevo): 3 failed — el decoder
  ignoraba la historia (puntos desde `generatedAt`, trend `unknown`,
  acumulación entre llamadas).
- GREEN decoder: `delta-trace-view-model-v2.ts` reescrito sin estado,
  sin `Date.now`, sin edades relativas; decodifica instantes absolutos +
  segundos, recorta por `windowSeconds` contra el instante más nuevo del
  wire, descarta series desalineadas/no-finitas a `[]`; test antiguo
  reescrito sin singleton.
- Validador del store: `delta()` acepta y valida `history` (alineada,
  tope 120, instantes enteros seguros, segundos finitos).

## Revisión spec P0 — hard clamp explícito (2026-09-04)

Hallazgo bloqueante: `newPublisher` y `Registry.PublishStatus` solo
comparaban el override explícito contra `MaxPayloadBytes` (256 KiB), así que
`PublisherConfig{ProductOverlayV2, MaxPayloadBytes: 100*1024}` resolvía 100
KiB en Go mientras el frontend rechaza >72 KiB. Contrato aprobado: hard cap
sincronizado, no solo default.

- RED: `TestOverlayV2ExplicitOverrideAbove72KiBIsClamped` y
  `TestOverlayV2RegistryStatusRespects72KiBHardCapWithOverride` (2 failed;
  los 4 tests previos del archivo seguían en verde, incluido el override
  menor de 64 KiB).
- GREEN mínimo: `resolvePublisherMaxPayloadBytes(product, configured)`,
  regla única compartida por constructor y vía retained-status.
  Overlay-v2: `<=0` o `>72 KiB` → 72 KiB; `1..72 KiB` → explícito menor.
  Otros productos: comportamiento previo intacto (techo 256 KiB, default
  64 KiB); nada ampliado. Comando literal:
  `go test ./internal/app/telemetrytransport/ -count=1` → `ok`.
- Frontend sin cambios: el validador ya era correcto (verificado por sus
  tests de frontera 72 KiB / 72 KiB+1).

## Reparaciones previas requeridas por los gates (no deuda P3)

1. `fuel()` del validador estricto no aceptaba `sessionLaps`/`requiredFuel`/
   `history` que A2 publicó en goldens/contrato: 8/9 tests del store en rojo
   en base (causa entendida, verificada). Reparación mínima al contrato
   generado. Efecto medido: store 9/9; suite frontend 27 fallos → 2.
2. `overlay-frame-v2-performance.test.ts`: sintético con contrato antiguo
   (sin `history` en delta/fuel). Actualización mínima a `missing`.
3. Digest `canonical-integration-v1.golden.json`: en rojo YA en base pura
   (verificado en worktree temporal sobre `60a78e55`: digest base `25c78984…`
   vs pin `fffec…`, A2 no lo actualizó). El cambio A3 lo mueve a `fe6a2a…`;
   el único diff de proyección probado es `+history` (goldens overlay).
   Pin actualizado y en verde.
4. Fixture `evidence.ts` del shadow harness: mi `history` requerida lo dejó
   en `TS2741`; fix mínimo `missing` (mismo patrón que `c59efbff` de A2).

Preexistentes que NO se tocan (alcance A2/B-E, verificados independientes
de este corte: fallan igual con mis cambios frontend revertidos vía stash):
`WidgetVisualHost.v2.test.tsx` fuel-strategy (`TypeError` en
`fuel-strategy-view-model-v2.ts:116`) y
`overlay-shadow-lote2a-features.test.ts` (gaps del comparador fuel).
`go test ./...`: solo fallan `cmd/vantare` y `frontend` por `[setup failed]`
(`frontend/embed.go` exige `dist/` sin construir; ambiental, idéntico en base).

## Bytes exactos MEDIDOS (`json.Marshal`, comandos literales)

- `go test ./internal/telemetry/projection/overlayv2/ -run
  'TestFrameV2SyntheticFullUnder64KiBWith104Vehicles|TestFrameV2Representative20CharWithDeltaHistoryUnder64KiB|TestFrameV2Security32CharAdverseUnder72KiB|TestBuildDelta' -v -count=1`:
  - base corregida 104/17/17 (strings cortos, sin A3): **52723 B**.
  - representativo 20ch + A3 realista: **61049 B** (<= 65536, margen **+4487**).
  - seguridad 32ch + float adverso + A3: **66677 B** (<= 73728, margen **+7051**).
- Coste A3 (formato JSON exacto, medido en preflight): **+3353 B**
  realista, **+4013 B** adverso.
- Corrección del fixture: 64208 → 52723 (**-11485 B** de sobrecoste
  inalcanzable 104/104; corrección fiel, no debilitamiento).

## Checks exactos

- `go test ./internal/telemetry/... ./internal/app/telemetrytransport/...
  ./tools/telemetry-contract-gen/...`: ok (replay verde tras pin).
- `go test ./internal/app/...`: ok (5 paquetes).
- `go test ./...`: verde salvo `cmd/vantare`+`frontend` `[setup failed]`
  ambiental (sin `dist/`), idéntico en base.
- `go vet` en paquetes tocados: limpio. `gofmt -l`: limpio.
  `git diff --check`: limpio (verificado por commit).
- `go run ./tools/telemetry-contract-gen -check` + `git diff --exit-code
  -- frontend/src/generated/`: verde tras regenerar.
- Frontend focal: delta-trace 11/11 (3 archivos), transport 64/64 (12 archivos).
- Suite frontend completa: **3439/3441** (base: 3408/3435 con 27 fallos;
  quedan solo los 2 preexistentes A2 citados arriba).
- `pnpm --dir frontend test` transporte + `typecheck` (`tsc -b --noEmit`,
  salida íntegra a fichero): exactamente los 8 heredados R7a
  (`overlay-projection-v1.ts` 1, `projection-observer.ts` 3,
  `telemetry-cutover-runtime-harness/main.ts` 4), cero nuevos. NO verde.
- `pnpm eslint` en los 8 archivos frontend tocados/generado: limpio.
- `pnpm build`: bloqueado solo por los 8 heredados (preexistente; esos
  módulos se retiran en B/E).

## Commits (rutas explícitas, sin push)

1. `ca4b032a` docs decisión presupuesto.
2. `44b15a64` Go límite 72 KiB por producto + test.
3. `cb18c8dc` frontend límite centralizado + validador fuel + test.
4. `dcd98248` Go DeltaHistoryV2 + builder + fixture/gates + goldens.
5. `8457a5d7` contrato TS regenerado.
6. `b13e4bd9` decoder V2 + validador historia + tests.
7. `65e7aa8e` fix fixture delta shadow harness.
8. `8d2173a1` pin digest replay canónico.
9. Siguiente: este archivo + handoff (commits pequeños).
10. Re-review spec P0: hard clamp explícito (este commit).

## Riesgos

- Strings del contrato sin cota: 32ch cabe bajo 72 KiB; strings
  arbitrariamente largas no están cubiertas (declarado, no afirmado).
- Los 2 fallos frontend A2 y el build bloqueado por los 8 heredados se
  resuelven en B–E, no aquí.
- Sin runtime físico/LMU: todo sintético/determinista; pendiente de Isaac.
