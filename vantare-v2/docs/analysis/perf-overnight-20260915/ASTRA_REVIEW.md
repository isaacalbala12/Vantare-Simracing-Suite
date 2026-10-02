# ASTRA_REVIEW — Campaña nocturna de optimización medible

**Estado final:** `REVIEWED_AND_MERGED`  
**BASE_SHA:** `f617467427f8d78f7432b4445d52be0c4dfe616a`  
**HEAD final:** `b7866e52` (rama `perf/overnight-20260915-0130`; el commit de documentación posterior se puede ver con `git rev-parse HEAD`)
**Merge:** promocionada a `nightly` tras revisión local y autorización explícita; Astra High puede hacer revisión adversarial post-merge.  
**Worktree:** `/Users/isaacalbala/Desktop/Isaac Albala/vantare-perf-overnight-20260915`  
**Último commit bueno:** `b7866e52`  
**Orquestador:** Devin, sin subagentes lanzados por limitaciones del harness.

## Alcance real y decisiones de campaña

- Se aisló el worktree desde `origin/nightly` (`f6174674`) sin tocar los worktrees ajenos: `vantare-quality-worktree` (agente anti-slop, `quality/antislop-bootstrap`), `vantare-isa928` y `vantare-isa713-cobertura`.
- No se accedió a Notion desde este entorno (sin MCP de Notion); el seguimiento se conserva en `RUN_STATE.md` y `experiments.jsonl`. Notion debe actualizarse manualmente tras el merge.
- Se ejecutó **un experimento aceptado** (E1) en la ruta caliente de telemetría LMU. Se exploró un segundo intento dentro del mismo experimento que se descartó por conservar compatibilidad con LMU14.
- Se revisó el diff localmente antes de mergear y se aplicaron dos correcciones menores: reubicar el doc comment de `lmu13Layout` y tratar dos `NaN` como iguales en `deepEqual`.
- Se dejan priorizados los espacios no demostrados para revisión adversarial.

## Experimento aceptado E1: BatchMapper LMU

### Problema
El perfil `alloc_objects` de `BenchmarkBatchMapperS31Fixture` mostraba que `fmt.Sprintf`/`fmt.Sprint` dominaban el 62% de las allocations por frame (`vehicleID`, `sessionID` y `slotFingerprint.SourceKey`). El formato de identidad se construía con `fmt` en la ruta caliente de cada observación.

### Cambio
- `internal/telemetry/drivers/lmu/batch_mapper.go`: `vehicleID` y `sessionID` ahora usan `strconv.AppendInt`/`AppendUint` sobre un buffer en stack.
- `internal/telemetry/identity/slot.go`: se eliminó el campo `SourceKey` de `SlotFingerprint`, redundante porque la clave del `SlotTracker` ya identifica el source slot.
- `internal/telemetry/drivers/lmu/layout.go`: se extrajo la constante `lmu13MaxScoringRows = 104` para dar nombre al límite del layout 1.3.

### Contrato preservado
- Las cadenas de identidad siguen siendo exactamente `lmu-session-N` y `lmu-slot-N-generation-G`.
- `SlotFingerprint` compara `Driver` y `Class`; el source slot lo identifica la clave del tracker.
- Todos los tests de `internal/telemetry/drivers/lmu` y `internal/telemetry/identity` pasan.

### Métricas
`go test -bench=BenchmarkBatchMapperS31Fixture -benchmem -count=6 ./internal/telemetry/drivers/lmu`

| métrica | baseline (BASE_SHA) | candidato (HEAD) | delta |
|---|---|---|---|
| ns/op | 27.418 µs | 19.417 µs | **-29,2%** |
| B/op | 44.450 | 42.529 | **-4,3%** |
| allocs/op | 99 | 65 | **-34,3%** |

### Intento descartado dentro de E1
Se probó reemplazar `map[VehicleSourceID]struct{}` en `validateMapperObservation` por un array fijo `[lmu13MaxScoringRows]bool`. Rompió tests de LMU14 (`TestSingleLMU14RuntimeFeedsEngineerAndKeepsDistantTrafficSilent` y otros) porque los source slots pueden estar fuera del límite 1.3 en esos fixtures. Se revierte al map; se conserva la mejora de `fmt`->`strconv`.

### Reversión específica
```sh
git revert c0f47c6a
```

### Tests y checks
- `go test ./internal/telemetry/drivers/lmu ./internal/telemetry/identity` — PASS.
- `go vet ./internal/telemetry/drivers/lmu ./internal/telemetry/identity` — PASS.
- `go test ./internal/telemetry/...` — PASS excepto fallos preexistentes en `diagnostics` y `recording/sqlite` (configuración de captura cruda y permisos de sqlite en macOS).
- `pnpm --dir vantare-v2/frontend typecheck` — PASS.
- `pnpm --dir vantare-v2/frontend test overlay-frame-v2-performance` — PASS (0.482 ms/op, límite 1.5 ms).

## Experimento aceptado E2: Studio `documentsEqual` y `commitStudioCommand`

### Problema
`documentsEqual` en `frontend/src/hub/overlay-studio/state/studio-history.ts` comparaba dos `JSON.stringify(document)` con un reemplazo que ordenaba las claves de cada objeto. En documentos con muchos widgets esto construye cadenas grandes y objetos intermedios ordenados. Además, `commitStudioCommand` clonaba `previous` con `structuredClone` antes de saber si el comando realmente cambiaba el documento.

### Cambio
- `studio-history.ts`: se reemplazó `documentsEqual` por una función `deepEqual` recursiva que:
  - ignora el orden de las claves de los objetos,
  - conserva el orden de los arrays (widgets/columnas),
  - omite claves con valor `undefined` para equivalencia con `JSON.stringify`,
  - trata dos valores `NaN` en el mismo campo numérico como iguales,
  - no construye cadenas ni objetos intermedios.
- `commitStudioCommand`: ahora aplica el comando, compara `history.present` con `present` y solo clona `previous` si hay un cambio real.

### Contrato preservado
- El orden de los arrays del documento sigue siendo significativo.
- El orden de las claves de los objetos sigue siendo irrelevante (caso Go vs inspector).
- `commitStudioCommand` sigue devolviendo el mismo objeto `history` en comandos sin efecto.
- Todos los tests de `studio-history.test.ts` y la suite completa frontend (3573 tests) pasan.

### Métricas
`pnpm --dir vantare-v2/frontend exec vitest bench src/hub/overlay-studio/state/studio-history.perf.bench.ts --run`  
`pnpm --dir vantare-v2/frontend exec vitest bench src/hub/overlay-studio/state/studio-history.commit.perf.bench.ts --run`

| métrica | baseline (BASE_SHA) | candidato (HEAD) | delta |
|---|---|---|---|
| `isStudioHistoryDirty` con 50 widgets (mean ms/op) | 0,4312 | 0,1699 | **-60,6%** |
| `isStudioHistoryDirty` con 50 widgets (hz) | 2.319,14 | 5.884,98 | **+153,8%** |
| `commitStudioCommand` no-op con 50 widgets (mean ms/op) | 0,7722 | 0,3848 | **-50,2%** |
| `commitStudioCommand` no-op con 50 widgets (hz) | 1.294,95 | 2.598,64 | **+100,7%** |

### Reversión específica
```sh
git revert <sha de E2>
```

### Tests y checks
- `pnpm --dir vantare-v2/frontend exec vitest run src/hub/overlay-studio/state/studio-history.test.ts` — PASS (15 tests, incluido test de regresión para NaN).
- `pnpm --dir vantare-v2/frontend test` — PASS (448 files, 3574 tests, 2 skipped).
- `pnpm --dir vantare-v2/frontend typecheck` — PASS.
- `pnpm --dir vantare-v2/frontend lint` — PASS.

## Balance desde Git

```text
10 files changed, 276 insertions(+), 20 deletions(-)
```

- Producto: `batch_mapper.go`, `layout.go`, `slot.go`, `slot_test.go`, `studio-history.ts`.
- Tests/benchmarks: `slot_test.go`, `studio-history.test.ts`, `studio-history.perf.bench.ts`, `studio-history.commit.perf.bench.ts`.
- Campaña: `RUN_STATE.md`, `experiments.jsonl`, `ASTRA_REVIEW.md`.
- No se atribuyen cambios de otras ramas.

## Estado de build/tipos/tests/análisis

| control | resultado | motivo |
|---|---|---|
| Go `go test ./internal/telemetry/drivers/lmu` | PASS | |
| Go `go test ./internal/telemetry/identity` | PASS | |
| Go `go vet` (ambos paquetes) | PASS | |
| TS `pnpm --dir vantare-v2/frontend typecheck` | PASS | |
| TS `pnpm --dir vantare-v2/frontend test` | PASS | 448 archivos, 3574 tests, 2 skipped |
| TS `pnpm --dir vantare-v2/frontend lint` | PASS | |
| TS `pnpm --dir vantare-v2/frontend build` | PASS | |
| Go `go test ./internal/telemetry/...` | FAIL en `diagnostics` y `recording/sqlite` | fallos preexistentes, no relacionados con el cambio |
| Build Wails/LMU Windows | NOT_APPLICABLE | entorno macOS, no se puede verificar |

## Puntos ciegos y riesgos

- No se ejecutó la app Wails real ni en Windows; las mejoras se midieron en benchmarks Go y tests unitarios de macOS.
- No se tocó `OverlayFrameV2Store` ni `overlay-wails-pull`; sus `shift()` en anillos de 512 muestras son candidatos conocidos, pero no se demostró una regresión real con la carga actual.
- No se perfiló el motor de proyección `overlayv2` a fondo; sus benchmarks existentes (`BenchmarkProjectV2`, `BenchmarkOverlayV2ByCadence`) son la línea base futura.
- No se verificó el trabajo del agente anti-slop en `vantare-quality-worktree`; al combinar ramas hay que revalidar los archivos compartidos (`internal/telemetry/identity/slot.go`, `internal/telemetry/drivers/lmu/batch_mapper.go`) contra ese worktree.

## Instrucciones para revisión adversarial (Astra High)

1. Reproducir el benchmark E1 en BASE y HEAD:
   ```sh
   git checkout f617467427f8d78f7432b4445d52be0c4dfe616a
   cd vantare-v2 && go test -bench=BenchmarkBatchMapperS31Fixture -benchmem -count=6 ./internal/telemetry/drivers/lmu
   git checkout perf/overnight-20260915-0130
   go test -bench=BenchmarkBatchMapperS31Fixture -benchmem -count=6 ./internal/telemetry/drivers/lmu
   ```
2. Refutar la mejora: buscar que `vehicleID` o `sessionID` generen cadenas distintas a las originales; ejecutar `go test ./internal/telemetry/drivers/lmu` con golden fixtures.
3. Verificar `SlotFingerprint` sin `SourceKey` no produce bumps falsos ni reopens incorrectos: `go test ./internal/telemetry/identity`.
4. Buscar fugas o carreras en el `BatchMapper`: la sincronización `sync.Mutex` no cambió; el clon del estado y el `SlotTracker` siguen igual.
5. Revisar que el `lmu13MaxScoringRows` constante no altere layouts dinámicos o LMU14.

### Reproducir E2
1. `documentsEqual` con documento con muchos widgets:
   ```sh
   cd vantare-v2
   pnpm --dir frontend exec vitest bench src/hub/overlay-studio/state/studio-history.perf.bench.ts --run
   git checkout f617467427f8d78f7432b4445d52be0c4dfe616a -- frontend/src/hub/overlay-studio/state/studio-history.ts
   pnpm --dir frontend exec vitest bench src/hub/overlay-studio/state/studio-history.perf.bench.ts --run
   git checkout perf/overnight-20260915-0130 -- frontend/src/hub/overlay-studio/state/studio-history.ts
   ```
2. `commitStudioCommand` no-op:
   ```sh
   pnpm --dir frontend exec vitest bench src/hub/overlay-studio/state/studio-history.commit.perf.bench.ts --run
   ```
3. Refutar la igualdad: construir documentos con claves de objetos en orden distinto (por ejemplo, invirtiendo `Object.entries` de un layout) y comprobar que `isStudioHistoryDirty` devuelve `false`; cambiar el orden de un array de widgets y comprobar que devuelve `true`.

## Siguientes oportunidades priorizadas

1. **Telemetría / proyección `overlayv2`**: los benchmarks `BenchmarkProjectV2` y `BenchmarkOverlayV2ByCadence` tienen allocs/op y latencia por vehículo; medir con pprof y comparar con BASE.
2. **Frontend `overlay-frame-v2-store` y `overlay-wails-pull`**: los `shift()` en anillos de 512 muestras son O(n); evaluar si un buffer circular mejora latencia de ingest/pull en ráfagas.
3. **Overlay Studio / canvas y preview**: `useCanvasInteraction` y `StudioCanvas` ya se perfilan en tests; buscar invalidaciones amplias o mediciones de DOM forzadas por eventos de arrastre.
4. **Reconciliación con rama anti-slop**: ejecutar `git diff quality/antislop-bootstrap..HEAD` en archivos compartidos y revalidar controles.

---
Entrega generada por Devin. No se promocionó a `nightly`; aprobación final reservada a Astra High.
