# Fase 4 — Inventario para decidir (ISA-1429)

Referencia técnica: [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429).
Base del worktree entregado: `abcf10acdbb6500eabdbb88f20e6ed568bb484e4`.
Fecha: 2026-09-30. Worker Codex; review del orquestador Opus 5.5 pendiente.
Notion no disponible: excepción explícita de Isaac para este encargo. No se
declara seguimiento Notion completado. Sin red, push, PR ni merge.

## Lo que existe y lo que decide

| Frontera | Evidencia del checkout (ruta:línea) | Decisión para el porte |
| --- | --- | --- |
| Adquisición y estado | `docs/adr/0004-telemetry-core-modular-observation-architecture.md:31`, `internal/telemetry/core/reducer.go:135`, `internal/telemetry/engine/commit.go:12` | Consumir la foto canónica; no otro lector LMU ni I/O en adquisición. |
| Proyección de análisis | `internal/telemetry/projection/analysis/v1.go:1`, `:33`, `:60` | Deprecada como live, sin consumidor; conserva referencia post-sesión separada del core. No acredita análisis en directo integrado. Portar solo señales disponibles, calidad y SI. |
| Contrato de grabación Go | `internal/telemetry/recording/contracts.go:74`, `:86`, `:146` | Observaciones/facts versionados, presencia explícita, epoch/secuencia y límites; no incorporar nombres, SteamID ni raw. |
| Cola y fallo | `internal/telemetry/recording/coordinator.go:113`, `:159`, `:280`, `:625` en `sqlite/store.go` | TryAccept no espera al writer, saturación marca incompleto; distinguir aceptación volátil de watermark persistido. |
| Store actual | `internal/telemetry/recording/sqlite/store.go:492`, `:625`, `:995` | SQLite guarda chunks, observed_records y facts. No es el esquema DuckDB de LMU; no modificar ni migrar originales en esta fase. |
| Wiring actual de SQLite | `internal/app/diagnostics_bridge.go:120`, `:135` | Solo reader diagnóstico; no acredita grabación live del producto Go. |
| Importación histórica | `internal/telemetryanalysis/contract.go:78`, `:111`, `internal/app/telemetry_analysis_service.go:212`, `:292`, `:423`, `:567` | Discovery, autorización, hash/estabilidad, staging, Open/ReadPage/Close y shutdown. No trasladar importación de ficheros externos sin su frontera de confianza. |
| Esquema histórico LMU | `internal/telemetryanalysis/testdata/lmu-duckdb-schema-v1.json:1`, `internal/telemetryanalysis/historical.go:141`, `:158`, `:218`, `:486` | metadata/channelsList/eventsList, canales continuos por frecuencia y eventos timestamped. No asumir origen común de tiempo ni transformar ausencia en cero. |
| DuckDB productivo Go | `tools/vantare-telemetry-reader/reader.go:50`, `:72`, `:109`, `:301` | Helper read-only, 2 threads, 256 MB, extensiones/red desactivadas, consultas acotadas. No puede escribir las nuevas series. |
| Aislamiento DuckDB | `docs/adr/0005-duckdb-helper-for-historical-telemetry.md:30` | No incrustar CLI, no bindings manuales, helper/DLL fijados y verificados. El proceso no equivale a sandbox. |
| Historia de almacenamiento | `docs/adr/0005-historical-storage-sqlite-mcap.md:13`, `docs/telemetry-core/storage-benchmark-isa-101.md:10` | Restricciones Go/CGO de aquella comparación; ADR 0099 elige DuckDB para el destino Rust. No heredar sus cifras como presupuesto nativo. |
| Cálculo histórico Go | `internal/telemetryanalysis/lapvalidity.go:124`, `internal/telemetryanalysis/consumptionpace.go:103`, `internal/telemetryanalysis/derivedcurves.go:124` | Validez/fronteras, consumo/ritmo, curvas con identificabilidad y procedencia. No inferir duración total de una vuelta parcial, ni consumo sin señales de recurso. |
| UI Wails | `frontend/src/hub/telemetry-orbit/telemetry-orbit-source.ts:39`, `TelemetryOrbitPage.tsx:64` | Fuente real devuelve vacío y demo está marcada sintética; la UI no prueba integración histórica. Hub queda en fase 5. No hay `app*.go` en la raíz del módulo: composición en `internal/app`. |
| Series nativas existentes | `native/runtime/src/flows/series.rs:4`, `:18`, `:88`, `flows/README.md:69` | v1 del jugador; vuelta activa y última sellada, 18.000 muestras, calidad y hueco. Ampliar entrega incremental sin duplicar modelo. |
| Núcleo nativo | `native/runtime/src/core/mod.rs:97`, `:110` | Ya llama Series sobre fotos aceptadas/obsoletas; basta un enganche de configuración, sin tocar adaptadores, IPC ni domain/model.rs. |

## Dependencias y límites encontrados

- Workspace nativo: domain, runtime, ipc, ui. Runtime ya tiene serde_json,
  arc-swap, flate2 y sha2. No tiene duckdb/libduckdb-sys en Cargo.lock ni en
  la caché local de crates inspeccionada.
- El host tiene DuckDB CLI 1.5.3 y Python duckdb. No son runtime Rust
  redistribuible del producto. No se añade un backend Python/CLI para eludir
  ADR 0005 ni se descarga un crate bajo la prohibición de red del encargo.
- ADR 0099 §2 exige bloques durante la vuelta, buffers acotados sin recording,
  huecos explícitos y persistencia fuera de adquisición. §7 separa cálculo de
  escritura crítica. La API actual no entrega bloques a otro propietario.
- Corpus real de 47 coches no cierra vueltas; el fixture LMU real aporta
  muestras y los cierres se prueban con observaciones sintéticas declaradas.
- Presupuestos absolutos de adquisición/latencia/frame time con journal y
  series activos no están ratificados en este encargo. Un test local de carga
  demuestra acotación y ausencia de espera al consumidor; no LMU/OBS físico.

## Alcance del microplan siguiente

Series incrementales y consumidor único acotado, codec validado y cálculos
puros de cobertura y señales disponibles. Persistencia DuckDB condicionada a
disponer de bindings/runtime Rust fijados sin vulnerar la restricción de red.
No se cambia almacenamiento Go, originals, UI, cuentas, red ni IPC.
