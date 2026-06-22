# Plan actual

Ultima actualizacion: 2026-06-22.

## Estado actual

Vantare v2 es una app local de overlays para sim racing construida con Go/Wails y React/TypeScript.

Base de schema v2 para perfiles preparada:
- `schemaVersion: 2` permite layouts por sesion y variantes de widgets.
- `layouts.general.widgets` existe como layout obligatorio en perfiles v2.
- `widgets` se mantiene como espejo de compatibilidad durante la transicion.
- Los perfiles legacy sin `schemaVersion` siguen cargando sin migracion silenciosa.

Primer corte configurable de `Relative` preparado:
- Existe catalogo frontend para metricas/columnas del `Relative` inicial.
- `bestLap` y `lastLap` se modelan como columnas opcionales persistentes en variantes schema v2.
- `WidgetStudio` puede activar/desactivar esas columnas sin tocar posicion ni tamano.
- Preview, overlay desktop y OBS leen la variante referenciada por cada widget.

Formatos iniciales de columnas de `Relative` preparados (Task 6):
- El nombre de piloto ya no se recorta automaticamente al activar columnas opcionales.
- El recorte de nombre es una opcion explicita de la variante.
- `bestLap` y `lastLap` soportan formato completo/compacto, decimales, ancho, color y alineacion.
- La preview aislada de `WidgetStudio` usa el ancho intrinseco del `Relative` cuando las columnas requieren mas espacio.
- Verificacion manual aprobada: las columnas se activan, se guardan, se expanden sin recortar y mantienen alineacion por filas.

Filtros iniciales de `Relative` preparados:
- `rangeAhead` y `rangeBehind` son configurables desde `WidgetStudio`.
- El filtro de clase permite mostrar todas las clases o solo la misma clase del jugador.
- El coche del jugador puede mostrarse u ocultarse.
- Los filtros se guardan en `variant.filters`.
- Los perfiles legacy con `props.rangeAhead` y `props.rangeBehind` siguen funcionando.

Catalogo inicial de `Standings` preparado (S2):
- `frontend/src/overlay/widgets/standings-catalog.ts` define metricas y columnas sin UI ni render.
- Columnas default estables: `position`, `driverNumber`, `driverName`, `gap` habilitadas; `vehicleClass`, `currentLap`, `interval`, `bestLap`, `lastLap` deshabilitadas.
- Metrica `playerHighlight` disponible como stable no-columna para futuro resaltado.
- Metricas `pitInfo`, `distance` y `deltaLapTime` quedan como `tester` sin habilitar por defecto.
- No se incluyen multiclass ni metricas no confirmadas en el primer corte.
- Tests focalizados pasan; TypeScript pasa.

Variantes y persistencia frontend de `Standings` preparadas (S3, aprobada por GLM):
- `withDefaultWidgetVariants`, `toggleStandingsColumn`, `enrichWidgetPropsWithVariant` y `normalizeStandingsVariant` soportan `widget.type === "standings"`.
- Standings reusa el sistema de variantes schema v2 ya usado por `Relative`.
- Legacy sin `variantId`/`variants`/`schemaVersion` se normaliza a `variant-${widget.id}-default` con columnas default.
- `normalizeStandingsVariant` preserva overrides de usuario (width, format, style) y descarta columnas desconocidas.
- Idempotencia por identidad garantizada (con `deepEqual`) tanto para Relative como Standings.
- `enrichWidgetPropsWithVariant` no fuerza `templateId` para tipos no relative/standings (queda undefined si el variant no lo define).
- 37 tests focalizados pasan; suite completa 267/267; tsc y build OK.
- No se toco renderer, UI, backend, schema ni configs.

La Fase A de `Overlays Studio` se encuentra completada:
- La navegacion visible unifica `Overlays` y `Preview` bajo `Overlays Studio`.
- `Overlays Studio` sustituye la antigua entrada visible a `Preview` como flujo principal de edicion.
- `WidgetStudio` permite editar aspecto/comportamiento de widgets.
- `LayoutStudio` contiene la edicion de layout, colocacion y tamano.
- `Widgets` no expone posicion/tamano/eliminar (responsabilidad exclusiva de `LayoutStudio`).

Fase A2 de Overlays Studio completada:
- Home convertida en cuatro paneles grandes clicables: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Cada panel es un `button` con aria-label, hover/focus states y toda la tarjeta como target de click.
- `Widgets` panel abre el editor de widgets existente.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews reales renderizadas.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Proximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
- `ProfilePreview` reutiliza `PreviewWidgetFrame` existente para renderizar widgets reales en miniatura de forma responsive.
- Backend `hub:list` ahora incluye `Profile` completo en cada `ProfileEntry` para permitir previews de perfiles propios.

Fase B de Overlays Studio (Widget Previews) estabilizada:
- `WidgetPreviewPanel` ya no usa `PreviewWidgetFrame`.
- `WidgetStudio` usa una preview aislada basada en `WidgetRenderer`, `PreviewScaler` y `WidgetSandboxPreview`.
- `PreviewWidgetFrame` queda reservado para layout/profile previews.
- `Relative` compacto fue validado manualmente: sin clipping, sin espacio vacio derecho y centrado en el checkerboard.
- Los hallazgos y antipatrones quedan documentados en `docs/widget-preview-bug-log.md`.
- Plan ejecutado: `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`.

Controles live restaurados dentro de Overlays Studio:
- `Mis perfiles` muestra `Abrir overlay` / `Detener overlay` por perfil.
- `LayoutStudio` muestra `Abrir overlay` / `Detener overlay` para el perfil activo.
- `WidgetStudio` no muestra controles live de forma intencionada.
- El inicio y parada reutilizan los eventos Wails existentes: `overlay:start`, `overlay:stop`, `overlay:status`.
- `Abrir overlay` se deshabilita mientras el layout tiene cambios sin guardar o se está guardando.

## Objetivo actual

La validacion manual del primer corte configurable de `Relative` ya fue aprobada por el usuario en app real.

La verificacion A1 de separacion `WidgetStudio`/`LayoutStudio` fue aprobada con veredicto `PASS`.
El inventario S1 de `Standings` fue aprobado con veredicto `READY FOR S2`; no requiere backend/schema para el primer corte.

El siguiente paso recomendado es:

1. ejecutar `S4 - Standings render configurable en preview/desktop/OBS`,
2. integrar el catalogo/variantes con el renderer de `Standings` respetando `enabled`/`width`/`format`/`style`,
3. preparar `S5 - Standings UI en WidgetStudio`.

Ultimo miniplan completado y aprobado por GLM:
- `docs/superpowers/plans/2026-06-22-s3-standings-variants-frontend.md`
  - Variantes/persistencia frontend de `Standings` integradas en `widget-variants.ts`.
  - Tests TDD pasando; suite completa 267/267 verde; tsc y build OK.
  - Sin cambios en UI, render, backend, schema ni configs.
  - Review GLM: ACCEPT tras corregir P2 (fallback templateId) y P3-5 (edge case tests).

Miniplan implementado tecnicamente:
- `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`
  - `WidgetRenderer` extraido y reutilizable; `PreviewWidgetFrame` reducido a chrome de layout.
  - `PreviewScaler` creado como componente generico sin logica de widgets.
  - `WidgetSandboxPreview` creado como sandbox aislado para `WidgetStudio`.
  - `WidgetPreviewPanel` ahora delega en `WidgetSandboxPreview` y deja de usar `PreviewWidgetFrame`.
  - `position.x/y` se ignoran en el sandbox; `position.w/h` no se modifican.
  - Ajustes P1 de review corregidos: compact mode mide altura/ancho real sin conservar `position.h/w` como minimo visual, y `WidgetRenderer` llena el host por defecto.
  - Validacion manual aprobada: Relative compacto queda centrado, sin espacio vacio derecho y con columnas alineadas.
  - Bug log: `docs/widget-preview-bug-log.md`.

### Reconexión live-first aprobada para overlays

- Al pulsar `Abrir overlay`, la app intenta reconectar con LMU antes de abrir la ventana.
- Si LMU no está disponible, el overlay sigue abriendo con datos mock como fallback visual.
- `-live=false` queda como modo explícito de desarrollo/testing.
- La barra superior muestra el estado de la fuente (`LMU conectado`, `Esperando LMU` o `Mock`).

## Proximas tareas pequenas

1. Crear miniplan `S4 - Standings render configurable en preview/desktop/OBS`.
2. Ejecutar S4 con worker (Kimi K2.7).
3. Revisar que el renderer de `Standings` respete `variant.columns` (enabled/width/format/style) sin tocar posicion/tamano.
4. Preparar `S5 - Standings UI en WidgetStudio`.

## Riesgos actuales

- Hay cambios abiertos en git de otros agentes; no mezclar tareas nuevas con ellos sin revisar.
- El README principal puede estar desactualizado respecto a `Overlays Studio`.
- Parte de la documentacion historica vive fuera de `vantare-v2`.
- Los agentes pueden confundir `Widgets` con `LayoutStudio`; mantener separacion estricta.
- Modificar `PreviewWidgetFrame` puede impactar a los mini-previews de perfiles creados en la Fase A2 si no se maneja bien la propiedad de "aislamiento" o "escala".
- La preview aislada de `WidgetStudio` ya esta separada de `PreviewWidgetFrame`; mantener esta separacion y consultar `docs/widget-preview-bug-log.md` antes de tocarla.
- La app ya tiene el flujo principal de edicion, el plan maestro vive en `docs/master-feature-plan.md` y el tablero orquestable vive en `docs/roadmap-execution-board.md`.
- Hallazgos P3 pendientes de resolver (documentados para follow-up):
  1. `columns: []` se normaliza a defaults, lo cual es ambiguo para futuros cortes.
  2. `enrichWidgetPropsWithVariant` normaliza variantes en cada render/tick (impacto menor de rendimiento).
  3. Densidad visual si se activan `bestLap` y `lastLap` en widgets muy pequeños (parcialmente mitigado al usar ancho intrínseco y recorte de nombre explícito).
  4. Queda pendiente crear un harness visual/browser con Playwright para detectar regresiones visuales que JSDOM no cubre.

## Decisiones pendientes

- Si los planes externos deben copiarse, moverse o archivarse dentro de `vantare-v2/docs`.
- Cuando convertir `Perfiles recomendados por Vantare` en perfiles propios editables.
- Si la antigua ruta/pagina `Preview` debe eliminarse definitivamente o mantenerse como compatibilidad interna.
- Que decision ejecutar primero del plan maestro: separar/verificar responsabilidades, inventario de `Standings`, `LayoutStudio` drag/resize, recomendado -> copia editable, mock/live/demo o rework UI.
- Cuando crear un harness visual/browser para previews con Playwright tras estabilizar `WidgetSandboxPreview`.

## No cambiar sin aprobacion

- Stack principal Go + Wails + React/TypeScript.
- Separacion `Widgets` vs `LayoutStudio`.
- Configuracion de build/package.
- Dependencias.
- Formato de perfiles JSON.
- Arquitectura de telemetria LMU.
