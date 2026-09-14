# Proyecciones por consumidor

Contrastado el 2026-09-14 con [telemetry_core_runtime.go](../../internal/app/telemetry_core_runtime.go) y [projection/](../../internal/telemetry/projection/). El [ADR 0008](../adr/0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md) define la frontera canónica.

```text
fuentes → TelemetryEngine (prepare/commit) → resultado aceptado
    → OverlayFrame V2 → Publisher → Studio / Desktop / OBS
    → Engineer (contratos de observación/radio y facts)
    → Strategy (builder/consumidor según wiring)
```

- **Overlay:** [overlayv2](../../internal/telemetry/projection/overlayv2/) define el frame compacto. `projection/overlay` v1 está retirado; no construir consumidores nuevos sobre él.
- **Engineer:** [contrato de capabilities](../adr/0005-engineer-projection-capability-contract.md), [rework](../engineer/rework-spec.md) y servicio actual. No asumir que un tipo de transporte implica exposición SSE.
- **Strategy:** [projection/strategy](../../internal/telemetry/projection/strategy/) conserva su contrato live. La [proyección histórica desde Analysis](../strategy-planner/f1-2-contrato-proyeccion-v2.md) tiene ownership y versión independientes; no son intercambiables.
- **Analysis:** consultar [contratos post-sesión](../vantare-program/research/telemetry-analysis/README.md); el esquema anterior con cuatro ProjectorV1 no describe el runtime actual.

## Reglas que se mantienen

Core conserva su estado privado y raw. Cada producto recibe su contrato; presencia, calidad y procedencia se preservan sin inventar valores. Versión canónica, versión de proyección, recording, perfil y aplicación son conceptos independientes. La disponibilidad se decide con el wiring y las capacidades de la fuente.

El transporte se describe en [Go](projection-transport.md) y [TypeScript](typescript-projection-contract.md). No trasladar cifras o resultados de la etapa v1 a la build actual.

[Contrato histórico completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/telemetry-core/runtime-projections.md). Sus resultados y su wiring corresponden al corte que declara.
