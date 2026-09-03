# ISA-894 · R0 — inventario de retirada, no auditoría integral V2

Fecha 2026-09-03. Código `8e8ec17b2d2b660d717316c10925a6b93d073d1c`.
Writer `C:\tmp\vantare-v1-retirada-r0`, rama `vantareapp/isa-894-retirada-v1-r0`;
snapshot limpio al comenzar. Los tres Muse lectores trabajaron en snapshots
detached propios de esa base. Main contrastó los puntos de corte y corrige sus
inferencias abajo. No se modificó código ni se ejecutó una app.

Autoridad: [maestro](../../../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md).
KEEP conserva capacidad; MIGRATE traslada un consumidor a V2/auxiliar existente;
DELETE retira legado **tras** cumplir la dependencia indicada. BLOCKED señala
que no se permite borrar esa unidad hasta resolver su garantía. No se borran
carpetas ni todos los símbolos `v1`. Las rutas son relativas a `vantare-v2/`.

## 1. Alcance reproducible

```powershell
rg -n 'TelemetrySnapshot|snapshot\.scoring|adaptOverlayProjectionToSnapshot|derived-telemetry-store' frontend/src
rg -n 'overlayV1Emit|OverlayV1Emit|VANTARE_OVERLAY_V1_EMIT|overlayprojection\.ProjectV1|ProductOverlay\b' cmd internal pkg
rg -n 'telemetry:overlay:projection|telemetry:overlay:status|telemetry:overlay:fact|/telemetry/overlay/projection' frontend/src internal cmd scripts/bench
rg -n 'telemetry-shadow|telemetry-overlay-shadow-harness|telemetry-cutover-runtime-harness|overlay-projection-adapter' frontend scripts/bench -g '*.ts' -g '*.tsx' -g '*.mjs' -g '*.html' -g '*.json' -g '*.ps1'
rg -n 'telemetry-snapshot|telemetry-adapter|derived-telemetry-store|NewOverlayPullTransport' frontend/src cmd internal
```

La primera consulta limitada a `.ts/.tsx` devuelve 65 archivos y la segunda a
Go 23; incluyen tests, no equivalen a consumidores productivos. Se siguieron
imports/callers dinámicos además de nombres literales. Una búsqueda de
`subscribe("telemetry:overlay...` **no** demuestra ausencia: el observer construye
los nombres con `eventName`. Las filas siguientes cubren las fronteras y sus
consumidores; la equivalencia interna de unidades BLOCKED se resuelve en su corte.

## 2. Productor, transporte y contratos

| Unidad / ancla | Upstream → consumidores reales | Clase y condición | Prueba/garantía |
| --- | --- | --- | --- |
| `internal/app/telemetry_core_runtime.go:1037`, `ProjectV1` | Estado canónico + flag → `publishProjections` | DELETE después de cerrar consumidores V1 | Guard AST y tests de runtime; no tocar `strategyprojection.ProjectV1` vecino |
| Mismo archivo `:1445-1500`, `publishProjections` | V1 ready → `NewOverlayFull`, payload metrics, Hub, contador; Strategy por rama independiente | MIGRATE separar contrato vivo; DELETE sólo rama overlay V1 | Mantener aislamiento/fallos Strategy y publicación V2 por `publishOverlayV2` |
| Mismo archivo `:1518`, status; `:134,501,517` métricas | Flag → status Hub; contadores V1 y `Transport` compat → diagnóstico/banco/tests | MIGRATE diagnósticos, DELETE V1 | No sustituir métricas ausentes por cero para fabricar PASS; tests hardening/strategy/overlay_v2 protegen más que coexistencia |
| `internal/app/telemetrytransport/transport.go`, `ProductOverlay`, `NewOverlayFull` | Productor overlay → Hub/replay/envelopes | DELETE instancia/helpers/enum V1 cuando sin consumidores; KEEP `Hub` compartido como tipo | `transport_test.go`, `payload_ceiling_test.go` se migran semánticamente; Strategy sigue usando Hub |
| `internal/app/telemetrytransport/overlay_pull.go:48-157` | Hub V1 + registry V2 → servicio HTTP Wails por ventana | MIGRATE primero a registry V2 exclusivamente | Una entrega pendiente, replay, latest-wins, ACK, generación retirada y cierre |
| `cmd/vantare/main.go:2529-2542` | Runtime Hub/registry → ctor pull → servicio dirigido | MIGRATE junto a ctor | `TestOverlayPullHTTPServiceRespondsOnlyToTheRequestingWindowAndClosesConsumer` |
| `internal/app/telemetrytransport/adapters.go:58-104` | `SSEHandler(Hub)` → rutas overlay/Strategy | KEEP handler compartido; DELETE binding overlay V1, no SSE completo | Loopback, cancelación y paridad contractual V2 pull/SSE |
| `internal/server/server.go:208,233-250`; `main.go:2238-2256` | `OverlayProjection` → ruta overlay V1; Strategy/V2 separados | DELETE campo/wiring/ruta overlay después de migrar observer OBS | `telemetry_projection_test.go`; añadir negativo ruta V1 ausente, mantener Strategy/V2 |
| `main.go:731-780`, replay Wails | Registro sólo `ProductStrategy` | KEEP; no es lector overlay V1 | Cleanup/idempotencia/status Strategy |
| `internal/app/overlay_v1_emit.go`; `settings_service.go:230,537,831`; `main.go:2123` | Settings/env → runtime flag | DELETE al cerrar productor/consumidores; KEEP resto settings | Sin `VANTARE_OVERLAY_V1_EMIT` ni rollback escondido en binario final; preservación datos |
| `frontend/src/hub/settings/settings-contract.ts:81,94` | Contrato settings → preferencias/runtime | MIGRATE quitar sólo campo legacy | Contrato Go/TS y persistencia sin nueva migración irreversible |
| `tools/telemetry-contract-gen/main.go:266-312`; `frontend/src/generated/telemetry.ts` | Go tipos/enums → TS generado | KEEP generador; DELETE sólo registro de Overlay V1 y regenerar | `main_test.go`, `typescript_contract_test.go`; fixture `testdata/transport_contract_v1.json` todavía exige coexistencia |
| `frontend/src/telemetry-transport/contracts.ts`, `attach.ts`, `store.ts` | Envelopes/productos → observers overlay y otros productos | KEEP partes genéricas; DELETE producto overlay legacy al final | No borrar versión 1 compartida ni hechos de otro producto por el nombre |
| `frontend/src/overlay/projection/overlay-projection-v1.ts:169` | Envelope → decoder V1 → observer/comparator/tests | DELETE después de migrar importadores | Preservar validación de presencia/calidad/límites/unidades en V2 |
| `internal/telemetry/projection/overlay/v1.go`, tests/bench/goldens | Estado → contrato V1; fixtures mapper/recording/replay | DELETE código legacy después de migrar tests útiles | No borrar tests de adquisición/recording porque consuman este helper |
| `projection/strategy`, `projection/engineer`, `projection/analysis`; recording/replay | Core → productos independientes y archivo histórico | KEEP fuera del objetivo V1 overlay | Proyecciones versionadas propias; se auditarán en fase 2, no se reescriben aquí |

## 3. Consumidores frontend y empaquetado

| Unidad / ancla | Upstream → downstream | Decisión y protección |
| --- | --- | --- |
| `overlay/core/telemetry-snapshot.ts:7` | Tipo legacy (incluye tipos del derived store) → 18 view-models telemétricos y unidades de esta tabla | DELETE cuando todos los consumidores estén migrados; no sustituir por otro snapshot genérico |
| `core/widget-definition.ts:113-128`, `widget-registry.ts:60` | Builder legacy obligatorio → 20 definitions/assert del registro | MIGRATE juntos; definición V2/auxiliar sin perder inspector/layout/capabilities |
| `core/WidgetVisualHost.tsx:173-207` | V2 frame/source primero; auxiliar después; snapshot sólo rama harness | KEEP frontera única; DELETE rama snapshot después de migrar previews. Error/frescura/ausencia V2 siguen visibles, no fallback |
| `core/overlay-v2-view-models.ts:56-136` | Frame/source → 18 builders V2 | KEEP autoridad; las fixtures/imports legacy que aún arrastre deben migrarse, no borrar el registro |
| `core/telemetry-rate-coordinator.ts` | `publish(snapshot)`/derived store y `setOverlayFrame` V2 → superficies | MIGRATE quitar sólo API/historias legacy; KEEP scheduler, frame/source/context. No fusionar ni cambiar Hz oportunistamente |
| `core/overlay-v2-coordinator-binding.ts`, `overlay-runtime-context.ts` | V2 store → frame/source/revision/context → coordinador/visibilidad/inspector | KEEP. V2 ya alimenta widgets sin el observer V1 |
| `core/derived-telemetry-store.ts` | Snapshot → historias fuel/input/delta → coordinador | MIGRATE garantías de límites/reset a historias V2 ya existentes; BLOCKED su equivalencia interna antes de borrar |
| `core/telemetry-adapter.ts`, `transports/projection-telemetry-adapter.ts` | Estado/observación V1 → snapshot/coordinador/shadow | DELETE al retirar callers; conservar estado/errores/frescura a través del store V2 vigente |
| `transports/projection-observer.ts`; `projection/overlay-projection-adapter.ts` | Store envelope overlay → decode/adapt → callback | DELETE después de callers; los wrappers genéricos de transporte no se borran |
| `overlay/CompositeApp.tsx:52-104` | Pull → observer legacy/coordinador/shadow **y** binding V2 independiente | MIGRATE eliminar observer/shadow después de R1. Hay suscripción dinámica V1 real; no es autoridad visual productiva |
| `overlay/ObsOverlayApp.tsx:54-62` | SSE legacy para comparator + SSE V2 para visual | MIGRATE quitar legacy/SSE sólo después de demostrar lifecycle V2; R1 pull no lo cambia |
| `hub/overlay-studio/StudioRoute.tsx:358`; `studio-overlay-telemetry.ts` | Adapter legacy + pull + V2 store → Studio | MIGRATE lifecycle sin legacy conservando reset/reinicio, error/cleanup; tests StudioTelemetryProvider/runtime |
| `telemetry-transport/overlay-wails-pull.ts:6-12,194,260` | Respuesta Go → allowlist/listeners/contadores | KEEP temporal en R1: allowlist no demanda V1. DELETE nombres/contador en su corte TS/tooling; no falsear diagnóstico |
| `telemetry-transport/overlay-frame-v2-store.ts` | Contrato V2 → subscribers/generación | KEEP; sin cambio R1. Auditoría interna completa reservada fase 2 |
| `core/mock-scenarios.ts`; `authoring/fixtures/authoring-fixtures.ts` | Snapshot fixture → preview/Workshop/tests/harness | MIGRATE a fixture V2/auxiliar, conservando escenarios y geometría, no segundo renderer |
| `authoring/fixtures/authoring-v2-fixture.ts:10,43,75` | Puente snapshot.scoring → frame/source existentes | MIGRATE entrada legacy, KEEP semilla V2; no confundir prefijo v2 con ausencia de legacy |
| `hub/home-orbit/HomeMiniStage.tsx`, `hub/overlays/ProfilePreview.tsx`; `overlay/authoring/OverlayWorkshopDevRoute.tsx`; `overlay/edit/InPlaceWidgetEditFrame.tsx` | Fixtures + Host harness/runtime → previews | MIGRATE cada caller snapshot a runtime V2/auxiliar; preservar funcionalidades visibles y HMR |
| `ui-orbit-harness.tsx:482-493` | STAGE_SNAPSHOT → Host harness | MIGRATE fixture/runtime; `orbit-studio-harness.tsx` sólo crea widgets del registro → KEEP |
| `hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts` | Snapshot → único consumidor `StudioTelemetryProvider.test.tsx` | MIGRATE fixture/test; no mantenerlo empaquetado como compatibilidad |
| `widget-types/input-telemetry/input-telemetry-accumulator.ts`; `widget-types/shared/damage-reader.ts` | Snapshot → modelos legacy | BLOCKED antes de DELETE: inventariados callers, falta revisar equivalencia de historia/daño campo a campo en su corte |
| `telemetry-shadow/overlay-v2-features.ts` | Catálogo/generación V2 → Host, runtime, Studio | KEEP contrato productivo; separar el switch de rollback diagnóstico cuando toque, no borrar carpeta |
| `telemetry-shadow/overlay-v2-shadow-runtime.ts`, `overlay-v2-shadow-activation.ts` | Pareo legacy/V2 → diagnóstico, usados por Composite/OBS | DELETE al quitar callbacks. No son autoridad visual por llevar `v2` |
| `telemetry-shadow/overlay-shadow-comparator.ts`, sanitizer, fixtures S1 | Modelos legacy/V2 → assertions y evidencia | MIGRATE assertions útiles a pruebas de contrato/modelo V2, DELETE comparación de compatibilidad; conservar resultados históricos |
| `telemetry-overlay-shadow-harness/evidence.ts`, `TelemetryOverlayShadowHarness.tsx` | Fixtures duales → Host/evidencia | DELETE runtime exclusivo tras preservar tests/fixtures semánticos |
| `telemetry-cutover-runtime-harness/main.ts` | Adapter dual y espía `publish` → evidencia cutover | MIGRATE escenarios de lifecycle a V2; DELETE espionaje snapshot |
| `frontend/vite.config.ts:35-38`, `index.html`, `overlay.html` | Entradas build → bundles Hub/overlay | KEEP dos entradas productivas. Código legacy importado indirectamente aún se empaqueta: no basta excluir HTML harness |
| `frontend/package.json` scripts shadow/cutover y HTML harness respectivos | Dev scripts/HTML → harnesses anteriores | MIGRATE comandos útiles o DELETE exclusivos cuando sus garantías estén transferidas; no se consideran entradas productivas Vite |

Cada microplan posterior fijará el conjunto de archivos y tests antes de abrir
estos consumidores; las rutas de la tabla no autorizan limpiar toda su carpeta.

## 4. Catálogo completo (20 tipos)

Prefijo de archivos: `frontend/src/overlay/widget-types/<tipo>/`. Para los 18
telemétricos, `<tipo>-definition.ts` referencia builder legacy; la autoridad
vigente está en `<tipo>-view-model-v2.ts` registrada en `core/overlay-v2-view-models.ts`.
**MIGRATE** aquí significa definition/fixture, no rehacer el renderer ni el dominio.

| Tipo | Autoridad que permanece | Legacy y garantía de migración |
| --- | --- | --- |
| delta | V2 | MIGRATE builder/fixtures; ninguna prueba de vueltas/Delta LMU automática |
| standings | V2 | MIGRATE scoring; conservar semántica sesión, filas completas y Redline |
| relative | V2 | MIGRATE snapshot; conservar identidad de instancia, ventana/orden canónicos |
| pedals | V2 | MIGRATE controles y tests domain-free |
| broadcast-tower | V2 | MIGRATE scoring/posición |
| fuel-strategy | V2 | MIGRATE combustible/historia; ausencia no es cero |
| pedals-telemetry | V2 | MIGRATE historia y límites, conservar tests semánticos |
| pedals-telemetry-compact | V2 | MIGRATE historia/fixtures |
| racing-flags | V2 | MIGRATE flags/status; no introducir señal inventada |
| delta-trace | V2 | MIGRATE historia/fixtures |
| race-schedule | Calendar auxiliar | KEEP `buildAuxiliaryViewModel`; quitar wrappers `_snapshot` ignorado. Archivo `race-schedule-view-model-v2.ts` no está registrado: BLOCKED borrado hasta comprobar sus importadores/tests; no registrarlo oportunistamente |
| head-to-head | V2 | MIGRATE scoring; conservar pruebas de filas/datos ausentes |
| delta-advanced | V2 | MIGRATE modelo/fixtures |
| input-telemetry | V2 | MIGRATE historia de harness; BLOCKED quitar acumulador sin sustituir resets/límites |
| multiclass-relative | V2 | MIGRATE scoring; conservar tests de clase/orden/ausencia |
| track-weather | V2 | MIGRATE environment; conservar presencia/unidades |
| car-damage-visual | V2 | MIGRATE reader legacy; BLOCKED equivalencia daño antes de DELETE |
| car-damage-numbers | V2 | MIGRATE reader legacy; misma garantía |
| engineer-radio | Engineer auxiliar | KEEP canal y `buildAuxiliaryViewModel`; quitar wrappers `_snapshot` ignorado al cambiar definition |
| track-map | V2 | MIGRATE preview específico (`buildPreviewViewModel`) al runtime fixture V2; no perder geometría/tráfico |

Overrides del contrato snapshot: track-map, engineer-radio y race-schedule;
los otros 17 usan el builder básico en la rama harness. `authoring-fixtures`
especializa los auxiliares; esas fuentes no deben convertirse en telemetría falsa.
Los tests junto a cada modelo, `harness-fixtures`, `authoring-fixtures`,
`mock-scenarios`, `OverlayParityHarness`, `workshop-runtime-parity`, `official-designs`,
`profile-layout-conform`, `widget-aspect-contract`, `inspector-sections` y
`studio-catalog` son **MIGRATE/KEEP garantías**, no permiso de borrado de tests.

## 5. Tooling y guardias

| Unidad | Decisión |
| --- | --- |
| `internal/app/telemetrytransport/overlay_pull_bench_test.go` | MIGRATE a medición V2; después de R1 no etiquetar una medición como dual/V1. Conservar formas/cargas V2, techo y resultados históricos, no reimplementar pull antiguo dentro del benchmark |
| `scripts/bench/sesion-v1-resumen.mjs:187` y tests/colector `sesion-v1*` | MIGRATE/retirar propósito ON cuando desaparezca canal; hoy campo ausente → `Infinity`, no cero. R1 conserva shape diagnóstica; ON ya no puede acreditar V1 por Wails y debe declararse no aplicable, jamás PASS de paridad |
| `scripts/bench/build-measurement.ps1`, `huella*`, `Taskfile.yml` | KEEP build configurada/banco; limpiar referencias exclusivas al cortar tooling. No lanzar ni leer `.env*` en R0 |
| `docs/research/telemetry-architecture-2026/bench/*`, evidencia S1–S5 | KEEP resultados como historia. Código experimental que deje de compilar tras retirar tipos requiere aislarse/documentarse en su corte, no borrarse sin preservar resultados |
| `internal/app/overlay_v1_guard_test.go`, `overlay_v1_emit_test.go` | MIGRATE expectativas de coexistencia a ausencia cuando se retire productor; KEEP negativos contra emisión global |
| `frontend/src/overlay/core/v1-authority-guard.test.ts`, `transports/legacy-retirement.test.ts` | MIGRATE listas/expectativas sólo junto al cambio real, KEEP negativos de autoridad |
| Fixtures/tests que importan V1 desde drivers LMU, recording/replay o golden contract | BLOCKED borrado de helper hasta portar cada assertion semántica; no son productores adicionales |

## 6. Decisión de primer corte y límites

R1 propuesto: **pull Go V2-only**, dos archivos productivos (pull + ctor de main)
y cuatro archivos de tests/bench asociados. El registro V2, servicio HTTP,
contrato serializado y cliente TS permanecen. No añade abstracción ni hub opcional.
Detalles ejecutables en [R1](../../../superpowers/plans/2026-09-03-telemetria-v1-retirada-r1.md).

Main comprobó suscripciones dinámicas, Host V2/auxiliar, binding V2 independiente,
tests de ACK/cierre y el consumo del contador por el banco. Por ello corrige al
lector Go: sí existen listeners V1 productivos de diagnóstico, aunque no sean
autoridad visual. Su ausencia no pierde datos visibles; R1 debe probar que la
entrega V2 sigue intacta y no presentar el viejo banco ON como válido.

La clasificación está cerrada para seleccionar R1; las unidades BLOCKED no se
declaran listas para borrar. No se revisaron campo a campo todos los builders,
internos de V2 store, seguridad auth/instalador ni cada experimento histórico.
Eso no impide R1 (no los modifica), pero **impide declarar aquí retirada completa
o auditoría integral**. Cada próximo conjunto exige resolver su fila BLOCKED.

Lectores: frontend `ses_f97d0cf51ffeAeZYBKiE0ACNk9`, Go
`ses_f97d0bc82ffeF0g7zlxOmfPJPH`, compatibilidad
`ses_f97d0a6f5ffe8clDFCBlgrBxqZ`; todos sin cambios. Se rechazaron sugerencias de
paridad histórica obligatoria, borrado masivo de bench y conservación de shadow
por su prefijo. R0 no consume horas ni experimentos del bucle de fase 3.
