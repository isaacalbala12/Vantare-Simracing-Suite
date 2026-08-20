# 00 — Estado real del repositorio

Fecha de la investigación: 2026-08-19.
Investigador principal: Claude Fable 5 (orquestador). Agentes A–H: subagentes independientes.

## Checkout verificado

| Dato | Valor observado | Coincide con lo indicado |
|---|---|---|
| Git root | `C:/Users/isaac/Desktop/Vantare-Overlays` | Sí |
| Producto | `C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2` (módulo Go `github.com/vantare/overlays/v2`, go 1.25 en go.mod, toolchain local go1.26.4) | Sí |
| Rama | `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos` | Sí |
| HEAD | `08e316c103f20deee6946475bb5f278226e5a6e8` — `perf(hub): launcher - primer escaneo 28% mas rapido...` | Sí |
| Working tree | Sucio: 76 entradas en `git status --porcelain` (≈50 modificadas, ≈26 sin seguimiento) | — |

Comandos usados: `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain`, `git diff --stat`, `git worktree list`.

## Cambios locales sin commit relacionados con telemetría

`git diff --stat -- internal/telemetry frontend/src/overlay docs/telemetry-core` → **39 archivos, +608/−86**. Por las notas locales añadidas a `docs/current-plan.md` (`Nota DELTA-REFERENCES` y `Nota DELTA-TELEMETRY`, 2026-08-14) se trata de un corte local ya validado pero **no committeado ni promocionado**: reintroducir `mDeltaBest` nativo de LMU como señal observada y ofrecer tres referencias de delta (personal / sesión / vuelta anterior).

Archivos afectados (resumen):

- Backend Go: `internal/telemetry/catalog/{catalog.go,ids.go}` (nuevos ids `SignalSessionNativeDeltaBest`, `SignalSessionPreviousLapDelta`), `internal/telemetry/core/reducer.go` (`VehicleState.DeltaBest`), `internal/telemetry/derive/{delta.go,pipeline.go}` (`SelfDelta.PersonalBest/SessionBest/PreviousLap`, tracker con `previous`), `internal/telemetry/drivers/lmu/{batch_mapper,driver,format,fusion,layout}.go` y tests, `internal/telemetry/projection/overlay/v1.go` + goldens, `internal/telemetry/recording/replay/testdata/canonical-integration-v1.golden.json`.
- Frontend: `frontend/src/overlay/core/telemetry-snapshot.ts`, `frontend/src/overlay/projection/overlay-projection-{adapter,v1}.ts`, `frontend/src/overlay/widget-types/delta/{delta-definition,delta-view-model}.ts` + tests, `frontend/src/hub/overlay-studio/inspector/*` + i18n (es/en/it/pt).
- Docs: `docs/telemetry-core/{domain-inventory,lmu-authority-matrix,lmu-overlay-signal-provenance,overlay-shadow-matrix,runtime-derivations,signal-catalog}.md`, `docs/changelog.md`, `docs/current-plan.md`.
- No relacionados con telemetría pero también sucios: `internal/updater/*`.

**Este diff local es evidencia directa del Caso 3 de amplificación de cambio ("añadir LMU native delta")**: una señal específica de un simulador tocó catálogo, reducer, derive, driver LMU (5 archivos), proyección overlay, replay goldens, adaptador frontend, view-model del widget, inspector y 4 locales i18n. Los agentes deben tratarlo como dato observado, no como funcionalidad integrada.

Sin seguimiento (no relevantes para telemetría salvo indicación): `spikes/`, `worktrees/`, `vantare-workshop/`, mocks HTML de exploración visual, `docs/design/`, `docs/analysis/*2026-08-1{4,6}.md`, `frontend/.playwright-shots/`, `UserData/`.

## Reglas respetadas durante la investigación

- No se descartan, sobrescriben ni modifican los cambios locales existentes.
- No commit, push, merge, rebase, promoción a nightly ni release.
- No se implementa una nueva arquitectura en producción.
- Los benchmarks aislados viven en `docs/research/telemetry-architecture-2026/bench/` con build tag `researchbench` para que `go build ./...` / `go vet ./...` / `go test ./...` no los recojan.
- No se modifican documentos históricos (`docs/telemetry-core/*`, ADRs) para que coincidan con la conclusión.

## Tamaño aproximado del sistema investigado

- `internal/telemetry/**/*.go`: ≈40.4k líneas (incluye tests y goldens no; solo `.go`).
- Paquetes: `catalog`, `core`, `derive`, `diagnostics`, `driver`, `drivers/lmu`, `projection/{overlay,engineer,strategy,analysis}`, `recording/{sqlite,replay}`, `schema/{controls,energy,envelope,identity,pit,session,spatial,standings,vehicle,weather,wheels}`.
- Frontend overlay: `frontend/src/overlay/**` (core, projection, widget-types, …).
- Documentación de referencia existente: `docs/telemetry-core/*` (≈50 archivos), ADR 0004 (telemetry core modular observation architecture), ADR 0005 (engineer projection capability contract; duckdb helper), `docs/architecture.md`, `docs/vantare-suite-architecture.md`, `docs/domain-model.md`.

## Índice de la investigación

| Doc | Autor | Contenido |
|---|---|---|
| 00 | Orquestador | Este documento |
| 01 | Agente 0 (reconstructor) | Arquitectura real reconstruida desde el código + amplificación de cambio medida |
| 02 | Agente A | Defensa de la arquitectura actual |
| 03 | Agente B | Arquitectura simplificada |
| 04 | Agente C | Modelo multi-simulador |
| 05 | Agente D | Rendimiento y benchmarks |
| 06 | Agente E | Fiabilidad y consistencia |
| 07 | Agente F | Mantenibilidad por LLM |
| 08 | Agente G | Arquitecturas alternativas |
| 09 | Agente H | Revisión cruzada adversarial |
| 10 | Agente H | Matriz de decisión |
| 11 | Agente H + orquestador | Recomendación final |
| 12 | Agente H + orquestador | Plan de migración |
