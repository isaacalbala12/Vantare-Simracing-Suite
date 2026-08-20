# Runtime fan-out — retirado

Estado: retirado en ISA-372/F4 por la decisión 7 del ADR 0008 aceptado el
2026-08-19.

`internal/telemetry/core.Fanout` nunca tuvo wiring productivo. El runtime real
publica Overlay y entrega Engineer in-process desde
`internal/app/telemetry_core_runtime.go`; no pasa por un fan-out genérico.
Strategy conserva su proyección y consumidor in-process, pero desde F7 no
instancia Hub ni expone Wails/SSE salvo rollback explícito con
`-strategy-public-transport`.

El contrato tipado `FactResyncRequiredError`, la retención acotada de facts y
la referencia al patrón latest-wins de canal cap-1 se conservan en
`internal/telemetry/projection/engineer/fact_resync.go` para que F7 conecte el
puerto asíncrono sin revivir el componente retirado.

La fuente aprobada de esta retirada es el ADR 0008, incluido en el expediente
SDD de ISA-372. La arquitectura modular base sigue documentada en
[ADR 0004](../adr/0004-telemetry-core-modular-observation-architecture.md).
