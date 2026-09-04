# ISA-894 · R6b retirada del Hub Overlay Telemetry V1 inerte

Fecha: 2026-09-04.

## Alcance

Base: `58d1e8fe` (cierre R6a). HEAD de codigo/test/microplan: `c5c85012`
(`refactor(telemetry): retirar hub Overlay V1 inerte (ISA-894)`).

R6b retira de `TelemetryCoreRuntime` el Hub Overlay Telemetry V1 inerte que
R6a dejo construido pero vacio: campo `hub`, construccion
`NewHub(HubConfig{Product: ProductOverlay, ...})`, import `overlayprojection`
(huerfano), accessor `Hub()`, cierre en `closeProductHubs`, metricas
`Transport`, `ProjectionsPublished` y `OverlayProjectionsPublished`, y la rama
`ProductOverlay` huerfana de `productName` (sus dos callers pasan
`ProductStrategy`). Solo quedan `strategyHub` y `OverlayV2Publishers`.

Fallout demostrado por el wiring guard dentro del mismo corte (misma
doctrina que `FromFreshness` en R6a.1, sin excepciones ni allowlists): las
constantes `CurrentVersion`/`MinimumSupportedVersion` de
`internal/telemetry/projection/overlay` perdieron su unica referencia
productiva y se retiran; los tipos V1 de contrato que consume contract-gen
se preservan para R7.

Conjunto 58d1e8fe → c5c85012: 15 archivos, +351/-269 (14 de codigo/test,
+217/-269, mas el microplan +134). Produccion: 2 archivos, +33/-68. Sin
frontend, sin `transport.go`/`server`/`main` productivos.

R6b no significa Overlay Telemetry V1 ausente del binario: quedan para R7
los tipos y contratos (incluido `ProductOverlay`), el tooling y el frontend
legacy. R7 se divide en R7a (Go/contratos/tooling) y R7b (frontend legacy).
Strategy/Engineer/Analysis V1 son contratos independientes vivos que se
preservan y no forman parte de esta retirada. La auditoria integral V2 y el
bucle de rendimiento aun no comienzan; no se certifica rendimiento optimo.
Rollback exclusivamente por la build anterior verificada en R0 (hash
registrado en su evidencia; sin rutas privadas aqui).

## TDD

RED estructural (antes de produccion, contra la base):

```text
go test ./internal/app/ -run TestOverlayV1HubPhysicallyRetired -count=1 -v
```

```text
=== RUN   TestOverlayV1HubPhysicallyRetired
    overlay_v1_emit_test.go:68: retired Overlay V1 Hub remnants:
        runtime Hub fields = [hub strategyHub], want [strategyHub]
        runtime field hub still present
        runtime accessor Hub() still present
        metrics field ProjectionsPublished still present
        metrics field OverlayProjectionsPublished still present
        metrics field Transport still present
        runtime source still contains "overlayprojection"
        runtime source still contains "Product: telemetrytransport.ProductOverlay"
        runtime source still contains "func (runtime *TelemetryCoreRuntime) Hub()"
        runtime source still contains "runtime.hub"
--- FAIL: TestOverlayV1HubPhysicallyRetired (0.00s)
```

El test exige 1 campo Hub (`strategyHub`), sin campo `hub` ni metodo
`Hub()`, metricas sin los tres campos retirados y fuente sin restos. No
mira Replay vacio/404.

GREEN:

- retirada productiva del alcance y migracion de los 11 tests + harness que
  exigian el Hub vacio a ausencia estructural o Strategy correcto;
- `TestOverlayV1HubPhysicallyRetired` → PASS; guard endurecido
  (`overlayprojection`, construccion `ProductOverlay` sin coma, accessor
  `Hub()`, `runtime.hub`) → PASS;
- el wiring guard marco huerfanas las dos versiones y se retiraron en el
  mismo corte; segunda pasada PASS sin excepciones nuevas;
- precision posterior: el token sin coma exigio enmascarar el prefijo
  legitimo `ProductOverlayV2` en ambos guards; el harness recupero la
  peticion Overlay como caso negativo (total replay exactamente 1, cero
  evento/status Overlay); comentario `pending v1 full` → `pending Strategy
  full`; el helper especifico `overlayGuardQuoted()` quedo como helper del
  guard tras cerrar review.

No se abrieron Vantare, LMU, navegadores ni herramientas de medida. Este
corte no prueba comportamiento fisico ni rendimiento.

## Gates (todos PASS salvo deuda heredada indicada)

- Focales `TestOverlayV1HubPhysicallyRetired` + `TestOverlayV1EmissionGuard*`:
  PASS.
- `go test ./internal/app/...`: 5 paquetes ok.
- `go test ./internal/telemetry/...`: ok (incluido wiring guard).
- `go test ./internal/server/...`: ok.
- `pnpm --dir frontend build`: PASS; genero el `frontend/dist` real
  embebible sin cambios de fuente frontend (solo el aviso heredado de chunk
  superior a 500 kB).
- `go test ./cmd/vantare/`: ok, incluido `TestTelemetryLifecycleHarness`
  PASS y los dos tests de replay.
- `go test ./... -count=1`: PASS fresco sobre `c5c85012`, incluidos
  `cmd/vantare`, `internal/app`, wiring guard, Strategy, Engineer,
  OverlayFrame V2, recording, servidor y tooling.
- `go vet`: unicamente los tres avisos heredados fuera del diff por posible
  uso incorrecto de `unsafe.Pointer`:
  `internal/app/launcher/icon_windows.go:553`,
  `internal/telemetry/drivers/lmu/reader_windows.go:85` y
  `internal/telemetry/drivers/lmu/version_windows.go:433`.
- `gofmt` en Go tocado y `git diff --check`: limpios.
- Frontera por simbolo: cero `runtime.hub`, accessor `Hub()`,
  `overlayprojection` o contadores retirados en productivo (el `hub` propio
  de `StrategyLiveRuntime`, alimentado por `StrategyHub`, queda intacto);
  `ProductOverlay` conservado solo en transporte generico, sus tests,
  contratos R7 y la ruta 404 del harness.

## Revision independiente

Revision de especificacion, sesion `ses_f95dacf4bffe1EM9LaZK5VfOmm`,
review final sobre SHA `c5c85012` + diff local final: **APPROVE**,
P0/P1/P2/P3 = 0, alcance cumplimiento R6b.

Revision de calidad, sesion `ses_f95d7c49bfferYo8uws0fzpJDf`, mismo SHA y
diff final: **APPROVE**, P0/P1/P2/P3 = 0, alcance
calidad/lifecycle/tests/huerfanos; sus cuatro mejoras minimas ya cerradas
en `c5c85012`: token del guard sin coma (con mascara V2), peticion Overlay
negativa en el harness, comentario `pending Strategy full` y helper
especifico `overlayGuardQuoted()` del guard.

## Estado

Rama `vantareapp/isa-894-retirada-v1-r6b`, codigo/test/microplan congelados
en `c5c85012` y cierre documental `afafe3ce`, publicados en el PR draft
[#977](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/977)
hacia `nightly`. Sin merge, promocion, release ni retirada fisica total de
Overlay Telemetry V1. Rollback exclusivamente por la build anterior
verificada en R0.
