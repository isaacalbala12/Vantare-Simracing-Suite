# ISA-894 · R7b/E1d — retirada del núcleo V1 frontend

Fecha: 2026-09-05. Rama única:
`vantareapp/isa-894-retirada-v1-r7b`. Sin push, PR, merge, promoción,
apps ni LMU.

## RED

Commit `8b7ed0e3`: las guardias exigieron que desaparecieran los 13 módulos
conocidos del núcleo V1 y rechazaron `TelemetrySnapshot` como autoridad
productiva. Resultado inicial: **2 failed | 19 passed (21)**.

El inventario final descubrió otro subárbol legacy cerrado sobre sí mismo:
`telemetry-ref`, `useDemoMode`, `visibility`, `mock-telemetry`,
`widget-preview-fixtures` y `relative-filters`, cada uno con su test. `rg`
confirmó cero consumidores productivos fuera de ese grupo. Se añadieron sus
12 rutas a la misma guardia y se reprodujo el RED exacto antes de borrarlas.

## GREEN

Commit `31742554`: **58 ficheros, +158/−3075, neto −2917**. Borrados 25
ficheros legacy: snapshot, adapters, derived store, mocks, acumulador de
input, scoring readers, formateo/selección Relative V1 y el subárbol de
preview omitido por el inventario inicial.

`telemetry-rate-coordinator` conserva únicamente frame/source/context/failure
V2 y un scheduler compartido; desaparecen `publish`, `getSnapshot`, las tres
historias derivadas y el store duplicado. El tipo de ciclo de vida
`TelemetryAdapter` vive junto a su único constructor V2 de Studio. El tipo
`InputTelemetrySample` queda junto a su ViewModel vivo. No se creó wrapper,
compatibilidad ni módulo sustituto.

Los tests y harnesses afectados publican `OverlayFrameV2` canónico. Los tests
genéricos del transporte usan el producto vivo `engineer`; no reintroducen el
producto Overlay V1. La visibilidad productiva continúa en
`overlay/core/widget-visibility.ts`; el viejo helper eliminado no tenía
caller productivo.

## Checks

- Guardias B1/autoridad: **21/21 PASS**.
- Tests afectados: **210/210 PASS** en 18 ficheros.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend lint`: PASS.
- `pnpm --dir frontend build`: PASS; solo aviso preexistente de chunk size.
- `git diff --check`: PASS.
- Ausencia en `frontend/dist` de snapshot, stores, mocks e historias V1: PASS.
- `pnpm --dir frontend test`: **407/407 ficheros y 3163/3163 tests PASS**,
  exit 0. El `AbortError` de teardown de Happy DOM es ruido conocido posterior
  al resumen verde, no un fallo oculto.
- `go test ./... -count=1`: PASS.
- `go vet ./...`: sin regresiones del corte; conserva únicamente los tres
  avisos heredados de `unsafe.Pointer` fuera del diff.
- Generación y check del contrato mediante los equivalentes reales del
  Taskfile (`go run ./tools/telemetry-contract-gen`, el mismo con `-check` y
  `git diff --exit-code -- frontend/src/generated/`): PASS.
- Apps, LMU y benchmark no ejecutados: este cierre es estructural y el usuario
  reservó la validación manual para después.

Comandos exactos usados: `pnpm --dir frontend typecheck`,
`pnpm --dir frontend lint`, `pnpm --dir frontend build`,
`git diff --check` y `rg --fixed-strings` sobre `frontend/src` y
`frontend/dist` para `TelemetrySnapshot`, `mock-scenarios`, `telemetry-ref`,
`widget-preview-fixtures`, `derived-telemetry-store`, `coordinator.publish`,
`getFuelHistory`, `getInputHistory` y `getDeltaHistory`.

## Riesgo restante

Review adversarial Muse + Ponytail `full` `ses_f8f8383b0ffegmpe5mMk7uudRB`:
tras restaurar la regresión de repaint durante drag sobre un frame V2 y
renombrar `rateKey` a `widgetType`, **APPROVE, P0/P1/P2/P3 = 0** sobre
`7ff93c2d`. No encontró wrappers, compatibilidad ni duplicación movida.

F debe cerrar roadmap, evidencia final y una segunda review fresca sobre el
árbol definitivo. Los nombres V1 de Strategy, Engineer y Analysis son
contratos independientes y quedan fuera del producto Overlay por D5; no
constituyen una ruta Overlay V1.
