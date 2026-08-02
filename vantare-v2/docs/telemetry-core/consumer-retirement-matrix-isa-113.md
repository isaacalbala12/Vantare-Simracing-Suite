# ISA-113 / TC-09A — auditoría final de consumidores

Fecha: 2026-08-01. Base auditada: ISA-112
`2fff97055096731f0456129d483fa05943f60d57`.

Estado: auditoría sin borrados ni cambios de comportamiento.

## Veredicto

El cutover funcional de Overlay y Engineer está hecho, pero el backend legacy
todavía es alcanzable desde el composition root. Con `-live`, la aplicación
abre actualmente dos adquisiciones LMU:

1. `app.New(true)` construye `TelemetrySourceManager`, abre
   `internal/telemetry/lmu` y arranca un poller REST legacy a 250 ms;
2. `TelemetryCoreRuntime.Start` abre el driver canónico, que posee su propio
   mapping único y REST complementario.

El primer grafo ya no publica widgets ni alimenta Engineer. Solo sobrevive para
estado de conexión, diagnóstico, métricas, el side effect de `deltaMode` y dos
handlers que intentan reconectar al abrir overlays. Es infraestructura
duplicada y debe retirarse en ISA-114 después de migrar esos consumidores.

Por tanto:

- ISA-114 está **habilitada**, pero debe comenzar por trasladar estado,
  diagnóstico y ops al runtime canónico;
- no se puede afirmar aún «una sola apertura productiva» a nivel de proceso;
- no hay una decisión humana ambigua: la arquitectura aprobada ya exige una
  única adquisición y los consumidores legacy tienen reemplazo canónico;
- ningún archivo se borra en ISA-113.

## Método reproducible

La evidencia se regenera desde la raíz `vantare-v2` con:

```powershell
./scripts/telemetry-core/audit-consumers.ps1
go list -e -deps -f '{{.ImportPath}}' ./cmd/vantare
rg -n "app.New\(|EnsureLiveTelemetry|TelemetrySource\(|SourceInfo\(" cmd/vantare internal/app
rg -n "telemetry:update|telemetry:source-status|/telemetry/stream" cmd internal frontend/src
```

El script distingue imports productivos de `cmd/vantare`, importadores no-test
y consumidores exclusivamente de tests. `-e` permite auditar el grafo en un
worktree nuevo antes de generar el `frontend/dist` ignorado; no convierte un
paquete con errores en aprobado y los builds se ejecutan aparte.

## Matriz backend Overlay legacy

| Candidato | Alcanzable hoy | Consumidor o evidencia | Decisión | Corte |
|---|---:|---|---|---|
| `internal/app/app.go` | Sí | `cmd/vantare/main.go:631` crea `vapp`; expone source/status/delta | DELETE tras mover sus cuatro consumidores | ISA-114 |
| `internal/app/telemetry_source_manager.go` | Sí | `NewTelemetrySourceManager` abre live dentro del constructor | DELETE; es el segundo owner de adquisición | ISA-114 |
| `internal/app/lmu_enriched_source.go` | Sí | combina reader legacy, REST, fusion y delta; `newLMURESTCache` inicia goroutine | DELETE completo | ISA-114 |
| `internal/app/telemetry_bridge.go` | No desde root | solo tests; ningún `NewTelemetryBridge` productivo | DELETE con sus tests | ISA-114 |
| `internal/telemetry/service` | Sí | tipo compartido por App, diagnostics, ops y Server; runtime no arrancado | MOVE metadatos necesarios y DELETE | ISA-114 |
| `internal/telemetry/lmu` | Sí | fuente legacy productiva y cuatro CLIs antiguas | DELETE reader/parser/synthetic; fixtures raíz quedan | ISA-114 |
| `internal/telemetry/lmuapi` | Sí | REST legacy desde enriched source/delta/fusion | DELETE; el driver canónico posee REST | ISA-114 |
| `internal/telemetry/normalizer` | Sí | solo grafo legacy | DELETE | ISA-114 |
| `internal/telemetry/fusion` | Sí | solo enriched source legacy | DELETE | ISA-114 |
| `internal/telemetry/gap` | Sí | solo service legacy | DELETE | ISA-114 |
| `internal/telemetry/diff` | Sí | service y bridge legacy | DELETE | ISA-114 |
| `internal/telemetry/pipeline` | Sí | solo service legacy | DELETE | ISA-114 |
| `internal/telemetry/delta` | Sí | `vapp.SetDeltaMode` y enriched source; salida ya no llega a producto | DELETE motor legacy; conservar setting sin afirmar wiring | ISA-114 |
| `pkg/models/telemetry.go` | Sí | contrato JSON exclusivo del grafo legacy y CLI antigua | DELETE paquete al quedar imports cero | ISA-114 |
| `cmd/lmu-test`, `cmd/lmu-dump` | No son producto | herramientas basadas solo en reader legacy | DELETE; driver canónico tiene capture/replay/tests | ISA-114 |
| `cmd/lmu-debug` | No es producto | compara modelos legacy; fixtures canónicas ya cubren D8/D9 | DELETE o reducir a herramienta canónica si queda utilidad demostrada | ISA-114 |

### Consumidores que deben migrarse antes del borrado

| Consumidor | Uso actual | Sustituto mínimo |
|---|---|---|
| `telemetry:source-status:get` | Hub y Studio piden `Live/Available` | snapshot de estado del `DriverManager` canónico |
| `DiagnosticsService` | source/live/available legacy | estado canónico sanitizado, sin payload |
| `RuntimeSampler` | copia estática de `service.SourceInfo` | provider/snapshot canónico pequeño |
| `overlay:start` y `overlay:start-active` | fuerzan `EnsureLiveTelemetry` legacy | el runtime canónico ya gestiona detección/reconexión; eliminar side effect |
| `settings:save` / `deltaMode` | muta únicamente el delta legacy inerte | conservar setting; no conectarlo a un motor retirado |
| log inicial | imprime source legacy | imprimir estado del runtime canónico |

`deltaMode` no tiene hoy un consumidor canónico. ISA-114 no debe fingir que lo
tiene ni borrar la preferencia del usuario: elimina únicamente el side effect
inerte y deja su semántica de producto documentada para el dueño de Delta.

## Matriz backend Engineer

| Candidato | Alcanzable hoy | Decisión | Motivo |
|---|---:|---|---|
| `internal/engineer/telemetry` | Sí | KEEP | modelo interno que todavía consumen los monitores y el adapter puro aprobado |
| `internal/engineer/projectioninput` | Sí | KEEP | frontera canónica -> monitores; no abre I/O |
| `internal/engineer/core` y monitores | Sí | KEEP | comportamiento del producto preservado |
| `internal/engineer/service/overlays_live_adapter.go` | No | DELETE | solo tests; parsea buffer legacy y no forma parte del servicio actual |
| `internal/engineer/telemetry/service` | No | DELETE | orquestador source/frame exclusivamente test; reemplazado por Telemetry Core |
| `internal/engineer/lmu/parser.go` y offsets base | Solo herramienta/adapter muerto | DELETE | parser paralelo sin consumidor productivo |
| readers Extended/PitInfo | Tipos referidos, I/O no instanciado | DELETE I/O y setters muertos | ninguna llamada productiva a `New*Reader`/`Open`; capabilities siguen disabled |
| wheel decoder experimental | Solo tests | DELETE o preservar solo fixture documental | offsets no probados no son funcionalidad |
| `internal/engineer/simulator` | No desde app | KEEP | harness explícito permitido por ADR; nunca fallback productivo |
| `internal/engineer/replay` | No desde app | KEEP | replay determinista y fixtures de paridad |
| `cmd/spotter-debug` | No es app | MOVE | conservar simulator/replay; retirar modo LMU basado en parser paralelo |
| `EngineerService.SetSource` | No productivo | DELETE | bridge selector ya retirado; solo lo prueban tests legacy |

La retirada de readers experimentales no reduce una capability productiva:
ISA-108/110 las clasifican unsupported/disabled y no existe instancia, `Open`
ni wiring. Los monitores activos siguen recibiendo el `Frame` interno desde
`projectioninput` hasta que el proyecto Engineer decida reemplazar ese modelo.

## Matriz frontend y transports

| Candidato | Consumidor productivo | Decisión | Corte |
|---|---|---|---|
| `telemetry:update` | ninguno válido; `OverlayApp.tsx` no es entrypoint | DELETE evento, bridge, componente y guard negativo | ISA-115 |
| `/telemetry/stream` | ninguno; OBS usa ruta de Projection v1 | DELETE handler/config/campo/tests legacy | ISA-115 |
| `wails-telemetry-adapter.ts` | solo presta el tipo `TelemetryAdapter` | MOVE el tipo a archivo neutral y DELETE adapter legacy | ISA-115 |
| `sse-telemetry-adapter.ts` | ningún import productivo | DELETE | ISA-115 |
| `normalizeLegacyTelemetry` | solo adapters legacy/tests | DELETE; mover tres factories de status a módulo pequeño | ISA-115 |
| `OverlayApp.tsx` | no importado por `main.tsx` | DELETE | ISA-115 |
| `telemetry:source-status` | Hub/Studio sí | MOVE al status canónico y retirar nombre legacy después del backend | ISA-114/115 |
| `projection-shadow-adapter.ts` | sí, es transporte productivo actual | MOVE/RENAME, no DELETE | ISA-115 |
| `telemetry-cutover-runtime-harness` | harness | KEEP hasta gate final | ISA-117 |
| comparador/matriz shadow | tests/evidencia | KEEP mientras proteja paridad; no runtime | ISA-117 decide archivo final |

No se cambia UI ni estilos. La forma `TelemetrySnapshot`, el coordinator, los
ViewModels y los renderers son contratos vigentes y se conservan.

## Fixtures, tests, scripts y documentación

- `testdata/lmu*.bin|json`: **KEEP**. Son fixtures sanitizadas hash-pinned que
  ya consume el driver canónico; no pertenecen al paquete legacy.
- `testdata/engineer-replay` e `internal/engineer/replay/testdata`: **KEEP**;
  protegen paridad de monitores.
- tests que solo prueban código borrado: **DELETE junto al candidato**, no se
  reescriben como tests complacientes.
- escenarios observables que protegen una función vigente: **MOVE** al driver,
  proyección o replay canónico antes de borrar el test original.
- documentos históricos: **KEEP** como evidencia con estado/fecha. Handoffs,
  current plan y ADR se actualizan; no se reescribe la historia.
- `scripts/telemetry-core/audit-consumers.ps1`: **KEEP** hasta ISA-117 y usar
  como gate negativo después de cada retirada.

## Orden obligatorio de ISA-114 y 115

1. Añadir tests de status/diagnóstico/ops contra runtime canónico.
2. Migrar esos consumidores y los handlers de overlay.
3. Demostrar una sola apertura LMU desde el composition root.
4. Retirar App/source/service/reader/REST/backend legacy y CLIs sin valor.
5. Ejecutar el script: candidatos backend deben dejar de ser alcanzables.
6. Extraer el tipo frontend neutral y migrar source status.
7. Retirar eventos, ruta SSE y adapters legacy.
8. Añadir búsquedas negativas de arquitectura.
9. Ejecutar suites globales y builds en cada corte.

## Riesgos y decisiones

- **P0 de migración:** dos adquisiciones LMU mientras sobreviva `vapp`.
- **P1:** el status visible del Hub/Studio procede del reader legacy, no del
  runtime que realmente alimenta Overlay/Engineer.
- **P1:** diagnostics y ops pueden declarar una fuente distinta de la real.
- **P2:** `deltaMode` persiste pero no gobierna el delta canónico.
- **P2:** nombres `shadow` sobreviven aunque el camino sea ya autoridad.
- **P3 heredado:** contención Windows de `app-settings.json.tmp` bajo repetición
  agresiva; no está relacionada con esta retirada.

No queda una decisión material pendiente para iniciar ISA-114. La regla es
migrar primero cada consumidor, probarlo y borrar después; nunca mantener un
shim sin consumidor ni abrir otra fuente para conservar un status.

## Rollback

ISA-113 es documental y de tooling. Revertir su commit vuelve exactamente a
ISA-112; no existe migración de datos ni cambio de runtime.
