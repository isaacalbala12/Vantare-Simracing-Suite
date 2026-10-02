# Diseño de Vantare: Hub y overlays

Esta es la entrada técnica de diseño. La [marca](BRAND.md) mantiene identidad y voz; el [contrato de producto](vantare-program/product-contract.md) decide alcance. No deducir funciones implementadas de un HTML o una captura.

## Hub: Command Orbit

Usar el [paquete Orbit v0.3](design/orbit-v03/README.md), sus [contratos de componentes](design/orbit-v03/12-contratos-componentes.md) y [checklist visual](design/orbit-v03/11-qa-checklist.md). La dirección Orbit sustituye el shell v5.

Fuentes productivas:

- [orbit.tokens.css](../frontend/src/styles/orbit.tokens.css): tokens del Hub.
- [vantare-orbit.json](../frontend/src/themes/vantare-orbit.json): tema.
- [ui/orbit](../frontend/src/ui/orbit/): componentes compartidos.
- [handoff Hub/Studio](vantare-program/handoffs/overlays-launcher-hub.md): decisiones y evidencia por corte; Notion contiene la siguiente tarea.

Los HTML y tokens de `docs/design/` son referencias de diseño. Para cambiar lo que muestra la app, editar la fuente productiva correspondiente y verificarla; no asumir sincronización automática entre ambas copias.

## Overlays: autoría directa

Usar la [guía Workshop](overlays-studio/overlay-workshop-authoring-guide.md). [WidgetVisualHost](../frontend/src/overlay/core/WidgetVisualHost.tsx) es la frontera común para Studio, Desktop, OBS y Workshop. El [catálogo oficial](../frontend/src/overlay/design-systems/official-designs.ts) y los [manifests y tokens](../frontend/src/overlay/design-systems/) indican sistemas, diseños y compatibilidad existentes.

Los renderizadores reciben ViewModels puros; no leen persistencia, permisos, Wails/SSE ni posición. Editar el TSX/CSS productivo; HTML es referencia visual. Mantener estados de datos y ausencia de datos distinguibles y validar la superficie afectada.

## Verificación

Los scripts exactos están en [package.json](../frontend/package.json); la preparación está en [operaciones](operations.md) y [pruebas](testing-strategy.md). Elegir el protocolo Orbit o Workshop correspondiente. Una captura del prototipo no demuestra paridad del runtime.

## Referencia histórica

El inventario anterior mezclaba tokens, componentes retirados, tres sistemas antiguos y pendientes de normalización. Se conserva [completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/DESIGN.md). Sus rutas y recuentos no son instrucciones para reconstruir código eliminado.
