# Contrato de Renderizado y Preview de Widgets

Guia obligatoria para workers que creen, modifiquen o depuren widgets en Vantare v2.

Ultima actualizacion: 2026-06-26.

---

## Indice

1. [Mapa de superficies de render](#1-mapa-de-superficies-de-render)
2. [Responsabilidades de cada componente](#2-responsabilidades-de-cada-componente)
3. [Tipos de sizing](#3-tipos-de-sizing)
4. [Contrato para crear un widget nuevo](#4-contrato-para-crear-un-widget-nuevo)
5. [Reglas especificas](#5-reglas-especificas)
6. [Antipatrones detectados historicamente](#6-antipatrones-detectados-historicamente)
7. [Checklist de QA manual para cada widget](#7-checklist-de-qa-manual-para-cada-widget)
8. [Ejemplo: Pedals](#8-ejemplo-pedals)
9. [Ejemplo: Relative / Standings](#9-ejemplo-relative--standings)
10. [Criterios de aceptacion para futuros widgets](#10-criterios-de-aceptacion-para-futuros-widgets)

---

## 1. Mapa de superficies de render

Cada superficie tiene un proposito distinto. El mismo widget debe funcionar en todas sin cambios de ultimo momento.

### 1.1 WidgetStudio sandbox

- **Archivo**: `WidgetSandboxPreview.tsx`
- **Proposito**: preview aislada del widget en el editor de apariencia.
- **NO usa**: `PreviewWidgetFrame`, posicion absoluta, drag/resize, frame chrome.
- **Usa**: `WidgetRenderer` + `PreviewScaler`.
- **Sizing**: intrinseco para widgets configurables (`relative`, `standings`); declared (`position.w/h`) para el resto.
- **Regla**: debe envolver el contenido real. No debe dejar espacio vacio a la derecha.
- **Renderer**: `fillHost` es `true` por defecto, `false` cuando el sizing es intrinseco.

### 1.2 LayoutStudio canvas

- **Archivo**: `PreviewCanvas.tsx` + `PreviewWidgetFrame.tsx`
- **Proposito**: editar posicion y tamano de widgets en un canvas 1920x1080 escalado.
- **Usa**: `PreviewWidgetFrame` con drag/resize.
- **Sizing**: siempre `position.w/h`. NO usa sizing intrinseco.
- **Regla**: muta `position.x/y/w/h`, nunca apariencia interna.

### 1.3 Runtime desktop (CompositeApp)

- **Archivo**: `CompositeApp.tsx`
- **Proposito**: overlay real sobre la ventana de escritorio (Wails).
- **Usa**: `WidgetHost` + `WidgetRenderer` (inline, sin capa intermedia).
- **Sizing**: `WidgetHost` escala el widget al `position.w/h` del layout.
- **Transport**: `__engineerTransport: "wails"`.
- **Telemetria**: `"live"`.

### 1.4 OBS overlay

- **Archivo**: `ObsOverlayApp.tsx`
- **Proposito**: fuente de navegador para OBS Studio.
- **Usa**: `WidgetHost` (identico a desktop), perfil via HTTP fetch, telemetria via SSE.
- **Sizing**: identico a runtime desktop.
- **Transport**: `__engineerTransport: "sse"`.
- **Telemetria**: `"live"`.

### 1.5 Profile / mini previews

- **Archivo**: `PreviewWidgetFrame.tsx` (reutilizado en `ProfilePreview`)
- **Proposito**: miniaturas de perfil en pantallas de "Mis perfiles" y "Recomendados".
- **Usa**: `PreviewWidgetFrame` con `scale` propio.
- **Sizing**: escala proporcionamente dentro del frame disponible.
- **Regla**: esta superficie no debe confundirse con el sandbox de `WidgetStudio`.

---

## 2. Responsabilidades de cada componente

### 2.1 WidgetStudio

- **Que hace**: edita apariencia interna, columnas, metricas, filtros, formatos, variantes.
- **Que NO hace**: editar X/Y/W/H, borrar widgets, abrir/detener overlay, mutar layout global.
- **Previsualizacion**: usa `WidgetSandboxPreview`, nunca `PreviewWidgetFrame`.
- **Regla de oro**: si necesitas posicion/tamano, no estas en `WidgetStudio`.

### 2.2 LayoutStudio

- **Que hace**: mover, redimensionar, activar/desactivar instancias, guardar layout, abrir/detener overlay.
- **Que NO hace**: editar columnas, metricas, filtros, formatos, temas internos.
- **Render**: usa `PreviewCanvas` + `PreviewWidgetFrame`.
- **Regla de oro**: si necesitas columnas o apariencia, no estas en `LayoutStudio`.

### 2.3 WidgetRenderer

- **Archivo**: `WidgetRenderer.tsx`
- **Que hace**: resuelve el componente correcto segun `widget.type`, enriquece props con variantes, propaga contexto runtime (`__previewFillHost`, `__engineerTransport`).
- **Sizing**: por defecto llena el host con `w-full h-full`.
- **fillHost=false**: usa `width: fit-content` para que el widget se mida por su contenido.
- **NO registra transports reales** en preview; usa `__engineerTransport: "none"`.
- **Registro**: el mapping `WIDGETS` debe contener todo tipo de widget soportado.

### 2.4 PreviewScaler

- **Archivo**: `PreviewScaler.tsx`
- **Que hace**: centra y escala una caja logica dentro de su contenedor.
- **Default**: `maxScale=1` (solo reduce si no cabe, nunca amplia).
- **NO decide** contratos de widget. Solo escala lo que recibe.
- **Uso**: exclusivo de `WidgetSandboxPreview`. No usado en `LayoutStudio`.

### 2.5 WidgetHost

- **Archivo**: `WidgetHost.tsx`
- **Que hace**: runtime desktop/OBS. Coloca el widget en posicion absoluta, escala segun `baseSize` vs `position.w/h`.
- **Sizing**: calcula `scale = min(visualPos.w / baseSize.width, visualPos.h / baseSize.height)`.
- **Sin baseSize**: renderiza el widget directamente sin escalado (widgets que llenan el host como Delta).
- **Regla**: respeta el contrato visual; no modifica apariencia interna.

### 2.6 widget-base-size

- **Archivo**: `widget-base-size.ts`
- **Que hace**: calcula tamano base para widgets proporcionales (`relative`, `standings`).
- **Uso**: `WidgetHost` y `PreviewWidgetFrame` para escalado proporcional.
- **Null**: para widgets sin base size (Delta, Telemetry, Pedals), retorna `null` y se usa sizing directo.
- **Regla**: toda constante de altura debe estar aqui (header, row, footer, borders).

### 2.7 widget-preview-size

- **Archivo**: `widget-preview-size.ts`
- **Que hace**: calcula el tamano intrinseco para el sandbox de `WidgetStudio`.
- **Modos**: `"declared"` (usa `position.w/h`) vs `"intrinsic"` (ancho real de columnas).
- **Uso exclusivo**: `WidgetSandboxPreview.tsx`. No se usa en runtime ni LayoutStudio.
- **Regla**: no mutar `position.w/h`; el modo intrinsic es solo visual, no persistente.

---

## 3. Tipos de sizing

### 3.1 Fill host

Usa `position.w/h` como tamano del contenedor. El widget se estira al 100% del host.

- **Widgets**: `delta`, `telemetry`, `telemetry-vertical`.
- **Render**: `fillHost=true` en `WidgetRenderer`.
- **En WidgetStudio**: el sandbox usa `position.w/h` como base.
- **En runtime**: `WidgetHost` escala el widget al area definida en `position.w/h`.

### 3.2 Intrinsic width

El ancho lo determina el contenido (columnas activas + paddings). No depende de `position.w`.

- **Widgets**: `relative`, `standings` en modo configurable.
- **Cuando se activa**: en `WidgetSandboxPreview` cuando `baseSize.mode === "intrinsic"`.
- **Mecanismo**: `WidgetRenderer` con `fillHost=false` → `width: fit-content`.
- **Widget debe**: usar `width: intrinsicWidth` o `width: max(100%, intrinsicWidth)` segun contexto.
- **Importante**: en `LayoutStudio` y runtime, estos widgets SIGUEN usando `position.w/h`.

### 3.3 Proportional scaling

El widget tiene un `baseSize` (width x height) y el runtime lo escala para llenar `position.w/h` manteniendo aspect ratio.

- **Widgets**: `relative`, `standings` (cuando tienen baseSize).
- **Donde se calcula**: `widget-base-size.ts` → `getWidgetBaseSize()`.
- **Runtime**: `WidgetHost` y `PreviewWidgetFrame` escalan via `transform: scale()`.
- **Regla**: el widget renderiza a su tamano natural; el contenedor lo escala. El widget NO debe calcular su propio scaling.

### 3.4 Compact height

El alto se determina por el contenido real, no por `position.h`. Usado en modo compacto de Relative.

- **Widget**: `relative` con `rowHeightMode === "compact"`.
- **En WidgetStudio**: `minimumHeight = 1` (sin piso visual).
- **En runtime**: sigue siendo proportional scaling; `widget-base-size` calcula altura compacta determinista.

### 3.5 Transparent widgets pequenos (Pedals)

Widgets con fondo transparente y tamano reducido. No tienen baseSize, no escalan proporcionalmente.

- **Widget**: `pedals` (90x100 default).
- **Sizing**: fill host. Ocupa el area de `position.w/h`.
- **PreviewWidgetFrame**: como no tiene baseSize, renderiza directamente sin scaler.
- **Regla**: si el widget parece pequeno en preview, verificar que `position.w/h` en el perfil coincida con lo esperado.

---

## 4. Contrato para crear un widget nuevo

Checklist obligatorio de archivos a tocar:

### 4.1 Componente del widget

- `frontend/src/overlay/widgets/<Name>Widget.tsx`
- Props que recibe: `{ editMode, telemetryMode?, mockSessionScenario?, updateHz?, props? }`
- Debe leer `__previewFillHost` de `props` para saber si esta en sandbox intrinseco.
- No debe usar `position.w/h` directamente (el runtime se lo da via `WidgetHost`).

### 4.2 Test del widget

- `frontend/src/overlay/widgets/<Name>Widget.test.tsx`
- Tests table-driven para logica de formato si aplica.
- Test de render con mock telemetry.
- Test de modo fill vs intrinseco si aplica.

### 4.3 Registro en WidgetRenderer

- `frontend/src/hub/preview/WidgetRenderer.tsx`
- Anadir a `WIDGETS` map.
- Anadir import.

### 4.4 Registro en CompositeApp / ObsOverlayApp

- `frontend/src/overlay/CompositeApp.tsx` (desktop runtime)
- `frontend/src/overlay/ObsOverlayApp.tsx` (OBS runtime)
- Anadir a `WIDGETS` map en ambos.
- Anadir imports en ambos.

### 4.5 Default size en widget-factory

- `frontend/src/lib/widget-factory.ts`
- Anadir entrada en `DEFAULT_WIDGET_SIZES` con `{ w, h, updateHz }`.

### 4.6 Style defaults en style-catalog

- `frontend/src/hub/state/style-catalog.ts`
- Anadir entrada en `CATALOG` con `StyleEntry` que tenga `id`, `name` y `defaults` (objeto `WidgetAppearance`).

### 4.7 Base size en widget-base-size (si requiere resize proporcional)

- `frontend/src/overlay/widgets/widget-base-size.ts`
- Solo si el widget necesita escalado proporcional en `WidgetHost`/`PreviewWidgetFrame`.
- Anadir logica en `getWidgetBaseSize()`.

### 4.8 Intrinsic size en widget-preview-size (si necesita sandbox intrinseco)

- `frontend/src/hub/preview/widget-preview-size.ts`
- Solo si el widget debe medirse por su contenido en `WidgetStudio` (como relative/standings).
- Anadir logica en `computeIntrinsicWidth()`.

### 4.9 Settings section (si tiene configuracion propia)

- Crear `frontend/src/hub/overlays/<Name>SettingsSection.tsx`
- Registrarla en `WidgetSettingsPanel.tsx`.
- La seccion solo se renderiza para su tipo de widget; retorna `null` para otros.

### 4.10 Tests de preview / layout / runtime

- Verificar que `WidgetSandboxPreview`, `PreviewWidgetFrame` y `WidgetHost` funcionan con el nuevo widget.
- Tests de `WidgetRenderer` que confirmen que el tipo se resuelve.
- Tests de integracion en `WidgetStudio` y `LayoutStudio`.

### 4.11 docs/current-plan

- Si el widget cambia el estado del roadmap, actualizar `docs/current-plan.md`.

---

## 5. Reglas especificas

### 5.1 No usar mocks visuales estaticos dentro de widgets si ya existe telemetria normalizada

Si el widget recibe `telemetryMode="mock"`, debe usar `getMockTelemetry()` o `getMockTelemetryForSession()`. No hardcodees datos de ejemplo dentro del render.

### 5.2 No calcular tamano desde DOM si puede ser determinista

Los tamanos de widgets proporcionales (relative, standings) se calculan en `widget-base-size.ts` con constantes deterministas. No midas el DOM para decidir alturas.

### 5.3 No tocar schema para configuracion visual si cabe en `props.appearance`

La configuracion visual (colores, opacidad, fondo) va en `WidgetAppearance`. No crees campos nuevos en el schema de perfil si ya existe un mecanismo de apariencia.

### 5.4 No anadir dependencias UI

No anadir librerias UI sin aprobacion. Usa Tailwind y los componentes existentes.

### 5.5 No permitir autosave en pantallas de edicion

`WidgetStudio` y `LayoutStudio` requieren guardado explicito. `autosave: false` debe respetarse. Ni Ctrl+S ni cambios en variantes deben persistir automaticamente.

### 5.6 No registrar transports reales en preview

En `WidgetRenderer`, el prop `__engineerTransport` debe ser `"none"` cuando se renderiza en preview/hub. Solo `CompositeApp` y `ObsOverlayApp` usan transports reales (`"wails"` / `"sse"`).

### 5.7 Separacion WidgetStudio vs LayoutStudio

- `WidgetStudio` NO tiene boton de abrir/detener overlay.
- `LayoutStudio` NO expone columnas, filtros ni apariencia interna.
- `StudioWidgetList` solo muestra `onAddWidget` cuando se usa en `LayoutStudio`.

---

## 6. Antipatrones detectados historicamente

### 6.1 Preview usando `position.w/h` cuando debia abrazar contenido

**Problema**: relative/standings en sandbox usaban `position.w` como ancho minimo, dejando espacio vacio a la derecha.

**Solucion**: `resolveWidgetPreviewBaseSize` ahora retorna `mode: "intrinsic"` para widgets configurables. El sandbox usa `width: fit-content`.

**Referencia**: bug log entrada 8, `widget-preview-bug-log.md`.

### 6.2 Widget dejando espacio vacio a la derecha

**Problema**: RelativeWidget usaba `w-full` incluso en compacto. Las filas se estiraban al ancho del host aunque el contenido fuese menor.

**Solucion**: en modo intrinseco, el widget usa `inline-flex` y ancho fijo = `intrinsicWidth`. Las filas usan `width: intrinsicWidth` en vez de `width: max(100%, intrinsicWidth)`.

### 6.3 Resize horizontal deformando standings/relative

**Problema**: al redimensionar, standings/relative perdian aspect ratio porque `normalizeWidgetVisualRect` no se aplicaba correctamente.

**Solucion**: `normalizeWidgetVisualRect` en `widget-base-size.ts` corrige la altura proporcionalmente al ancho. `resizeWithRatio` preserva aspect ratio cuando hay baseSize.

### 6.4 Build viejo abierto y confusion con cambios no visibles

**Problema**: workers modificaban codigo pero el build cacheado no reflejaba los cambios.

**Leccion**: ejecutar `pnpm --dir frontend build` o verificar con `pnpm --dir frontend test` antes de declarar un cambio como listo.

### 6.5 Widgets nuevos sin factory / default size

**Problema**: al anadir un widget nuevo via `addWidget()`, no existia en `DEFAULT_WIDGET_SIZES` y aparecia con tamano 200x100 generico.

**Solucion**: `widget-factory.ts` debe incluir todo tipo de widget con dimensiones recomendadas.

### 6.6 Settings duplicados entre seccion dedicada y AppearanceEditor

**Problema**: Pedals tenia color de acelerador en `AppearanceEditor` (campos genericos) y tambien en `PedalsSettingsSection` (campos especificos). Conflicto de origen de verdad.

**Solucion**: los defaults de `style-catalog.ts` son la unica fuente de verdad para apariencia. La seccion dedicada lee y escribe sobre esos mismos campos. No duplicar.

### 6.7 WidgetStudio intentando hacer tareas de LayoutStudio

**Problema**: workers intentaban anadir botones de eliminar, mover, o cambiar tamano desde `WidgetStudio`.

**Leccion**: `WidgetStudio` solo toca apariencia/datos. Cualquier necesidad de posicion/tamano pertenece a `LayoutStudio`.

---

## 7. Checklist de QA manual para cada widget

Por cada widget nuevo o modificado, verificar:

1. **WidgetStudio preview**: el widget se ve centrado en el checkerboard, sin espacio vacio a la derecha, sin clipping.
2. **LayoutStudio resize/move**: el widget se redimensiona y arrastra correctamente en el canvas 1920x1080.
3. **Runtime desktop**: al abrir overlay, el widget aparece en la posicion y tamano correctos.
4. **OBS**: el widget se ve identico al runtime desktop cuando se carga como fuente de navegador.
5. **Perfil recomendado**: cambiar a un perfil recomendado y verificar que el widget se renderiza con los defaults del catalogo.
6. **Mock/live**: alternar entre datos mock y live; el widget responde sin errores.
7. **Pequeno/grande**: redimensionar el widget al minimo y maximo permitido; no debe romperse ni solaparse.
8. **Transparente/fondo**: si el widget soporta fondo transparente, verificar que funcione en runtime y OBS (sin fondo negro no deseado).
9. **Guardar explicito**: hacer cambios en WidgetStudio, NO pulsar Guardar, salir y volver; los cambios deben perderse (no autosave).

---

## 8. Ejemplo: Pedals

### 8.1 Diseno

- 3 barras verticales: `CLT` (clutch, izquierda, `#3aa6c8`), `BRK` (freno, centro, `#e63946`), `THR` (acelerador, derecha, `#34d399`).
- Fondo transparente por defecto.
- Track de barra fijo `#0a0a0a` (no configurable).
- Tamano base recomendado: 90x100, 30 Hz.

### 8.2 Por que la preview puede verse pequena

Pedals no tiene `baseSize` (no escala proporcionalmente). En `PreviewWidgetFrame` y `WidgetHost`, sin baseSize se renderiza directo sin escalado. Si el `position.w/h` en el perfil es 90x100, el widget ocupara exactamente 90x100 pixels en el canvas. En una ventana de 1920x1080 escalada al viewport, 90x100 puede parecer pequeno.

**Esto es correcto**. Pedals es un widget pequeno para broadcast minimal.

### 8.3 Como verificar que es correcto

1. En `WidgetStudio`: la preview debe mostrar las 3 barras una al lado de otra, sin espacio extra, centradas en el checkerboard.
2. En `LayoutStudio`: el frame debe ser 90x100 (o el tamano definido en el perfil).
3. En runtime desktop y OBS: las barras deben verse a escala real, con fondo transparente (no debe haber rectangulo negro detras).

### 8.4 Cuando ajustar widget-base-size o widget-preview-size

- `widget-base-size`: solo si Pedals necesitara escalado proporcional (ej. que al agrandar el frame las barras crezcan manteniendo proporcion).
- `widget-preview-size`: solo si Pedals necesitara modo intrinseco (ej. que el sandbox mida el contenido real en vez de usar `position.w`).

Actualmente ninguno de los dos aplica. Pedals es fill host simple.

---

## 9. Ejemplo: Relative / Standings

### 9.1 Diseno

Ambos son widgets configurables con:
- **Intrinsic width**: el ancho se calcula desde las columnas activas + paddings.
- **Columnas opcionales**: cada columna tiene `enabled`, `width`, `format`, `style`.
- **Compact/fill height**: Relative soporta `rowHeightMode === "compact"` con altura real por contenido, calculada de forma determinista como `68 + rowCount * 31` px, y modo fill usando `position.h`.
- **Resize proporcional**: en LayoutStudio y runtime, se escalan manteniendo aspect ratio via `widget-base-size`.

### 9.2 Intrinsic width

- Calculado por `getRelativeIntrinsicWidth()` / `getStandingsIntrinsicWidth()`.
- En `WidgetStudio`: el sandbox usa este ancho (modo intrinsic).
- En el widget: cuando `fillHost=false`, las filas usan `width: ${intrinsicWidth}px`.
- Cuando `fillHost=true`, las filas usan `min-width: ${intrinsicWidth}px; width: max(100%, ${intrinsicWidth}px)`.

### 9.3 Compact height (Relative)

- `getRelativeCompactHeight()` calcula altura determinista: `RELATIVE_COMPACT_NON_ROW_HEIGHT + rowCount * RELATIVE_COMPACT_ROW_HEIGHT` (actualmente `68 + rowCount * 31` px).
- En sandbox: `minimumHeight = 1` (sin piso visual).
- En runtime: `widget-base-size` retorna la altura compacta, `WidgetHost` escala sobre ella.
- En fill: la altura se reparte entre filas via `container.clientHeight`.

### 9.4 Resize proporcional

- `PreviewWidgetFrame` y `WidgetHost` usan `baseSize` para escalar.
- `normalizeWidgetVisualRect` recalcula la altura para mantener aspect ratio (ancho fijo, altura derivada).
- `resizeWithRatio` en LayoutStudio mantiene proporcion durante el drag de resize.
- Sin baseSize, el resize es libre (como en Delta).

---

## 10. Criterios de aceptacion para futuros widgets

Un widget nuevo se considera listo cuando:

1. **Renderiza correctamente** en WidgetStudio sandbox, LayoutStudio canvas, runtime desktop y OBS.
2. **No deja espacio vacio** a la derecha ni abajo en la preview de WidgetStudio.
3. **Tiene default size** en `widget-factory.ts` con dimensiones y Hz optimos.
4. **Tiene style defaults** en `style-catalog.ts`.
5. **Tiene baseSize** en `widget-base-size.ts` si es proporcional.
6. **Tiene intrinsic size** en `widget-preview-size.ts` si es configurable.
7. **Esta registrado** en `WidgetRenderer`, `CompositeApp` y `ObsOverlayApp`.
8. **Tiene tests**: unitarios del widget, tests de formato si aplica, tests de integracion si tiene settings section.
9. **No tiene dependencias UI nuevas**.
10. **No tiene autosave**.
11. **No usa mocks estaticos** si existe telemetria mock normalizada.
12. **No calcula tamano desde DOM** si puede ser determinista.
13. **Respeta `__previewFillHost`** para saber si esta en sandbox intrinseco o fill host.
14. **Transporte**: `__engineerTransport: "none"` en preview, `"wails"` en desktop, `"sse"` en OBS.
15. **QA manual**: pasa los 9 puntos de la [checklist de QA](#7-checklist-de-qa-manual-para-cada-widget).

---

## 11. Contrato de ventana desktop Wails

El overlay desktop de carrera no es una preview ni una fuente OBS. Es una ventana Wails transparente colocada sobre el escritorio.

Contrato obligatorio:

- `ModeRacing`: ventana fullscreen, click-through (`SetIgnoreMouseEvents(true)`), no resizable, `layoutOrigin={0,0}`.
- `ModeEdit`: ventana fullscreen, interactiva (`SetIgnoreMouseEvents(false)`), resizable/interactiva para drag/resize, `layoutOrigin={0,0}`.
- No usar shrink-wrap en `ModeRacing` ni en `ModeEdit` del runtime desktop.
- No llamar a `applyShrinkWrap` desde el camino que abre o actualiza la ventana desktop de carrera.
- Si la ventana es fullscreen, el frontend debe recibir origen cero. Mezclar fullscreen visual con `layoutOrigin` shrink-wrap desplaza widgets.
- Si la ventana es shrink-wrap, el frontend debe recibir el mismo origen calculado por la ventana. Mezclar shrink-wrap con origen cero recorta o desplaza widgets.

`applyShrinkWrap` solo puede usarse en superficies que realmente trabajen con ventana ajustada al contenido y que propaguen su origen calculado al frontend. No es el contrato del overlay desktop para testers.

Antes de tocar `internal/window/manager.go`, `ProfileService.EmitLoaded`, `OverlayController` o la factoria Wails de overlay:

```powershell
go test ./cmd/vantare/... ./internal/app/... ./internal/window/...
go test ./...
git diff --check
```

Checklist manual minimo:

1. Abrir overlay normal: debe ocupar toda la pantalla aunque los widgets esten en posiciones absolutas 1920x1080.
2. Verificar que en carrera el mouse atraviesa la ventana.
3. Pulsar `Ctrl+Shift+E`: debe seguir fullscreen, pero con mouse interactivo y chrome de edicion.
4. Salir de edit mode: debe volver a fullscreen click-through, sin recorte ni desplazamiento.
5. Abrir `Mis perfiles -> Editar layout`: el canvas de la app no debe confundirse con la ventana desktop real.

---

## Referencias

- Bug log historico: `docs/widget-preview-bug-log.md`
- Bugs resueltos: `docs/resolved-bugs.md`
- Arquitectura: `docs/feature-architecture-map.md`
- Plan actual: `docs/current-plan.md`
- Plan sandbox preview: `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`
- Plan intrinsic width: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`
