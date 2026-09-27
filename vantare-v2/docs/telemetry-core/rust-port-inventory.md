# ISA-1403 — Inventario del camino live para el port a Rust

Estado: inventario inicial contrastado con `355e9cfee2fec3c27341fa96ec4e6a9297fab730` el 2026-09-27. Este documento fija las fronteras para los primeros cortes; cada módulo se vuelve a contrastar con la base exacta de su issue antes de migrarlo. No acredita paridad ni rendimiento.

## Base y configuración observadas

| Elemento | Valor comprobado |
| --- | --- |
| Repositorio | `isaacalbala12/Vantare-Simracing-Suite`; raíz Git `Vantare-Overlays`, aplicación `vantare-v2/` |
| Rama aislada | `vantareapp/isa-1403-rust-telemetry` |
| HEAD/base | `355e9cfee2fec3c27341fa96ec4e6a9297fab730` = `origin/nightly` local al inventariar |
| Issue | [#1403](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1403), `area:telemetria-core`, Project Vantare `In Progress` |
| Herramienta local | Rust/Cargo 1.95.0, target `x86_64-pc-windows-msvc`; Go instalado. R04 fija esa versión en `rust-toolchain.toml`. |
| Selección de fuente | `resolveTelemetrySimulator` elige LMU salvo `Simulator` explícito o flag diagnóstico `TelemetrySimXDriver`; este último está apagado por defecto. |
| Estrategia live | `StrategyPublicTransport` apagado por defecto; la proyección/Hub solo se crea si se activa. |
| Overlay | `OverlayFrameV2Shadow` activado por defecto; `publishOverlayV2` comprueba consumidor antes de construir frame. |
| Engineer | Puerto asíncrono por defecto; `EngineerFactQueueCapacity` usa 64 si no se configura. |

El árbol versionado de esta base no contiene `docs/roadmap/plan.md`, `docs/roadmap/roadmap.json` ni `.github/scripts/roadmap_digest.py`: #1380 los retiró. Las instrucciones explícitas de Isaac piden ese archivo como roadmap manual, mientras esta base describe publicación Supabase. Se registra como conflicto de destino documental para resolver antes de un PR que cambie rumbo público. No se reconstruye contenido histórico ni se afirma que el roadmap esté actualizado.

## Recorrido y propietario futuro

| Símbolo o frontera en Go | Archivo de autoridad actual | Propietario tras el port | Consumidor y prueba protectora |
| --- | --- | --- | --- |
| `NewTelemetryCoreRuntime`, `Start`, `Stop` | `internal/app/telemetry_core_runtime.go` | Go: host, supervisor, estado de fuente, entrega y rollback exclusivo | Wails/Overlay/Engineer; `telemetry_core_runtime_*_test.go`, `commit_boundary_test.go` |
| `DefaultTelemetrySimulator`, `resolveTelemetrySimulator` | `internal/app/telemetry_simulators.go` | Rust: registro LMU productivo; Go: selector temporal Go/Rust y supervisor hasta retirada | Driver; `telemetry_simx_proof_test.go` protege neutralidad a reemplazar con driver Rust solo de test |
| `Driver.Run`, `readStable`, `Parse`, `runREST` | `internal/telemetry/drivers/lmu/{driver,reader,format,rest}.go` | Rust: único owner productivo LMU SHM/REST y parser | Mapper/fusión; `driver_test.go`, `reader_test.go`, `layout_test.go`, `format_test.go`, `rest_test.go`, `runtime_integration_test.go` |
| `Fusion.Merge`, `AuthorityMatrix` | `internal/telemetry/drivers/lmu/fusion.go` | Rust: fusión por campo y epoch | Mapper; `fusion_test.go`, `strategy_signal_audit_test.go` |
| `BatchMapper.WriteObservation` | `internal/telemetry/drivers/lmu/batch_mapper.go` | Rust: identidad de sesión/slot y Batch canónico | Core; `batch_mapper_test.go`, `identity_grace_test.go`, `batch_mapper_s31_bench_test.go` |
| `Reducer.Prepare/Commit`, `SessionCoordinator.Prepare/Commit`, `Pipeline.Prepare/Commit`, `TelemetryEngine.Apply` | `internal/telemetry/{core,derive,engine}/` | Rust: estado, facts, derivaciones y commit único | Tres productos; `engine_test.go`, `commit_boundary_test.go`, tests de reducer/coordinator/derive |
| `ProjectV1`, `ObservationSnapshotV1`, `FactEnvelopeV1` | `internal/telemetry/projection/engineer/` | Rust: construir valores compatibles; Go: puerto y lógica Engineer/Spotter | `internal/app/engineer_port.go`; `adapter_test.go`, `fact_cursor_test.go`, `fact_resync_test.go`, `engineer_port_fact_resync_test.go` |
| `NewCachedProjector`, `FrameV2`, `UpdateV2` | `internal/telemetry/projection/overlayv2/` | Rust: campos y cadencias de proyección; Go: publicación y adapters Wails/OBS | `internal/app/telemetrytransport/publisher.go`; tests `builder_*_test.go`, `telemetry_core_overlay_v2_test.go` |
| `strategy.ProjectV1` | `internal/telemetry/projection/strategy/v1.go` | Rust: proyección live bajo demanda; Go: Hub y producto Strategy | `strategy/v1_test.go`, `strategy_live_runtime_test.go` |
| `runtimeBatchSink.WriteBatch` | `internal/app/telemetry_core_runtime.go` | Rust: aplicación y proyecciones; Go: validar IPC, estado, entrega y métricas de frontera | Overlay/Engineer/Strategy; `telemetry_core_runtime_consumer_test.go`, `telemetry_core_runtime_failure_policy_test.go` |
| `schema`, `projection/contracts`, generador TS | `internal/telemetry/schema/`, `internal/telemetry/projection/contracts.go`, `tools/telemetry-contract-gen/` | Go: contrato externo y generación TS durante el port; Rust: conformidad de payload | Frontend `src/generated/telemetry.ts`; tests de contratos y typecheck |

## Contratos, ritmos y límites que el port debe preservar

- El mapping LMU `LMU_Data` tiene `ObjectSize=324820`, scoring desde 2192 con stride 584, telemetría desde 128468 con stride 1888 y máximo **104** filas según `layout.go`. Los offsets admitidos forman una allowlist; bytes no documentados no se infieren.
- `readStable` compara snapshots completos con un máximo por defecto de **3** comparaciones. Error de lectura incoherente degrada la fuente; error de tamaño incompatible es distinto. La adquisición SHM nominal es **60 Hz**; la frescura SHM caduca a **500 ms** y requiere ventana de recuperación de **2 s**.
- REST tiene intervalo **250 ms**, deadline **750 ms**, TTL **2 s** y backoff máximo **2 s** por defecto. REST complementa campos permitidos, no crea filas ni identidad; el `AuthorityMatrix` productivo es versión **6**.
- El host publica status cada **100 ms** y watchdog por defecto tras **1 s** sin frame aceptado. El rate se calcula con ventana de **2 s** y un máximo de **2048** muestras.
- `TelemetryEngine.Apply` prepara reducer, coordinador y derive antes de cualquier commit. Estado, facts y cursor proceden de una sola aplicación aceptada; errores posteriores de un consumidor no revierten el commit.
- El contrato canónico usa `CanonicalVersionV1=1`. Overlay V2 usa `FrameV2`/`UpdateV2`; Engineer consume status, observaciones, facts y límites de resync por rutas distintas. Snapshot latest-wins no puede sustituir la entrega ordenada de facts.
- La demanda y el rendimiento efectivo regulan la construcción de secciones de Overlay antes de serializar. Strategy live permanece condicionado; no se activa para facilitar un benchmark.

Los valores anteriores provienen de las constantes/constructores de la base. En R03 el banco fija además configuración efectiva, consumidores activos y frecuencia observada de cada corrida; el valor nominal de 60 Hz no es una medición de sesión real.

## Datos y exclusiones

- `testdata/lmu-fixture.bin` es un snapshot real estático de 44 coches con SHA-256 `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`. Ni este archivo ni `BenchmarkEngineApply104` son un corpus temporal real de 44/104 para el gate. R02 requiere secuencias SHM y REST acreditadas con procedencia, tiempos, hashes y sanitización.
- `internal/telemetry/derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl` contiene 1846 muestras reales a 10 Hz y SHA-256 `d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`; su allowlist solo cubre reloj, vuelta, distancia, velocidad, InPit y calidad. Sirve para derivaciones de delta, pero no para paridad de la ruta completa ni el gate 44/104.
- `internal/telemetry/projection/analysis/`, `internal/telemetry/recording/`, SQLite, importadores, DuckDB y `SessionCatalog` siguen en Go. No borrar sus dependencias compartidas al retirar código live.
- SimX Go sigue sirviendo las pruebas existentes durante la transición; no se distribuye un segundo driver productivo Rust. Un driver Rust mínimo solo de pruebas tendrá que reemplazar la garantía arquitectónica antes de retirarlo.
- El host Go, Wails, bridges, producto Engineer/Spotter, Strategy, política de rendimiento, transporte y contrato externo TS permanecen. El único owner de LMU será el backend seleccionado al arranque; el modo candidato no duplica lectores.

## Salidas para los siguientes cortes

1. R02: inventariar si existe una secuencia temporal real utilizable; crear manifiesto que falle si faltan 44 o 104 y herramienta de captura sanitizada, sin fabricar datos.
2. R03: fijar oráculo por etapas y banco Go actual/equivalente antes de comparar Rust. Conservar versiones y hashes de payload y configuración.
3. R04: ejecutable Rust mínimo y contrato IPC. No conectarlo a LMU ni activar selección productiva hasta conformidad, seguridad de pipe y lifecycle.
