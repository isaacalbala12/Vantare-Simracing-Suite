# Mapa de módulos y fronteras

Revisión documental contra nightly del 2026-09-14. [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192) contiene alcance, dependencias de trabajo y estado. Este mapa describe responsabilidades; los handoffs conservan evidencia fechada y no son una segunda cola de tareas.

## Caminos de datos

```text
Fuentes LMU → Telemetry Core / TelemetryEngine
  ├─ Overlay V2 → Studio / Desktop / OBS
  └─ proyección Engineer → Engineer / Spotter / radio

Archivos históricos LMU → Telemetry Analysis / SessionCatalog
  └─ StrategyInputProjectionV2 → documento y cálculo Strategy

Cuenta / Billing → permisos de módulos y canales
Launcher → discovery, perfiles y procesos
Calendario → agenda y recordatorios
Roadmap editorial + manifiestos → app y comunicaciones verificadas
```

El camino live Strategy conserva `projection/strategy.SnapshotV1`, pero su construcción está condicionada por `StrategyPublicTransport`, desactivado por defecto en la composición de la app. No representa un consumidor live Strategy activo por defecto. La existencia del motor live no demuestra que esté conectado. Ver [runtime](../../internal/app/telemetry_core_runtime.go) y [composición](../../cmd/vantare/main.go).

El backend histórico de Analysis alimenta Strategy; la pantalla de Telemetría tiene su propia integración pendiente. Ver [fuente de la pantalla](../../frontend/src/hub/telemetry-orbit/telemetry-orbit-source.ts) y [handoff Analysis](handoffs/telemetry-analysis.md).

## Responsabilidades y entrada por módulo

| Módulo | Responsabilidad | Referencia técnica |
|---|---|---|
| Telemetry Core | Adquisición, tiempo, validez, fusión y proyecciones; sin UI ni recomendaciones | [Core](../telemetry-core/README.md) |
| Telemetry Analysis | Lectura/importación histórica, catálogo, métricas y proyecciones post-sesión; sin decisiones live | [Handoff](handoffs/telemetry-analysis.md) |
| Strategy Planner | Documento por evento, planificación y cálculo sobre inputs con procedencia | [Documento V2](../strategy-planner/f1-3-contrato-documento-v2.md), [handoff](handoffs/strategy-planner.md) |
| Engineer/Spotter | Hechos live, familias, prioridades, radio y voz según capacidades; sin reader LMU propio | [Handoff](handoffs/engineer-spotter.md) |
| Studio/Overlays | Editor único y render compartido; canvas espacial, inspector documental, visuales con ViewModels | [Studio](../overlays-studio/README.md) |
| Launcher | Catálogo, discovery, perfiles y ciclo de procesos | [Launcher](../launcher-v3-architecture.md) |
| Cuenta y Billing | Identidad, credenciales firmadas, acceso comercial y operativo separados | [Billing](../billing/README.md) |
| Hub, Calendario y ajustes | Navegación, agenda y configuración dentro de sus servicios | [Handoff plataforma](handoffs/platform-commercial.md), [Hub/Studio](handoffs/overlays-launcher-hub.md) |
| Distribución y roadmap | Versionado, artefactos, canales, notas de release y planning público | [Release](../release-beta-operations-runbook.md), [roadmap](../roadmap-maintenance.md) |
| Testing Center | Diagnóstico y flujos de soporte según su contrato y autorizaciones | [Handoff](handoffs/testing-center.md) |

Los módulos se integran mediante contratos versionados, sin leer el almacenamiento privado ni la UI de otro. Una flecha no declara disponibilidad pública ni aceptación en Windows. Contenido y marketing requieren una petición específica.

[Snapshot completo del 21 de agosto](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/vantare-program/project-map.md): conserva tablas de issues, bloqueos y orden de ejecución de aquel corte. No se mantienen como estado actual.
