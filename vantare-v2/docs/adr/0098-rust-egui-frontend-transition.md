# ADR 0098 · Transición del frontend y overlays a Rust + egui

Estado: decisión de producto confirmada por Isaac el 29/09/2026; implementación y cutover pendientes. Tarea [VAN-779](https://app.notion.com/p/3e9e51695c6581fabd90d1e7efc3ad13), puente técnico [#1414](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1414).

## Contexto

El frontend y overlays actuales usan Wails/WebView2, React y CSS. Isaac eligió Rust + egui para todas las superficies visuales de Vantare, Windows primero, buscando menor consumo, control nativo y corrección de defectos existentes. El núcleo Go se conserva inicialmente. No se ha decidido sustituirlo completamente en este corte.

## Decisión

- Implementar la UI y las ventanas de overlay en Rust con egui/eframe sobre wgpu. Evitar WebView2 en el destino.
- Conservar una sola representación visual por componente y ViewModels independientes del renderer. Durante la transición, `WidgetVisualHost` sigue siendo la frontera productiva de React; la futura frontera Rust debe sustituirla de forma trazada, no mantener dos productos indefinidos.
- Mantener cálculos, sincronización temporal, unidades y reglas de telemetría fuera del código de dibujo. Consumir contratos existentes del núcleo Go antes de mover lógica.
- Separar estado de UI (último snapshot visible) de captura y grabación (contratos de muestras completas). Repintar por cambio y programar repintado para caducidad, reloj y animaciones.
- Exigir comparación con la versión actual del Hub y con cada widget migrado. Ninguna diferencia visual se acepta de forma silenciosa. La equivalencia funcional, Windows/OBS y consumo deben probarse antes del cutover.

## Primer corte

La tarea VAN-779 contiene dos pruebas pequeñas: Standings Efficiency conectado al proyector Go y una porción exigente de Inicio/Orbit. La referencia de Inicio se congela en `native-egui/evidence/hub-reference` desde el frontend actual, con condiciones documentadas. Una captura del harness no equivale a prueba física en Wails. La integración de dos curvas y una vista 3D queda como gate temprano posterior, antes de portar el analizador completo.

## Relación con decisiones anteriores

Este ADR establece el destino y la transición. No revoca los contratos funcionales de [ADR 0003](0003-overlay-studio-v3-rebuild.md) ni [ADR 0093](0093-overlay-studio-autosave-history.md). La eliminación de React/Wails, la adaptación de Studio/OBS y la sustitución de Go requieren tareas y aceptación específicas. Ningún prototipo se activa en el producto por este ADR.
