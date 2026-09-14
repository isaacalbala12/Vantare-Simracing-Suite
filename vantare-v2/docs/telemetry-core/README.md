# Telemetry Core

Entrada técnica contrastada con nightly del 2026-09-14. El [handoff](../vantare-program/handoffs/telemetry-core.md) conserva continuidad técnica; la tarea/proyecto en Notion contiene alcance y estado. El [maestro del 3 de septiembre](../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md) sustituye los órdenes de retirada anteriores.

## Camino actual

[telemetry_core_runtime.go](../../internal/app/telemetry_core_runtime.go) conecta las fuentes y construye `TelemetryEngine`. [engine.go](../../internal/telemetry/engine/engine.go) coordina preparación y commit canónico. Los consumidores leen el resultado aceptado; no poseen un reader independiente.

- [Drivers y autoridad LMU](lmu-authority-matrix.md).
- [Proyecciones](runtime-projections.md): Overlay V2, Engineer y Strategy según su contrato y wiring.
- [Transporte Go](projection-transport.md) y [TypeScript](typescript-projection-contract.md).
- [ADR 0008](../adr/0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md): frontera de commit y aislamiento.

## Histórico y diagnóstico

SQLite local y el reader DuckDB post-sesión tienen papeles distintos. No inferir recording live de la existencia de una dependencia o un store:

- [ADR SQLite/MCAP](../adr/0005-historical-storage-sqlite-mcap.md).
- [ADR helper DuckDB](../adr/0005-duckdb-helper-for-historical-telemetry.md).
- [ADR capabilities Engineer](../adr/0005-engineer-projection-capability-contract.md).
- [Diagnóstico y exportación sanitizada](inspector-privacy-diagnostic-export-isa-104.md).
- [Analysis post-sesión](../vantare-program/research/telemetry-analysis/README.md).

`evidence/`, los baselines y las entregas ISA fechadas conservan observaciones de su build, no una certificación de la actual. [Inventario documental](../documentation-inventory.md).

[Contrato histórico completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/telemetry-core/README.md). Sus resultados y su wiring corresponden al corte que declara.
