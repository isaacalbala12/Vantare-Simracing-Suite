# Arquitectura de la aplicación actual

Contrastada con `nightly` del 2026-09-14. Describe código y fronteras; no certifica una release ni resultados de rendimiento.

```text
Hub y Studio (React/TypeScript)
        ↕ Wails
cmd/vantare → servicios internal/app
        → Telemetry Core → proyecciones por consumidor
        → Engineer, Strategy, Analysis, perfiles y servicios de plataforma
        → servidor HTTP/SSE local → OBS
```

## Fronteras

- [cmd/vantare/main.go](../cmd/vantare/main.go) construye y conecta la aplicación Wails y sus servicios.
- [internal/app](../internal/app/) coordina ciclo de vida, puentes, perfiles y transporte. El dominio y los lectores permanecen en paquetes propios.
- [Telemetry Core](telemetry-core/README.md) reúne LMU shared memory y REST. Las superficies consumen proyecciones; no crean lectores propios. El contrato Overlay actual es V2.
- [Engineer](../internal/engineer/), [Strategy](../internal/strategy/) y [Analysis](../internal/telemetryanalysis/) tienen responsabilidades y almacenamiento definidos en sus contratos. Análisis histórico no es un segundo reader live.
- [internal/server](../internal/server/server.go) sirve perfiles, overlay y eventos locales. `ValidateAddr` solo acepta loopback. No hay receta LAN operativa.
- [frontend/src/hub](../frontend/src/hub/) organiza las pantallas; [frontend/src/overlay](../frontend/src/overlay/) contiene el renderizado.

## Overlay Studio y runtime

Studio es un editor único de layout, contenido, comportamiento y apariencia. La división antigua `WidgetStudio`/`LayoutStudio` ya no define el producto. [StudioRoute](../frontend/src/hub/overlay-studio/StudioRoute.tsx) contiene editor, perfiles propios, recomendados y comunidad.

[WidgetVisualHost](../frontend/src/overlay/core/WidgetVisualHost.tsx) es la frontera de renderizado compartida por Studio, Desktop, OBS y Workshop. Los renderizadores reciben ViewModels; no gestionan persistencia, permisos, transporte o colocación.

[StudioProvider](../frontend/src/hub/overlay-studio/state/studio-provider.tsx) coordina documento e historial. Los cambios confirmados se guardan mediante autosave serializado; el drag/resize usa preview imperativa y confirma al terminar el gesto. Ver [ADR 0003](adr/0003-overlay-studio-v3-rebuild.md), su enmienda de [autosave ADR 0093](adr/0093-overlay-studio-autosave-history.md) y [contrato del canvas](overlays-studio/canvas-drag-imperative-preview.md).

## Fuentes de realidad

- Manifiestos: [go.mod](../go.mod), [frontend/package.json](../frontend/package.json), lockfile y configuración de CI.
- Decisiones: [expediente](vantare-program/README.md), ADR y contrato adoptado por la tarea Notion.
- Comportamiento: código conectado, pruebas y evidencia real de la build concreta.

La presencia de tests, maquetas, adapters o un plan no demuestra soporte completo de un simulador. Los precios y accesos se consultan en el contrato comercial y el canal, no se duplican aquí.
