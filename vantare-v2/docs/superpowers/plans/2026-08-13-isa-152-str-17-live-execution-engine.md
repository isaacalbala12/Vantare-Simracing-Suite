# ISA-152 / STR-17 — Motor de ejecución live

**Fecha:** 2026-08-13
**Issue:** ISA-152
**Base exacta:** `origin/nightly@b2e4067809d31152fdcf374875179e577d483c03`
**Rama:** `vantareapp/isa-152-str-17-motor-de-ejecucion-live-sobre-telemetry-core`
**Estado:** integrado en `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`

## Objetivo

Consumir `StrategyLiveProjection v1` desde el hub canónico de Telemetry Core y
mantener un read model efímero de la ejecución del plan activo: cursor,
progreso de stint, recursos demostrados, desviación respecto a objetivos
explícitos y próxima acción planificada.

## Arquitectura cerrada

- `internal/strategy/live` posee el motor puro y su read model. Puede importar
  el contrato público `internal/telemetry/projection/strategy`, pero no
  transporte, runtime, drivers ni almacenamiento de Telemetry Core.
- `internal/app` posee el adaptador al `telemetrytransport.Hub`. Recibe el hub
  ya creado; nunca abre Shared Memory, REST ni otro driver.
- El motor recibe un plan normalizado e inmutable. Los objetivos de Fuel por
  vuelta son explícitos: si no existe un objetivo exacto para el cursor actual,
  la desviación queda missing. No se interpola ni estima.
- Los snapshots son full/latest-wins. Una secuencia mayor puede saltar valores
  intermedios; duplicados exactos son idempotentes, un mismo cursor con bytes
  distintos es conflicto y cursores antiguos se rechazan sin mutar estado.
- Un epoch nuevo reinicia el progreso live y conserva la referencia del plan
  activo. Un epoch anterior nunca restaura datos viejos.
- Solo un campo `present + fresh` puede producir stint, recurso, desviación o
  próxima acción. `stale`, `missing`, `invalid` y capability ausente se
  conservan como estado explícito y nunca se convierten en cero.
- STR-17 informa la próxima acción del plan (`pit` o `finish`); no propone ni
  acepta replans. Eso pertenece a STR-18.
- El read model es defensivo, acotado y thread-safe. No persiste telemetría ni
  payloads del hub.

## Fuera de alcance

- UI Strategy, Wails/SSE nuevos y widgets.
- Replanificación, aceptación, Engineer/Pit Manager y comandos.
- Virtual Energy, tyres, weather o facts no publicados por TC-10B.
- Cambios al productor, al driver LMU, al repositorio Strategy o a contratos
  históricos.
- Dependencias nuevas.

## Task 1 — Dominio y read model puro

Crear `internal/strategy/live` con:

- plan normalizado: `ActivePlan`, stints con laps positivos y objetivos exactos
  opcionales de Fuel por vuelta completada;
- valores product-facing con estados `missing`, `fresh`, `stale`, `invalid` y
  `unsupported`, sin exponer ceros ausentes;
- read model inmutable/defensivo con cursor, estado de fuente, stint, Fuel,
  desviación y próxima acción;
- validación de capabilities, calidad, timestamps, unidades y límites seguros;
- tests RED/GREEN para cero válido frente a ausencia, plan inválido, stint y
  acción en fronteras, Fuel exacto y ausencia de objetivo.

Archivos esperados: solo `internal/strategy/live/**`.

## Task 2 — Máquina de cursores y lifecycle

Añadir al motor:

- aplicación atómica de un `StrategyLiveProjection v1` owned;
- duplicado exacto idempotente, conflicto de cursor, out-of-order, salto
  latest-wins y reset de epoch;
- estados de fuente `stopped/detecting/connecting/live/degraded/stale/error`;
- reconexión sin reutilizar valores viejos como fresh;
- snapshot defensivo para lectores concurrentes;
- replay table-driven y soak lógico sin `time.Sleep`.

Archivos esperados: solo `internal/strategy/live/**`.

## Task 3 — Consumidor del hub canónico

Crear un adaptador pequeño en `internal/app` que:

- recibe por inyección el hub Strategy existente y un motor;
- consume status y full snapshots, valida producto/versión/shape y llama al
  motor;
- bloquea en `Run(context.Context)` y no oculta goroutines;
- cierra su única suscripción en cancelación/error;
- demuestra backpressure latest-wins, reconexión, cierre y cero segundo reader;
- no añade endpoints, eventos UI ni otro runtime de telemetría.

Archivos esperados: `internal/app/strategy_live_runtime.go` y su test; cambios
adicionales exigen revisión del orquestador antes de editar.

## Task 4 — Evidencia y cierre

- Actualizar `docs/current-plan.md`, el handoff Strategy y
  `docs/strategy-planner/projection-ownership.md` con el estado real.
- Añadir evidencia STR-17 y fragmento de changelog solo si el cambio requiere
  prueba visible de testers.
- Revisión independiente de especificación primero y calidad después de cada
  corte; revisión final integral al terminar.
- Commit/push/PR draft y Linear. Sin promoción.

## Gates

```powershell
go test -count=20 ./internal/strategy/live
go test -count=20 ./internal/app -run 'StrategyLive|StrategyExecution'
go test -count=1 ./internal/strategy/... ./internal/app ./internal/app/telemetrytransport
go test -count=1 ./...
go vet ./internal/strategy/live ./internal/app
gofmt -l internal/strategy/live internal/app
git diff --check
```

`go test -race` se registra como pendiente si el host continúa con
`CGO_ENABLED=0` y sin GCC. No se declarará ejecutado sin evidencia real.

## Verificación manual

Con LMU en pista, reutilizar el probe sanitizado que ya demostró
`StrategyLiveProjection v1` con Fuel `present/observed/fresh`. La prueba de
STR-17 debe observar el mismo cursor en el read model, un stint/acción solo si
el plan aporta frontera válida y ninguna desviación cuando falta el objetivo
exacto. No se guardan raw, IDs de usuario ni PII.

## Cierre

La issue queda lista para review cuando los cuatro cortes pasan, no hay
hallazgos razonables abiertos y la rama posee commit, push y PR draft. Eso no
equivale a integración en `nightly`, promoción a `testers`/`master` ni release.

## Resultado local — 2026-08-13

- [x] Task 1: plan acotado, read model defensivo y derivación sin fallback.
- [x] Task 2: cursor, epochs, lifecycle, reconnect, replay y soak lógico.
- [x] Task 3: consumidor de una sola suscripción del Hub Strategy, compatible
  con productor v1 old/new y sin segundo reader.
- [x] Task 4 local: reviews independientes, evidencia LMU sanitizada y gates.
- [x] Publicar rama y abrir PR draft #219 hacia `nightly`.
- [x] Obtener CI del HEAD vigente publicado.
- [x] Actualizar Linear con commit/PR/CI finales.
- [x] Integrar por squash en `nightly` con autorización de Isaac.
- [x] Verificar el gate post-promoción del squash exacto.

Commits locales: `98104b0`, `3f48045`, `091f8ba` y `bf9e9e5`. La prueba
`TestStrategyLiveLMUOptIn` pasó con source live, cursor `1/3`, vuelta completada
`0` fresh, Fuel `98/115 L` fresh y desviación missing al no existir objetivo
Fuel. `go test ./...`, frontend build y frontend `367/2636` pasan. `-race`
continúa pendiente porque el host usa `CGO_ENABLED=0` y no dispone de GCC.

No se añadió wiring al arranque: el `ActivePlan` durable identifica una
revisión, pero no entrega el plan normalizado de stints y objetivos que exige
el motor. Crear datos sintéticos violaría ADR 0006 y queda fuera de STR-17.

La rama se publicó por primera vez en `c532c88`; su HEAD final `c5f965f` pasó
CI completo en 31720701167. El PR
[#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219) se
integró por squash en `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`
y el gate post-promoción 31748815965 pasó completo. Linear refleja `Nightly`.
No hubo promoción a `testers`/`master` ni release. El fallo separado del
Roadmap público sigue siendo la deuda heredada ya inventariada y no procede de
STR-17.
