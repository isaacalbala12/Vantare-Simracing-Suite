# Plan actual

Ultima actualizacion: 2026-06-19.

## Estado actual

Vantare v2 es una app local de overlays para sim racing construida con Go/Wails y React/TypeScript.

La Fase A de `Overlays Studio` se considera completada a nivel de implementacion:

- La navegacion visible unifica `Overlays` y `Preview` bajo `Overlays Studio`.
- `Overlays Studio` contiene biblioteca de perfiles, widgets, perfiles especificos, recomendados por Vantare y comunidad proximamente.
- `Mis perfiles > Widgets` permite editar aspecto/comportamiento de widgets.
- `Mis perfiles > Perfiles especificos` contiene el editor de layout/colocacion desarrollado en la fase A.
- `Widgets` no debe exponer posicion/tamano/eliminar; eso pertenece a `Perfiles especificos`.

Fase A2 de Overlays Studio completada a nivel de implementacion:

- Home convertida en cuatro paneles grandes clicables: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Cada panel es un `button` con aria-label, hover/focus states y toda la tarjeta como target de click.
- `Widgets` panel abre el editor de widgets existente.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews reales renderizadas.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Proximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
- `ProfilePreview` reutiliza `PreviewWidgetFrame` existente para renderizar widgets reales en miniatura (escala 360/1920).
- Backend `hub:list` ahora incluye `Profile` completo en cada `ProfileEntry` para permitir previews de perfiles propios.
- No se anadieron dependencias. No se cambio backend fuera del contrato `hub:list`.
- Widgets sigue sin exponer controles de posicion/tamano/eliminar (pertenecen a LayoutStudio).
- LayoutStudio sigue mostrando controles de posicion/tamano y ocultando apariencia.

## Objetivo actual

Diseñar e implementar la **Fase B: Real Widget Previews**. Se reemplazará el placeholder de texto en el editor de Widgets por un renderizado real, centrado y aislado del widget, reflejando en tiempo real los cambios de apariencia.

## Dentro de alcance ahora

- Definición del miniplan `v2-fB-widget-preview.md`.
- Implementación de la preview aislada en `WidgetPreviewPanel.tsx`.
- Mock de datos de telemetría para la visualización del widget.
- Reflejar cambios de controles de widget en tiempo real.

## Fuera de alcance ahora

- Refactors de codigo.
- Cambios en el LayoutStudio.
- Dependencias nuevas.
- Community downloads/sharing.
- Cambios en esquema JSON de perfiles.

## Proximas tareas pequenas

1. Aclarar dudas de diseño y tamaño relativo del widget en la preview.
2. Escribir el plan de la **Fase B** en `docs/superpowers/plans/2026-06-19-overlays-studio-phase-b-widget-preview.md`.
3. Enviar worker a ejecutar el plan y realizar QA.

## Riesgos actuales

- Hay cambios abiertos en git de otros agentes; no mezclar tareas nuevas con ellos sin revisar.
- El README principal puede estar desactualizado respecto a `Overlays Studio`.
- Parte de la documentacion historica vive fuera de `vantare-v2`.
- Los agentes pueden confundir `Widgets` con `Perfiles especificos`; mantener separacion estricta.
- Modificar `PreviewWidgetFrame` puede impactar a los mini-previews de perfiles creados en la Fase A2 si no se maneja bien la propiedad de "aislamiento" o "escala".

## Decisiones pendientes

- Si los planes externos deben copiarse, moverse o archivarse dentro de `vantare-v2/docs`.
- Cuando convertir `Perfiles recomendados por Vantare` en perfiles propios editables.
- Si la antigua ruta/pagina `Preview` debe eliminarse definitivamente o mantenerse como compatibilidad interna.

## No cambiar sin aprobacion

- Stack principal Go + Wails + React/TypeScript.
- Separacion `Widgets` vs `Perfiles especificos`.
- Configuracion de build/package.
- Dependencias.
- Formato de perfiles JSON.
- Arquitectura de telemetria LMU.
