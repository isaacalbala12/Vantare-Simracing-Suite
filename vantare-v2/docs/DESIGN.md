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


## Wordmark oficial C2 · Compacta (#1504)

Isaac eligió C2 el 2026-10-08. El nombre usa los trazos SVG aprobados de
[build/brand/wordmark](../build/brand/wordmark/README.md), sin fuentes de texto.
La Λ es el símbolo aislado para la barra contraída y espacios pequeños.
Hay versiones color, blanco y negro; los lockups combinan Λ y nombre,
con color para fondo claro/oscuro y versiones a una tinta.

Conservar proporciones, geometría y espaciado. Altura mínima del wordmark:
16 px en pantalla o 4 mm impreso; recomendada en el Hub: 24 px (182,85 px de ancho).
Símbolo aislado: mínimo 16 px. Zona de respeto: media altura del wordmark
alrededor; en lockups, media altura de la Λ. Usar blanco sobre oscuro y negro
o casi negro sobre claro. Sustituye el logo con Rajdhani, sin alterar las
familias tipográficas de la interfaz.

El Hub nativo embebe el SVG directamente desde `build/brand/wordmark` en
`shell/assets.rs`; `orbit/kit.rs` lo tiñe con `skin.text1` según el tema,
también en DeepSeek. No duplicar el SVG en assets nativos ni componerlo con texto.
La barra abierta de 272 px usa 24 px de alto, con BETA debajo para conservar
el espacio del botón de contraer y la zona de respeto horizontal. La contraída
solo muestra la Λ. Ctrl+B conserva su comportamiento.

## Overlays: autoría directa

Usar la [guía Workshop](overlays-studio/overlay-workshop-authoring-guide.md). [WidgetVisualHost](../frontend/src/overlay/core/WidgetVisualHost.tsx) es la frontera común para Studio, Desktop, OBS y Workshop. El [catálogo oficial](../frontend/src/overlay/design-systems/official-designs.ts) y los [manifests y tokens](../frontend/src/overlay/design-systems/) indican sistemas, diseños y compatibilidad existentes.

Los renderizadores reciben ViewModels puros; no leen persistencia, permisos, Wails/SSE ni posición. Editar el TSX/CSS productivo; HTML es referencia visual. Mantener estados de datos y ausencia de datos distinguibles y validar la superficie afectada.

## Verificación

Los scripts exactos están en [package.json](../frontend/package.json); la preparación está en [operaciones](operations.md) y [pruebas](testing-strategy.md). Elegir el protocolo Orbit o Workshop correspondiente. Una captura del prototipo no demuestra paridad del runtime.

## Referencia histórica

El inventario anterior mezclaba tokens, componentes retirados, tres sistemas antiguos y pendientes de normalización. Se conserva [completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/DESIGN.md). Sus rutas y recuentos no son instrucciones para reconstruir código eliminado.
