# Índice de ADR

Los ADR conservan decisiones y contexto técnico estable. Su ID es globalmente
único dentro de este directorio; el nombre y el título deben declarar el mismo
número. Enlaza siempre el path completo.

## Decisiones vigentes o propuestas

| ID | Decisión | Estado resumido |
|---|---|---|
| 0001 | [Rating de piloto LMU](0001-close-lmu-pilot-ratings.md) | Aceptada |
| 0002 | [Stack y workflow para agentes](0002-llm-first-stack.md) | Aceptada |
| 0003 | [Reconstrucción de Overlay Studio V3](0003-overlay-studio-v3-rebuild.md) | Aceptada |
| 0004 | [Arquitectura modular de Telemetry Core](0004-telemetry-core-modular-observation-architecture.md) | Aceptada para planificación |
| 0005 | [Capabilities y límites de Engineer](0005-engineer-projection-capability-contract.md) | Aceptada para implementación |
| 0006 | [Dominio unificado de Strategy Planner](0006-strategy-planner-unified-domain-and-ownership.md) | Aceptada |
| 0007 | [Autoridad operativa Linear del Testing Center](0007-testing-center-linear-operational-authority.md) | Aceptada para contratos locales |
| 0008 | [Polar como autoridad comercial](0008-polar-commercial-authority.md) | Aceptada; venta NO-GO |
| 0009 | [SQLite y MCAP para histórico](0009-historical-storage-sqlite-mcap.md) | Propuesta condicionada |
| 0010 | [Helper DuckDB fuera de proceso](0010-duckdb-helper-for-historical-telemetry.md) | Aceptada e implementada en rama |

## Decisiones legacy

| ID | Decisión | Regla |
|---|---|---|
| 0090 | [Modelo canónico de Telemetry Analysis](0090-legacy-telemetry-analysis-canonical-model.md) | Contexto legacy; no autoriza ejecución |
| 0091 | [Workspace de Telemetry Analysis](0091-legacy-telemetry-workspace-panel-layout-contract.md) | Contexto legacy; no autoriza ejecución |

No se reutilizan IDs ni se borran ADR antiguos. Una decisión nueva recibe el
siguiente ID libre; si sustituye otra, declara `Supersedes` o `Sustituye` y el
ADR anterior enlaza la sustitución.
