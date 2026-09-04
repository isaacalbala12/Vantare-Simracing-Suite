# ISA-894 · R6a + R6a.1 retirada del productor Overlay V1 y de sus constructores huérfanos

Fecha: 2026-09-04.

## Alcance

Base: `2371958d` (publicación de R5 en PR draft).

- R6a, commit `fcf96568` (`feat(telemetry): retirar productor Overlay V1`):
  retira el único productor runtime de Overlay V1 (`overlayV1Emit`,
  cableado en `telemetry_core_runtime.go` y `cmd/vantare/main.go`) y su
  activación por settings. 19 archivos, +373/-393. Toca frontend solo en
  `frontend/src/hub/settings/settings-contract.ts` (-3 líneas).
- R6a.1, commit `8878178d` (`refactor(telemetry): retirar constructores V1
  huérfanos`): retira los constructores huérfanos
  `overlay.ProjectV1`/`ProjectorV1` y `telemetrytransport.NewOverlayFull`,
  y el export huérfano `projection.FromFreshness` revelado por el guard;
  migra sus tests a hechos canónicos y Overlay V2. 17 archivos, +470/-1130.
  No toca frontend.

Conjunto 2371958d → 8878178d: 35 archivos, +839/-1519.

R6a + R6a.1 no retiran el Hub Overlay inerte, los tipos y contratos Overlay
V1 con consumidor literal, el tooling ni el frontend Overlay legacy. Eso
queda para R6b/R7: primero el Hub inerte, luego tipos/contratos, tooling y
frontend según callers. Strategy/Analysis/Engineer V1 son contratos
independientes vivos que se preservan y no forman parte de la retirada
Overlay V1. La auditoría integral V2 y el bucle de rendimiento aún no
comienzan. Rollback exclusivamente por la build anterior verificada en R0.

## TDD

RED arquitectónico (acreditado en el microplan R6a.1, sin caller falso):

```text
go test ./internal/telemetry -run TestExportedSymbolsHaveProductionCaller -count=1 -v
```

debía fallar citando exactamente `NewOverlayFull` y `overlay.ProjectV1`
sin caller productivo. Contradicción observada directamente en el mismo
corte: el replay canónico no compilaba tras retirar V1:

```text
canonical_integration_test.go:137:37: undefined: overlayprojection.ProjectV1
```

GREEN:

- R6a.1 retira ambos constructores y la implementación de proyección V1
  muerta; `transport.go` conserva `ProductOverlay`, `Hub`, `newFull`,
  `NewStrategyFull` y Strategy.
- Primera de dos excepciones al microplan (resolución del orquestador,
  mínima y obligatoria): `canonical_integration_test.go` incluye un OverlayFrame V2
  determinista vía el `overlayv2.ProjectV2` puro de referencia
  (`SourceContextV2{State:"live"}`, `DefaultPreferencesV2()`, revisión 1),
  sin omitir al consumidor Overlay, sin reimplementar V1 y sin tocar
  producción V2. Solo se actualiza
  `testdata/canonical-integration-v1.golden.json` (digest `fffecdb4…faea`).
  El golden canónico sigue deliberadamente a ProjectV2.
- Segunda excepción (fix P1 de revisión): el test LMU14 comparaba las 20
  ejecuciones solo entre sí y conservaba el campo legacy sin uso; se
  preserva la garantía fija renombrando a
  `TrackCanonicalFingerprintSHA256` / `trackCanonicalFingerprintSha256`
  con assert del SHA256 del `canonicalRuntimeFingerprint` serializado
  (`393155d6…092b6b4`). Solo se actualiza
  `menu_track_pit_disconnect_v1.golden.json`. Sin reintroducir V1 ni
  cambiar producción.
- Calidad P3 (solo nombres, sin cambiar comportamiento):
  `TestOverlayV2GoldenMatchesV1SemanticsForPlayer` →
  `TestProjectV2PreservesCanonicalPlayerFacts`,
  `TestNativeDeltaBestTraversesLMUBufferToOverlayWithoutReferenceWarmup` →
  `TestNativeDeltaBestTraversesLMUBufferToCanonicalWithoutReferenceWarmup`,
  `TestBatchMapperPlayerAbsenceClearsActivePlayerThroughProjection` →
  `TestBatchMapperPlayerAbsenceClearsActivePlayerInCanonicalState`.
- `projection.FromFreshness` retirado de `contracts.go` (cero callers
  productivos); su único caller de test usa el helper local
  `strategyTestProjectionFreshness` con idéntica correspondencia.
- La política de fallos conserva evidencia runtime de
  `ErrPayloadTooLarge`: Hub Strategy de test acotado provoca el fallo de
  snapshot tanto en modo fail-stop legacy como en modo no terminal V2.
- Los Go bajo `docs/research` tienen build tag `researchbench`, quedan
  fuera de `go test ./...` por defecto y no se tocan en este corte; ese
  V1 de investigación se retira en R7.

Gates del orquestador (todos PASS):

- Wiring guard `TestExportedSymbolsHaveProductionCaller`: PASS, sin
  siguiente huérfano.
- Focales `internal/app`, `telemetrytransport`, `drivers/...`,
  `overlayv2`, `replay`, `strategy`: PASS.
- `go test ./internal/app/... ./internal/telemetry/...`: PASS (37
  paquetes ok; `projection/overlay` queda sin archivos de test, como
  corresponde tras retirar `v1_test.go`).
- `go test ./...`: PASS completo sobre `8878178d` (incluye `voiceinput`
  y `updater`, sin flaky en esa pasada).
- `go vet ./...`: solo los tres avisos heredados fuera del diff por
  posible uso incorrecto de `unsafe.Pointer`:
  `internal/app/launcher/icon_windows.go:553`,
  `internal/telemetry/drivers/lmu/reader_windows.go:85` y
  `internal/telemetry/drivers/lmu/version_windows.go:433`.
- `gofmt` y `git diff --check`: PASS.
- Frontera por símbolo: cero `overlay.ProjectV1` / `NewOverlayFull` en
  `internal/` productivo (restos solo en `docs/research` con tag
  excluido, docs históricos y el propio guard de frontera); cero
  `FromFreshness` exportado; cero `ProjectorV1` en
  `projection/overlay/`.
- Frontend heredado de R6a (typecheck, build y lint verdes en el parent
  sobre el mismo commit padre) y no repetido en R6a.1, que no toca
  frontend.

Cierre del quality review (comentario, sin lógica): en
`internal/app/telemetry_core_strategy_test.go` se corrige el comentario
inexacto de `swapStrategyHubForPayloadCeiling`: el status sí cabe y se
publica una vez en el Hub nuevo, que parte sin estado; solo el snapshot
falla con `ErrPayloadTooLarge`. Focales de Strategy payload 2/2 PASS
tras la corrección.

No se abrieron Vantare, LMU, navegadores ni herramientas de medida. Este
corte no prueba comportamiento físico ni rendimiento; no se certifica
rendimiento óptimo.

## Revisión independiente

Revisión de especificación Muse Spark 1.3 Contributor xhigh,
`ses_f95fb746cffeIJegu669xjgMYj`: **APPROVE**, P0/P1/P2 = 0.

Revisión combinada de calidad Muse,
`ses_f95f72d65ffe0O1cnMMxgbWNPs`: **APPROVE**, P0/P1/P2 = 0, P3 = 3,
enumerados explícitamente:

1. `docs/research` aún referencia `ProjectV1`/`NewOverlayFull` bajo build
   tag `researchbench`: queda fuera de `go test ./...` por defecto, no se
   toca en este corte y se retira/porta en R7.
2. El golden del replay canónico ahora sigue deliberadamente a
   `ProjectV2` (digest `fffecdb4…faea`): es la primera excepción
   documentada del microplan, no un descuido.
3. El comentario del Hub acotado (`swapStrategyHubForPayloadCeiling`) era
   inexacto: el status sí cabe y se publica una vez en el Hub nuevo; ya
   está corregido sin cambiar lógica, con focales de Strategy payload 2/2
   PASS. No se amplía el alcance.

## Estado

Rama `vantareapp/isa-894-retirada-v1-r6a`, SHA de código/test `8878178d`,
apilada sobre R5. Sin merge, promoción, release ni retirada física total
de V1. Rollback exclusivamente por la build anterior verificada en R0. El
closeout documental (comentario, evidencia, handoff y roadmap con digest
regenerado) se incorpora en el commit de cierre; pendiente de push/PR
draft.
