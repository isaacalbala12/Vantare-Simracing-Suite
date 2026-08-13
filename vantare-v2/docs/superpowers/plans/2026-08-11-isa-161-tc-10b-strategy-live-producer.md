# ISA-161 / TC-10B — StrategyLiveProjection v1 productiva

**Objetivo:** convertir la proyección Strategy v1 existente, hoy aislada, en un productor live aditivo que reutiliza el único pipeline LMU canónico y llega por Wails/SSE con replay de estado y resync full.

**Arquitectura:** `TelemetryCoreRuntime` seguirá abriendo un único driver LMU y ejecutando una sola cadena `Observation -> BatchMapper -> Reducer -> SessionCoordinator -> Derive`. Después del mismo `FinalState`, proyectará Overlay y Strategy de forma pura y publicará cada producto en su `Hub` cerrado. Strategy solo recibe señales admitidas por ISA-160; VE, neumáticos y clima siguen ausentes. El productor publica fulls completos; el delta continúa siendo opcional en el transporte y no se fabricará un diff nuevo. Los facts quedan fuera: TC-10A no auditó un payload de facts Strategy y STR-17 consume el snapshot live versionado.

**Base aprobada original:** `nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00` (ISA-160 promovida).

**Base local actual tras rebase:** `origin/nightly@b6df494298578ff9a043bbd9b48a66eb1512010f`.
El corte se construyó originalmente desde ISA-160 y conserva ese historial
técnico. El primer rebase local fue sobre `origin/nightly@234794d`; el segundo
actualiza la base y merge-base de entrega a `b6df494`.

**Rama:** `vantareapp/isa-161-tc-10b-productor-strategyliveprojection-v1`.

## Fronteras obligatorias

- No abrir Shared Memory, REST ni drivers adicionales.
- No leer almacenamiento de Strategy o Telemetry Analysis.
- No convertir `missing`, `stale` o `invalid` en cero, valor usable o estimación.
- Fuel amount/capacity salen de la misma `schema.Field[energy.Fuel]` y conservan juntos presencia, procedencia y freshness.
- VE, tyres, compound, wear y weather no aparecen ni como campo ni como capability.
- `Hub()` conserva su significado histórico de Overlay; Strategy usa un accessor explícito.
- No implementar motor de plan, replanificación, UI Strategy ni facts Strategy.
- Sin dependencias nuevas.

## Task 1: ampliar el contrato Strategy v1 de forma aditiva

**Archivos:**

- Modificar `internal/telemetry/projection/strategy/v1.go`.
- Modificar `internal/telemetry/projection/strategy/v1_test.go`.
- Conservar el golden antiguo como `internal/telemetry/projection/strategy/testdata/strategy_v1_pre_tc10b.golden.json`.
- Actualizar `internal/telemetry/projection/strategy/testdata/strategy_v1.golden.json`.
- Modificar los guards ISA-160 en `internal/telemetry/drivers/lmu/strategy_signal_audit_test.go` solo para la superficie aditiva aprobada; no reescribir su ledger de 18 señales.

- [x] Añadir `CapabilityFuel` y campos session `sourceTimeSeconds`, `endTimeSeconds`, `remainingSeconds`, `maximumLaps`.
- [x] Añadir al jugador `sector`, `lapDistanceMeters`, `fuelLiters` y `fuelCapacityLiters`.
- [x] Inicializar todos los campos nuevos como missing explícito antes de buscar el vehículo activo.
- [x] Derivar capabilities solo de campos disponibles, sin habilitar fallbacks.
- [x] Probar fresh/stale/invalid/missing y atomicidad de los dos campos Fuel.
- [x] Ejecutar matriz JSON productor old/new contra consumidor old/new; el consumidor nuevo normaliza campos aditivos ausentes a missing y el antiguo ignora extensiones.
- [x] Probar que VE/tyres/weather continúan ausentes por reflection y golden.

Gate:

```powershell
go test -count=20 ./internal/telemetry/projection/strategy
go test -count=20 ./internal/telemetry/drivers/lmu -run '^TestStrategySignalAudit'
```

## Task 2: cablear un segundo producto sobre el mismo runtime

**Archivos:**

- Modificar `internal/app/telemetry_core_runtime.go`.
- Modificar `internal/app/telemetry_core_runtime_test.go`.
- Crear `internal/app/telemetry_core_strategy_test.go`.
- Modificar `internal/app/telemetry_core_hardening_test.go`.
- Modificar `internal/app/telemetry_core_engineer_test.go` solo si el contrato compartido de métricas exige ajustar expectativas.

- [x] Crear un `Hub` Strategy cerrado con política de versión v1 y accessor `StrategyHub()`.
- [x] Proyectar Overlay y Strategy desde el mismo `FinalState`; un fallo de publicación queda contextualizado y no se oculta.
- [x] Publicar el mismo estado/revisión coherente en ambos hubs y servir ambos adapters Wails bajo el mismo contexto/ciclo de vida.
- [x] Cerrar ambos hubs de forma idempotente y conservar `Hub()` como Overlay.
- [x] Exponer métricas separadas por producto sin payloads ni IDs.
- [x] Probar full inicial, late join, consumidor lento, salto/reemplazo, cambio de epoch, status/reconnect y teardown.
- [x] Probar aislamiento: suscriptores Overlay y Engineer no reciben eventos Strategy y viceversa.
- [x] Probar explícitamente que el runtime sigue construyendo un solo manager/driver/mapper/reducer/derive.

Gate:

```powershell
go test -count=20 ./internal/app -run 'Strategy|TelemetryCore'
go test -count=1 ./internal/app
```

## Task 3: exponer Strategy por SSE y composition root

**Archivos:**

- Modificar `internal/server/server.go`.
- Modificar `internal/server/telemetry_projection_test.go`.
- Modificar `cmd/vantare/main.go`.
- Modificar `cmd/vantare/telemetry_lifecycle_harness_test.go`.

- [x] Añadir `StrategyProjection` a `ServerConfig` y registrar `/telemetry/strategy/projection` solo cuando exista el hub.
- [x] Pasar `StrategyHub()` desde la composition root sin abrir otra fuente.
- [x] Repetir para Strategy el replay de status solicitado por ventanas Wails tardías.
- [x] Probar nombres de evento, ruta loopback, 404 cruzado, status+full correlacionados y cierre por contexto.
- [x] Extender el harness de lifecycle para detectar goroutines o cierres pendientes con ambos productos.

Gate:

```powershell
go test -count=20 ./internal/server -run 'Telemetry|Strategy'
go test -count=20 ./cmd/vantare -run 'TelemetryLifecycle|Strategy'
```

## Task 4: replay, compatibilidad y soak simultáneo

**Archivos:**

- Modificar `internal/telemetry/recording/replay/canonical_integration_test.go` y su golden aplicable.
- Modificar `internal/app/telemetry_core_hardening_test.go`.
- Crear o actualizar evidencia bajo `evidence/isa-161-*` solo con resultados sanitizados.

- [x] Probar replay determinista del nuevo payload desde el recording canónico sin leer storage privado.
- [x] Ejecutar secuencias duplicadas, gap, out-of-order, reset de epoch y reconnect; toda pérdida exige full vigente.
- [x] Ejecutar soak determinista Overlay+Engineer+Strategy con consumidores rápidos y lentos, backpressure acotado y teardown.
- [x] Añadir benchmark focal de la doble proyección/publicación y registrar tiempo/asignaciones; no fijar umbral arbitrario sin baseline.
- [x] Mantener la fixture real LMU 1.4 de Fuel como evidencia E2E; una prueba live opt-in es complementaria y no sustituye los fixtures versionados.

Gate:

```powershell
go test -count=20 ./internal/telemetry/recording/replay ./internal/app
go test -run '^$' -bench 'Strategy|TelemetryCore' -benchmem -count=5 ./internal/app
```

## Task 5: documentación viva, revisión y entrega aislada

**Archivos:**

- Modificar `docs/current-plan.md`.
- Modificar `docs/vantare-program/handoffs/telemetry-core.md`.
- Modificar `docs/vantare-program/handoffs/strategy-planner.md` solo para reflejar la condición real de desbloqueo de ISA-152 tras la promoción aceptada de ISA-161.
- Modificar `docs/strategy-planner/projection-ownership.md` si la entrega cambia de compile-only a productiva.

- [x] Registrar que ISA-160 está en `nightly@8880a88`, que ISA-161 se construyó
  originalmente desde esa base, que el primer rebase fue sobre `234794d` y que
  la base y merge-base actuales son `origin/nightly@b6df494`.
- [x] Documentar contrato final, fields/capabilities, límites, ruta SSE/Wails, replay/resync, rendimiento y exclusiones.
- [x] Ejecutar reviews locales de especificación/seguridad y calidad para Tasks 1-4; los hallazgos quedaron resueltos con sus regresiones.
- [x] Ejecutar el probe LMU opt-in read-only/sanitizado sobre el HEAD rebasado;
  confirmar build soportada, runtime live y ausencia honesta cuando no hay
  jugador, sin persistir raw, IDs ni PII.
- [ ] Validar en pista, con jugador presente, un full Strategy con Fuel live;
  el smoke sanitizado sin jugador no acredita este punto.
- [x] Crear el commit documental, publicar la rama y abrir el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  hacia `nightly`.
- [x] Publicar `19dddea` y verificar su CI exacto: el
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  y GitGuardian pasaron. Cualquier amend posterior requiere checks de su nuevo
  HEAD y el estado final se consulta en el PR.
- [ ] Actualizar Linear cuando vuelva a estar autenticado; la reautenticación
  sigue pendiente y la issue no se cierra.
- [ ] No mergear, promover a `nightly`, `testers` o `master`, ni publicar release sin una autorización nueva de Isaac.

Estado de Task 5 al 2026-08-12: documentación, reviews, gates locales y smoke
LMU sanitizado cerrados. Telemetry, app/server, frontend build,
`go test ./...` y frontend 367 archivos/2.636 tests pasan sobre el HEAD del
primer rebase `879d5be`; la
suite frontend emite dos `AbortError` de teardown happy-dom con exit 0. Vet
global termina con exit 1 solo por tres `unsafe.Pointer` heredados y `gofmt`
global lista `diagnostics_service.go`, heredado de `origin/nightly` y fuera del
diff ISA-161. Diff-check está limpio. La rama y el PR draft #212 están
publicados; el PR permanece OPEN/CLEAN/MERGEABLE hacia `nightly@b6df494`. Para
`19dddea`, el run `31639192366` terminó COMPLETED/SUCCESS: promoción válida,
frontend build, Go, frontend tests, visual advisory y lint advisory pasaron;
GitGuardian también pasó. Cualquier amend posterior requiere checks de su nuevo
HEAD y el estado final se consulta en el PR. Siguen pendientes validación en
pista con jugador/Fuel, Linear por reautenticación y cualquier promoción.
ISA-152 / STR-17 no queda desbloqueada hasta la promoción aceptada de ISA-161 a
`nightly`. `234794d` queda como base histórica del primer rebase.

Gates finales:

```powershell
gofmt -l internal/telemetry internal/app internal/server cmd/vantare
go vet ./internal/telemetry/... ./internal/app/... ./internal/server/... ./cmd/vantare
go test -count=1 ./internal/telemetry/...
go test -count=1 ./internal/app/... ./internal/server/...
go test -count=1 ./...
git diff --check
```

Si `cmd/vantare` falla porque falta `frontend/dist`, instalar desde el lockfile, ejecutar `pnpm --dir frontend build` y repetir el gate Go; no versionar `dist` ni alterar lockfiles.

## Verificación manual con LMU

El probe opt-in read-only/sanitizado se ejecutó sobre el HEAD del primer rebase
`879d5be` con el proceso
`Le Mans Ultimate` activo:

```powershell
$env:LMU_LIVE_SHARED_MEMORY_TEST=1
go test -count=1 -v ./internal/telemetry/drivers/lmu -run '^TestLiveLMUSharedMemoryOptIn$'
```

Resultado: PASS; build normalizada `1.4.0.0`, `supported=true`, runtime
`state=live`, `player-present=false` y fingerprint
`LMU_Data/runtime:build=1.4.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player`.
No se persistieron raw, IDs ni PII. El resultado acredita adquisición, mapping,
runtime y ausencia correcta de telemetría rápida sin jugador. No acredita un
full Strategy con Fuel live en pista: esa validación continúa pendiente. Las
fixtures hash-pinned y el replay siguen siendo la evidencia obligatoria de
Fuel.

## Rollback

Revertir el commit de ISA-161 elimina el hub/ruta/wiring Strategy y restaura el golden pre-TC10B. No existe migración, persistencia ni cleanup externo.
