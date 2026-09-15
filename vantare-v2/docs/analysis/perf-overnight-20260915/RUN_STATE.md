# RUN_STATE — Campaña de optimización medible nocturna

- **agente**: perf/orquestador
- **inicio_real**: 2026-09-15T01:30:00Z (aprox)
- **BASE_SHA**: f617467427f8d78f7432b4445d52be0c4dfe616a
- **rama_campania**: perf/overnight-20260915-0130
- **worktree**: /Users/isaacalbala/Desktop/Isaac Albala/vantare-perf-overnight-20260915
- **HEAD_final**: a5de341ef6d9032c4f99477a29785e75917ba47d
- **ultimo_commit_bueno**: a5de341ef6d9032c4f99477a29785e75917ba47d
- **experimento_actual**: ninguno (cierre)
- **limite_temporal_h**: 8
- **limite_experimentos**: 24
- **experimentos_realizados**: 2
- **experimentos_aceptados**: 2 (E1, E2)
- **experimentos_descartados**: 1 (array fijo en validateMapperObservation)
- **subagentes_activos**: 0
- **bloqueos**: Notion no accesible desde este harness (sin MCP de Notion); se conserva evidencia en Git y se comunica el bloqueo. No se dispuso de subagentes reales.
- **estado_campania**: READY_WITH_LIMITATIONS
- **siguiente_accion**: revisión adversarial por Astra High; reconciliar con rama anti-slop antes de promocionar.

## Resumen de experimentos

| id | area | métrica clave | delta | estado |
|---|---|---|---|---|
| E1 | telemetry (LMU BatchMapper) | allocs/op | -34,3 %; ns/op -29,2 % | accepted |
| E2 | overlay-studio (history equality) | mean ms/op isStudioHistoryDirty | -60,6 % | accepted |
| E2 | overlay-studio (commit no-op) | mean ms/op commitStudioCommand | -50,2 % | accepted |
