# ISA-894 — inventario de consumidores Overlay V1

Base estática: `origin/nightly@8b4a7e4f`. La clasificación distingue código
físicamente presente de autoridad productiva: F9/corte 1 no borra la pila V1,
pero ningún renderer productivo puede seleccionarla.

## Inventario estático

| Frontera / consumidor | Referencias auditadas | Veredicto | Motivo observable |
| --- | --- | --- | --- |
| Construcción Go de `overlayprojection.SnapshotV1` | `internal/app/telemetry_core_runtime.go` (`overlayprojection.ProjectV1`) | `comparador-diagnóstico` | Único productor V1; corte 1 lo deja detrás de `overlayV1Emit`. V2 se proyecta y publica por separado. |
| Hub Overlay V1 | `internal/app/telemetrytransport/transport.go`, `TelemetryCoreRuntime.Hub()` | `comparador-diagnóstico` | Retiene status/full V1 solo para rollback y comparación; no es autoridad visual tras #941. |
| Pull Wails dirigido | `internal/app/telemetrytransport/overlay_pull.go`, `frontend/src/telemetry-transport/overlay-wails-pull.ts` | `comparador-diagnóstico` | La misma sesión puede transportar V1+V2; con V1 apagado solo entrega V2. No usa `Event.Emit` global. |
| SSE `/telemetry/overlay/projection` | `internal/app/telemetrytransport/sse.go`, `frontend/src/overlay/transports/projection-observer.ts` | `comparador-diagnóstico` | OBS conserva el lector para shadow/rollback; el renderer usa `OverlayFrameV2`. |
| Adaptador `adaptOverlayProjectionToSnapshot` | `frontend/src/overlay/projection/overlay-projection-adapter.ts`, `projection-observer.ts` | `comparador-diagnóstico` | Alimenta el snapshot legacy y el emparejamiento shadow; no decide ViewModels productivas. |
| Comparador V1/V2 | `frontend/src/overlay/telemetry-shadow/**` | `comparador-diagnóstico` | Es el único consumidor intencional del snapshot V1 cuando el interruptor está encendido. |
| `WidgetVisualHost` | `frontend/src/overlay/core/WidgetVisualHost.tsx` | `productivo` (V2/auxiliar), **no consumidor V1 productivo** | Desktop/OBS/Studio eligen builder V2 o canal auxiliar. `definition.buildViewModel(snapshot, …)` solo existe bajo `harnessMode && snapshot`. |
| Builders/readers legacy (`snapshot.scoring`, damage, histories, etc.) | `frontend/src/overlay/widget-types/**/*-view-model.ts`, `shared/*-reader.ts`, `core/derived-telemetry-store.ts` | `test/fixture` y `comparador-diagnóstico` | Permanecen físicamente por el corte 2 no autorizado. No tienen call-site de autoridad productiva. |
| Workshop, fixtures y escenarios mock | `frontend/src/overlay/authoring/**`, `frontend/src/overlay/core/mock-scenarios.ts` | `test/fixture` | Harness explícito de autoría/paridad, sin fuente live. |
| Harnesses de cutover/shadow | `frontend/src/telemetry-overlay-shadow-harness/**`, `frontend/src/telemetry-cutover-runtime-harness/**` | `test/fixture` | Evidencia reproducible; no se empaquetan como autoridad de Desktop/OBS/Studio. |
| Tests y goldens Go/TS | `*_test.go`, `*.test.ts(x)`, `testdata/**` | `test/fixture` | Contratos y regresiones deterministas. |
| `engineer-radio` y `race-schedule` | definiciones y ViewModels auxiliares | `productivo`, **no consumidor V1** | Engineer y Calendar son canales auxiliares cerrados; no leen V1 ni V2 telemétrico para su contenido. |

### Búsquedas reproducibles

```powershell
rg -n --glob '!docs/**' "TelemetrySnapshot|snapshot\.scoring|adaptOverlayProjectionToSnapshot" frontend/src internal cmd
rg -n "telemetry:overlay:projection|/telemetry/overlay/projection|Event\.Emit|EmitEvent" frontend/src internal cmd
rg -n "\.buildViewModel\(" frontend/src/overlay --glob '!**/*.test.*'
```

Resultado: **cero consumidores V1 con autoridad productiva**. La presencia de
tipos, readers y builders muertos no autoriza su borrado; pertenecen al corte 2.

## Inventario dinámico

Sesión real: LMU abierto, Spa, práctica, jugador en garaje; build
`bin/vantare-isa894.exe`, perfil `testdata/bench/huella-endurance-3.json`.
El contador `pull.receivedV1Projections` se incrementa al entregar el evento al
listener de la ventana y `receivedV2Snapshots` en la misma frontera. El tiempo
del request se mide desde el POST hasta procesar su respuesta.

| Estado | Ventana | V1 recibidos | V2 recibidos | Comparaciones shadow | Veredicto |
| --- | --- | ---: | ---: | ---: | --- |
| V1 ON (`VANTARE_OVERLAY_V1_EMIT=1`) | Desktop overlay | 8 | 5 | 5 frames / 14 diferencias | `comparador-diagnóstico`; sin autoridad visual |
| V1 OFF (defecto persistido) | Desktop overlay | **0** | 44 | 0 | V2 productivo; sin consumidor V1 |
| V1 OFF | Hub sin Studio Live | 0 (sin sesión pull) | 0 (sin sesión pull) | 0 | no consumidor |

Los totales cubren tres preflights live de 10 s por estado, conservados en
`ab-v1-off-runs/{on,off}-*-cdp.json`. ON confirma que el rollback construye y
entrega V1 al comparador. OFF completa 47 pulls, recibe cero V1 y 44 snapshots
V2; si recibiera un solo evento V1, el gate fallaría cerrado. Las 14 diferencias
ON (`speedKph`, `rows[].currentLapText`, `rows[].lastLapText`) reproducen los
mismos campos de #893: no son autoridad productiva, pero impiden afirmar paridad
cero y mantienen bloqueado el corte 2.

## Guardarraíles CI

```powershell
go test ./internal/app -run 'TestOverlayV1EmissionGuard' -count=1
corepack pnpm --dir frontend exec vitest run src/overlay/core/v1-authority-guard.test.ts --maxWorkers=2
```

El primero falla si aparece más de un `ProjectV1`, si proyección o status salen
de `overlayV1Emit`, o si código Go productivo reintroduce una emisión global V1.
El segundo conserva la única llamada a `definition.buildViewModel` bajo
`harnessMode && snapshot` y recorre todos los ficheros productivos de
`overlay/runtime` y `overlay/edit`: una nueva prop/import/call de autoridad V1
rompe el gate. Tests, fixtures y el comparador shadow permanecen permitidos.
